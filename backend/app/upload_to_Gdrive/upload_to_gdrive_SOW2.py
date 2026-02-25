import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Form, Depends, Header
from fastapi.responses import HTMLResponse
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import os
import json
import io
import traceback
from concurrent.futures import ThreadPoolExecutor
from app.utils.cache import get as cache_get, set as cache_set, invalidate_prefix as cache_invalidate_prefix
from database.deps import get_db
from app.models.user_credentialsModel import UserCredential
from app.models.appSettingModel import AppSetting
from app.models.userModel import User
from app.auth.me import get_current_user as get_jwt_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gdrive/sow2", tags=["Google Drive - SOW2"])

# ========================================
# HELPER FUNCTION FOR AUTH
# ========================================

async def get_current_user(
    user_email: str = Header(..., alias="X-User-Email"),
    _jwt_user: User = Depends(get_jwt_user),  # Ensures valid app login
    db: Session = Depends(get_db)
) -> UserCredential:
    """Verify JWT, then return the Google OAuth credentials by Google email."""
    user_cred = db.query(UserCredential).filter(
        UserCredential.email == user_email
    ).first()

    if not user_cred:
        raise HTTPException(
            status_code=401,
            detail="Google Drive not connected. Please authorize at /gdrive/sow2/auth/login"
        )

    return user_cred

# Path to credentials.json file
# On Render: set GOOGLE_CREDENTIALS_PATH=/etc/secrets/credentials.json
# Locally: falls back to credentials.json next to this file
_LOCAL_CREDENTIALS = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "credentials.json")
CLIENT_SECRETS_FILE = os.getenv("GOOGLE_CREDENTIALS_PATH", _LOCAL_CREDENTIALS)

def load_client_config():
    """Load OAuth2 client configuration from credentials.json"""
    try:
        with open(CLIENT_SECRETS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail=f"credentials.json not found at {CLIENT_SECRETS_FILE}"
        )
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="credentials.json is not valid JSON"
        )

SCOPES = ['https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid']

def get_redirect_uri():
    """Get redirect URI from credentials.json"""
    config = load_client_config()
    
    if "web" in config:
        redirect_uris = config["web"].get("redirect_uris", [])
    elif "installed" in config:
        redirect_uris = config["installed"].get("redirect_uris", [])
    else:
        return "http://localhost:8000/gdrive/sow2/auth/callback"
    
    for uri in redirect_uris:
        if "localhost" in uri or "127.0.0.1" in uri:
            return uri
    
    return redirect_uris[0] if redirect_uris else "http://localhost:8000/gdrive/sow2/auth/callback"

REDIRECT_URI = get_redirect_uri()

def get_flow():
    """Create OAuth2 flow"""
    try:
        client_config = load_client_config()
        return Flow.from_client_config(
            client_config,
            scopes=SCOPES,
            redirect_uri=REDIRECT_URI
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create OAuth2 flow: {str(e)}"
        )

def get_drive_service(user_id: str, db: Session):
    """Get Google Drive service using stored user credentials from database"""
    user_cred = db.query(UserCredential).filter(UserCredential.user_id == user_id).first()
    
    if not user_cred:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please visit /gdrive/sow2/auth/login first."
        )
    
    # Parse scopes - stored as comma-separated string or JSON array
    scopes_raw = user_cred.scopes
    if scopes_raw:
        try:
            scopes = json.loads(scopes_raw)
        except (json.JSONDecodeError, ValueError):
            scopes = [s.strip() for s in scopes_raw.split(',') if s.strip()]
    else:
        scopes = []

    credentials = Credentials(
        token=user_cred.token,
        refresh_token=user_cred.refresh_token,
        token_uri=user_cred.token_uri,
        client_id=user_cred.client_id,
        client_secret=user_cred.client_secret,
        scopes=scopes
    )
    
    # Auto-refresh expired tokens
    if credentials.expired and credentials.refresh_token:
        from google.auth.transport.requests import Request
        credentials.refresh(Request())
        
        # Save new access token to database
        user_cred.token = credentials.token
        db.commit()
    
    return build('drive', 'v3', credentials=credentials)

def get_user_email_from_token(credentials):
    """Get user email from Google OAuth token"""
    try:
        # Build OAuth2 service to get user info
        service = build('oauth2', 'v2', credentials=credentials)
        user_info = service.userinfo().get().execute()
        email = user_info.get('email')
        
        if not email:
            raise Exception("Email not found in user info")
            
        return email
    except Exception as e:
        logger.error("Error getting user email from Google: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get user email from Google: {str(e)}"
        )

# ========================================
# AUTHENTICATION
# ========================================
@router.get("/auth/token")
async def get_gdrive_token(
    user: UserCredential = Depends(get_current_user),  # ✅ From header
    db: Session = Depends(get_db)
):
    """Return Google OAuth access token for Picker API"""
    try:
        # Create credentials object
        credentials = Credentials(
            token=user.token,
            refresh_token=user.refresh_token,
            token_uri=user.token_uri,
            client_id=user.client_id,
            client_secret=user.client_secret,
            scopes=json.loads(user.scopes) if user.scopes else []
        )
        
        # Auto-refresh if expired
        if credentials.expired and credentials.refresh_token:
            from google.auth.transport.requests import Request
            credentials.refresh(Request())
            
            # Save new access token to database
            user.token = credentials.token
            db.commit()
        
        return {
            "success": True,
            "access_token": credentials.token,
            "expires_at": None,  # Optionally add expiration if stored
            "email": user.email
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get token: {str(e)}")

@router.get("/auth/login")
async def login(user_email: str = None):
    """Step 1: Get Google OAuth URL"""
    try:
        flow = get_flow()
        # Pass user_email in state to link JFCM user with Google account
        state_data = user_email if user_email else "unknown"
        # Force re-consent to fix scope mismatch issues
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='false',  # <-- Don't include old scopes
            prompt='consent',  # <-- Force consent screen with new scopes
            state=state_data
        )
        return {
            "authorization_url": authorization_url,
            "state": state
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@router.get("/auth/callback")
async def callback(code: str, state: str = None, db: Session = Depends(get_db)):
    """Step 2: Handle OAuth callback and save to database (one row per Google account)"""
    try:
        flow = get_flow()
        flow.fetch_token(code=code)
        credentials = flow.credentials

        # Always use Google email as unique key for credentials
        google_email = get_user_email_from_token(credentials)
        jfcm_user_email = state if state and state not in ["unknown", "undefined"] else google_email
        user_id = google_email  # Use Google email as unique key

        # Check if this Google account already exists
        existing_user = db.query(UserCredential).filter(
            UserCredential.user_id == user_id
        ).first()

        if existing_user:
            # Update credentials for this Google account
            existing_user.token = credentials.token
            existing_user.refresh_token = credentials.refresh_token
            existing_user.token_uri = credentials.token_uri
            existing_user.client_id = credentials.client_id
            existing_user.client_secret = credentials.client_secret
            existing_user.scopes = json.dumps(credentials.scopes)
            existing_user.email = google_email
            existing_user.updated_at = datetime.utcnow()
            message = "Google Drive connected successfully!"
        else:
            # Add new Google account
            new_user = UserCredential(
                user_id=user_id,
                email=google_email,
                token=credentials.token,
                refresh_token=credentials.refresh_token,
                token_uri=credentials.token_uri,
                client_id=credentials.client_id,
                client_secret=credentials.client_secret,
                scopes=json.dumps(credentials.scopes)
            )
            db.add(new_user)
            message = "Google Drive connected successfully!"

        db.commit()

        # Return HTML page that closes window and signals success
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connected — JFCM Taytay</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: 'Inter', 'Segoe UI', sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f0f4ff;
        }}
        .card {{
            background: #fff;
            border-radius: 24px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07), 0 20px 60px -10px rgba(99,102,241,0.18);
            padding: 48px 40px 40px;
            width: 380px;
            text-align: center;
            animation: slideUp 0.5s cubic-bezier(0.16,1,0.3,1);
        }}
        @keyframes slideUp {{
            from {{ opacity: 0; transform: translateY(24px); }}
            to   {{ opacity: 1; transform: translateY(0); }}
        }}
        .brand {{
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-bottom: 32px;
        }}
        .brand-dot {{ width: 10px; height: 10px; border-radius: 50%; background: #6366f1; }}
        .brand-dot:nth-child(2) {{ background: #8b5cf6; width: 7px; height: 7px; }}
        .brand-dot:nth-child(3) {{ background: #a78bfa; width: 5px; height: 5px; }}
        .brand-name {{ font-size: 13px; font-weight: 600; color: #6366f1; letter-spacing: 0.08em; text-transform: uppercase; }}
        .icon-wrap {{
            width: 88px; height: 88px; border-radius: 50%;
            background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 24px;
            box-shadow: 0 8px 24px rgba(34,197,94,0.35);
            animation: popIn 0.5s 0.2s cubic-bezier(0.34,1.56,0.64,1) both;
        }}
        @keyframes popIn {{
            from {{ opacity: 0; transform: scale(0.4); }}
            to   {{ opacity: 1; transform: scale(1); }}
        }}
        .icon-wrap svg {{ width: 44px; height: 44px; fill: white; }}
        h1 {{ font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }}
        .subtitle {{ font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 20px; }}
        .email-chip {{
            display: inline-flex; align-items: center; gap: 8px;
            background: #f1f5f9; border-radius: 100px;
            padding: 8px 16px; margin-bottom: 28px;
        }}
        .email-avatar {{
            width: 26px; height: 26px; border-radius: 50%;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: white; font-size: 12px; font-weight: 700;
            display: flex; align-items: center; justify-content: center;
            text-transform: uppercase;
        }}
        .email-text {{ font-size: 13px; font-weight: 500; color: #334155; }}
        .progress-bar {{ height: 3px; background: #e2e8f0; border-radius: 99px; overflow: hidden; }}
        .progress-fill {{
            height: 100%; width: 100%;
            background: linear-gradient(90deg, #6366f1, #8b5cf6);
            border-radius: 99px;
            animation: drain 2s linear forwards;
            transform-origin: left;
        }}
        @keyframes drain {{
            from {{ transform: scaleX(1); }}
            to   {{ transform: scaleX(0); }}
        }}
        .close-hint {{ font-size: 12px; color: #94a3b8; margin-top: 10px; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="brand">
            <div class="brand-dot"></div>
            <div class="brand-dot"></div>
            <div class="brand-dot"></div>
            <span class="brand-name">JFCM Taytay</span>
        </div>
        <div class="icon-wrap">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </div>
        <h1>{message}</h1>
        <p class="subtitle">Google Drive has been linked to your account.</p>
        <div class="email-chip">
            <div class="email-avatar">{google_email[0]}</div>
            <span class="email-text">{google_email}</span>
        </div>
        <div class="progress-bar"><div class="progress-fill"></div></div>
        <p class="close-hint">This window will close automatically&hellip;</p>
    </div>
    <script>
        if (window.opener) {{
            window.opener.postMessage({{ type: 'google-auth-success', email: '{google_email}' }}, '*');
        }}
        setTimeout(() => window.close(), 2000);
    </script>
</body>
</html>
        """
        return HTMLResponse(content=html_content)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        # Return error HTML page
        error_html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connection Failed — JFCM Taytay</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: 'Inter', 'Segoe UI', sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fff5f5;
        }}
        .card {{
            background: #fff;
            border-radius: 24px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07), 0 20px 60px -10px rgba(239,68,68,0.15);
            padding: 48px 40px 40px;
            width: 380px;
            text-align: center;
            animation: slideUp 0.5s cubic-bezier(0.16,1,0.3,1);
        }}
        @keyframes slideUp {{
            from {{ opacity: 0; transform: translateY(24px); }}
            to   {{ opacity: 1; transform: translateY(0); }}
        }}
        .brand {{
            display: flex; align-items: center; justify-content: center;
            gap: 8px; margin-bottom: 32px;
        }}
        .brand-dot {{ width: 10px; height: 10px; border-radius: 50%; background: #6366f1; }}
        .brand-dot:nth-child(2) {{ background: #8b5cf6; width: 7px; height: 7px; }}
        .brand-dot:nth-child(3) {{ background: #a78bfa; width: 5px; height: 5px; }}
        .brand-name {{ font-size: 13px; font-weight: 600; color: #6366f1; letter-spacing: 0.08em; text-transform: uppercase; }}
        .icon-wrap {{
            width: 88px; height: 88px; border-radius: 50%;
            background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 24px;
            box-shadow: 0 8px 24px rgba(239,68,68,0.3);
            animation: popIn 0.5s 0.2s cubic-bezier(0.34,1.56,0.64,1) both;
        }}
        @keyframes popIn {{
            from {{ opacity: 0; transform: scale(0.4); }}
            to   {{ opacity: 1; transform: scale(1); }}
        }}
        .icon-wrap svg {{ width: 44px; height: 44px; fill: white; }}
        h1 {{ font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }}
        .subtitle {{ font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 16px; }}
        .error-detail {{
            background: #fef2f2; border: 1px solid #fecaca;
            border-radius: 10px; padding: 12px 16px;
            font-size: 12px; color: #b91c1c;
            text-align: left; margin-bottom: 24px;
            word-break: break-word; line-height: 1.5;
        }}
        .progress-bar {{ height: 3px; background: #fee2e2; border-radius: 99px; overflow: hidden; }}
        .progress-fill {{
            height: 100%; width: 100%;
            background: linear-gradient(90deg, #f87171, #ef4444);
            border-radius: 99px;
            animation: drain 3s linear forwards;
            transform-origin: left;
        }}
        @keyframes drain {{
            from {{ transform: scaleX(1); }}
            to   {{ transform: scaleX(0); }}
        }}
        .close-hint {{ font-size: 12px; color: #94a3b8; margin-top: 10px; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="brand">
            <div class="brand-dot"></div>
            <div class="brand-dot"></div>
            <div class="brand-dot"></div>
            <span class="brand-name">JFCM Taytay</span>
        </div>
        <div class="icon-wrap">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
        <h1>Connection Failed</h1>
        <p class="subtitle">Something went wrong while linking your Google account.</p>
        <div class="error-detail">{str(e)}</div>
        <div class="progress-bar"><div class="progress-fill"></div></div>
        <p class="close-hint">This window will close automatically&hellip;</p>
    </div>
    <script>
        setTimeout(() => window.close(), 3000);
    </script>
</body>
</html>
        """
        return HTMLResponse(content=error_html, status_code=400)

@router.get("/auth/status")
async def auth_status(
    user_email: str = Header(..., alias="X-User-Email"),
    current_user: User = Depends(get_jwt_user),
    db: Session = Depends(get_db)
):
    """Check Google Drive authentication status for a given email (JWT required)"""
    if not user_email:
        return {"authenticated": False, "user_id": None, "email": None, "last_updated": None}
    user_cred = db.query(UserCredential).filter(
        UserCredential.email == user_email
    ).first()
    
    return {
        "authenticated": user_cred is not None,
        "user_id": user_cred.user_id if user_cred else None,
        "email": user_cred.email if user_cred else None,
        "last_updated": user_cred.updated_at.isoformat() if user_cred else None
    }

@router.post("/auth/logout")
async def logout(
    user: UserCredential = Depends(get_current_user),  # ✅ From header
    db: Session = Depends(get_db)
):
    """Logout current user"""
    db.delete(user)
    db.commit()
    return {
        "success": True, 
        "message": f"User {user.email} logged out successfully"
    }

@router.get("/auth/users")
async def list_users(db: Session = Depends(get_db)):
    """List all authenticated users (admin endpoint)"""
    users = db.query(UserCredential).all()
    
    return {
        "success": True,
        "count": len(users),
        "users": [
            {
                "user_id": user.user_id,
                "email": user.email,
                "created_at": user.created_at.isoformat(),
                "updated_at": user.updated_at.isoformat()
            }
            for user in users
        ]
    }

@router.delete("/auth/clear/{email}")
async def clear_user_credentials(email: str, db: Session = Depends(get_db)):
    """Delete all credentials for a specific email (helper endpoint for scope updates)"""
    users = db.query(UserCredential).filter(UserCredential.email == email).all()
    
    if not users:
        return {
            "success": False,
            "message": f"No credentials found for {email}"
        }
    
    count = len(users)
    for user in users:
        db.delete(user)
    
    db.commit()
    
    return {
        "success": True,
        "message": f"Deleted {count} credential(s) for {email}",
        "count": count
    }

@router.get("/auth/clear-all")
async def clear_all_credentials(db: Session = Depends(get_db)):
    """Delete ALL credentials (use this to fix scope mismatch issues)"""
    count = db.query(UserCredential).delete()
    db.commit()
    
    return {
        "success": True,
        "message": f"Deleted ALL {count} credential(s) from database",
        "count": count
    }

@router.get("/auth/force-reauth")
async def force_reauth(user_email: str = None):
    """Force complete re-authentication (clears cache)"""
    try:
        flow = get_flow()
        state_data = user_email if user_email else "unknown"
        # Nuclear option: force everything fresh
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='false',
            prompt='consent',
            approval_prompt='force',  # Extra force
            state=state_data
        )
        return {
            "authorization_url": authorization_url,
            "state": state
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed: {str(e)}")

# ========================================
# FILE OPERATIONS
# ========================================

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    folder_id: str = Form(...),
    title: str = Form(...),
    category: str = Form(...),
    make_public: bool = Form(False),
    user: UserCredential = Depends(get_current_user),  # ✅ From header
    db: Session = Depends(get_db)
):
    """Upload file to specific folder with metadata"""
    try:
        service = get_drive_service(user.user_id, db)
        
        file_content = await file.read()
        
        file_metadata = {
            'name': file.filename,
            'parents': [folder_id],
            'description': f'Title: {title} | Category: {category}'
        }
        
        media = MediaIoBaseUpload(
            io.BytesIO(file_content),
            mimetype=file.content_type,
            resumable=True
        )
        
        uploaded_file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink'
        ).execute()
        
        if make_public:
            permission = {'type': 'anyone', 'role': 'reader'}
            service.permissions().create(
                fileId=uploaded_file['id'],
                body=permission
            ).execute()
        
        # Save per-account folder: key = "sow2_folder_{email}"
        per_acct_key = f"{SECTION_PREFIX}_folder_{user.email}"
        per_acct_setting = db.query(AppSetting).filter(AppSetting.key == per_acct_key).first()
        if per_acct_setting:
            per_acct_setting.value = folder_id
        else:
            per_acct_setting = AppSetting(key=per_acct_key, value=folder_id)
            db.add(per_acct_setting)
        legacy = db.query(AppSetting).filter(AppSetting.key == FOLDER_SETTING_KEY).first()
        if legacy:
            legacy.value = folder_id
        else:
            legacy = AppSetting(key=FOLDER_SETTING_KEY, value=folder_id)
            db.add(legacy)
        db.commit()
        cache_invalidate_prefix(f"list_files_{SECTION_PREFIX}_")

        return {
            "success": True,
            "file_id": uploaded_file['id'],
            "file_name": uploaded_file['name'],
            "title": title,
            "category": category,
            "web_view_link": uploaded_file['webViewLink'],
            "uploaded_by": user.email
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.delete("/delete-file/{file_id}")
async def delete_file(
    file_id: str,
    user: UserCredential = Depends(get_current_user),  # ✅ From header
    db: Session = Depends(get_db)
):
    """Delete file"""
    try:
        service = get_drive_service(user.user_id, db)
        service.files().delete(fileId=file_id).execute()
        cache_invalidate_prefix(f"list_files_{SECTION_PREFIX}_")
        
        return {
            "success": True, 
            "message": "File deleted",
            "deleted_by": user.email
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

@router.get("/list-files")
async def list_files(
    folder_id: Optional[str] = None,
    _jwt_user: User = Depends(get_jwt_user),  # Any logged-in user can view files
    db: Session = Depends(get_db)
):
    """Merge files from ALL connected Drive accounts. Results are cached for 60 seconds."""
    cache_key = f"list_files_{SECTION_PREFIX}_{folder_id or 'default'}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    all_creds = db.query(UserCredential).all()
    if not all_creds:
        raise HTTPException(status_code=503, detail="No Google Drive account connected. An admin must connect Google Drive first.")

    # Pre-fetch folder settings and build Drive services in the main thread (DB not thread-safe)
    tasks = []  # list of (service, acct_folder, email)
    for cred in all_creds:
        acct_folder = folder_id
        if not acct_folder:
            per_acct = db.query(AppSetting).filter(
                AppSetting.key == f"{SECTION_PREFIX}_folder_{cred.email}"
            ).first()
            if per_acct and per_acct.value:
                acct_folder = per_acct.value
            else:
                legacy_email = db.query(AppSetting).filter(AppSetting.key == GDRIVE_EMAIL_KEY).first()
                if legacy_email and legacy_email.value == cred.email:
                    legacy_folder = db.query(AppSetting).filter(AppSetting.key == FOLDER_SETTING_KEY).first()
                    if legacy_folder and legacy_folder.value:
                        acct_folder = legacy_folder.value
        if not acct_folder:
            continue
        try:
            service = get_drive_service(cred.user_id, db)
            tasks.append((service, acct_folder, cred.email))
        except Exception:
            logger.warning("list-files SOW2: cannot get service for %s — %s", cred.email, traceback.format_exc())

    def _fetch(service, acct_folder, email):
        try:
            results = service.files().list(
                q=f"'{acct_folder}' in parents and trashed=false",
                pageSize=100,
                fields="files(id, name, mimeType, size, createdTime, webViewLink, description)"
            ).execute()
            files = results.get('files', [])
            for f in files:
                f['_uploaded_by'] = email
            return files
        except Exception:
            logger.warning("list-files SOW2: GDrive error for %s — %s", email, traceback.format_exc())
            return []

    all_files = []
    if tasks:
        with ThreadPoolExecutor(max_workers=len(tasks)) as executor:
            for files in executor.map(lambda t: _fetch(*t), tasks):
                all_files.extend(files)

    response = {
        "success": True,
        "count": len(all_files),
        "files": all_files,
    }
    cache_set(cache_key, response, ttl=60)
    return response

# Remove email
@router.post("/auth/remove")
async def remove_account(
    user_email: str = Header(..., alias="X-User-Email"),
    db: Session = Depends(get_db)
):
    """Remove a Google Drive account by email (admin or self)"""
    user_cred = db.query(UserCredential).filter(UserCredential.email == user_email).first()
    if not user_cred:
        raise HTTPException(status_code=404, detail=f"User {user_email} not found")
    db.delete(user_cred)
    db.commit()
    return {"success": True, "message": f"User {user_email} removed"}


# ========================================
# FOLDER CONFIG
# ========================================
FOLDER_SETTING_KEY = "sow2_folder_id"
GDRIVE_EMAIL_KEY = "sow2_gdrive_email"
SECTION_PREFIX = "sow2"

@router.get("/config")
async def get_config(
    _jwt_user: User = Depends(get_jwt_user),
    db: Session = Depends(get_db)
):
    """Get the saved SOW2 folder ID (available to all logged-in users)"""
    setting = db.query(AppSetting).filter(AppSetting.key == FOLDER_SETTING_KEY).first()
    return {"folder_id": setting.value if setting else None}


@router.post("/config")
async def set_config(
    folder_id: str,
    current_user: User = Depends(get_jwt_user),
    db: Session = Depends(get_db)
):
    """Save the SOW2 folder ID (admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    setting = db.query(AppSetting).filter(AppSetting.key == FOLDER_SETTING_KEY).first()
    if setting:
        setting.value = folder_id
        setting.updated_at = datetime.utcnow()
    else:
        setting = AppSetting(key=FOLDER_SETTING_KEY, value=folder_id)
        db.add(setting)
    db.commit()
    return {"success": True, "folder_id": folder_id}
