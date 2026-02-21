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
from database.deps import get_db
from app.models.user_credentialsModel import UserCredential

router = APIRouter(prefix="/gdrive/teaching", tags=["Google Drive - Teaching"])

# ========================================
# HELPER FUNCTION FOR AUTH
# ========================================

async def get_current_user(
    user_email: str = Header(..., alias="X-User-Email"),
    db: Session = Depends(get_db)
) -> UserCredential:
    """Get authenticated user from header"""
    user_cred = db.query(UserCredential).filter(
        UserCredential.email == user_email
    ).first()
    
    if not user_cred:
        raise HTTPException(
            status_code=401,
            detail=f"User {user_email} not authenticated"
        )
    
    return user_cred

# Path to credentials.json file
CLIENT_SECRETS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "credentials.json"
)

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
        return "http://localhost:8000/gdrive/teaching/auth/callback"
    
    for uri in redirect_uris:
        if "localhost" in uri or "127.0.0.1" in uri:
            return uri
    
    return redirect_uris[0] if redirect_uris else "http://localhost:8000/gdrive/teaching/auth/callback"

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
            detail="Not authenticated. Please visit /gdrive/teaching/auth/login first."
        )
    
    credentials = Credentials(
        token=user_cred.token,
        refresh_token=user_cred.refresh_token,
        token_uri=user_cred.token_uri,
        client_id=user_cred.client_id,
        client_secret=user_cred.client_secret,
        scopes=json.loads(user_cred.scopes) if user_cred.scopes else []
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
        # Log the error for debugging
        print(f"Error getting user email: {str(e)}")
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
        <html>
        <head>
            <title>Authentication Successful</title>
            <style>
                body {{
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }}
                .success-box {{
                    background: white;
                    padding: 40px;
                    border-radius: 16px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    text-align: center;
                    max-width: 400px;
                }}
                .checkmark {{
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    background: #4CAF50;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                    animation: scaleIn 0.5s ease;
                }}
                .checkmark svg {{
                    width: 50px;
                    height: 50px;
                    fill: white;
                }}
                h1 {{
                    color: #2c3e50;
                    margin: 0 0 10px;
                    font-size: 24px;
                }}
                p {{
                    color: #7f8c8d;
                    margin: 0 0 20px;
                }}
                .email {{
                    color: #667eea;
                    font-weight: 600;
                }}
                @keyframes scaleIn {{
                    from {{
                        transform: scale(0);
                    }}
                    to {{
                        transform: scale(1);
                    }}
                }}
            </style>
        </head>
        <body>
            <div class="success-box">
                <div class="checkmark">
                    <svg viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                    </svg>
                </div>
                <h1>{message}</h1>
                <p>Email: <span class="email">{google_email}</span></p>
                <p>This window will close automatically...</p>
            </div>
            <script>
                // Signal success to parent window
                if (window.opener) {{
                    window.opener.postMessage({{
                        type: 'google-auth-success',
                        email: '{google_email}'
                    }}, '*');
                }}
                // Close window after 2 seconds
                setTimeout(() => {{
                    window.close();
                }}, 2000);
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
        <html>
        <head>
            <title>Authentication Failed</title>
            <style>
                body {{
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                }}
                .error-box {{
                    background: white;
                    padding: 40px;
                    border-radius: 16px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    text-align: center;
                    max-width: 400px;
                }}
                .error-icon {{
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    background: #f44336;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                }}
                .error-icon svg {{
                    width: 50px;
                    height: 50px;
                    fill: white;
                }}
                h1 {{
                    color: #2c3e50;
                    margin: 0 0 10px;
                    font-size: 24px;
                }}
                p {{
                    color: #7f8c8d;
                    margin: 0 0 20px;
                }}
            </style>
        </head>
        <body>
            <div class="error-box">
                <div class="error-icon">
                    <svg viewBox="0 0 24 24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
                    </svg>
                </div>
                <h1>Authentication Failed</h1>
                <p>{str(e)}</p>
                <p>This window will close automatically...</p>
            </div>
            <script>
                setTimeout(() => {{
                    window.close();
                }}, 3000);
            </script>
        </body>
        </html>
        """
        return HTMLResponse(content=error_html, status_code=400)

@router.get("/auth/status")
async def auth_status(user_email: str = Header(..., alias="X-User-Email"), db: Session = Depends(get_db)):
    """Check authentication status by email"""
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
    user: UserCredential = Depends(get_current_user),  # ✅ From header
    db: Session = Depends(get_db)
):
    """List files in folder"""
    try:
        service = get_drive_service(user.user_id, db)
        
        if folder_id:
            query = f"'{folder_id}' in parents and trashed=false"
        else:
            query = "trashed=false"
        
        results = service.files().list(
            q=query,
            pageSize=50,
            fields="files(id, name, mimeType, size, createdTime, webViewLink, description)"
        ).execute()
        
        return {
            "success": True,
            "count": len(results.get('files', [])),
            "files": results.get('files', []),
            "user": user.email
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed: {str(e)}")

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