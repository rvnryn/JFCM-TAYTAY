from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from jose import jwt, JWTError
import os
import uuid
from pathlib import Path

from database.deps import get_db
from app.models.userModel import User
from app.auth.config import SECRET_KEY, ALGORITHM

router = APIRouter(
    prefix="/auth",
    tags=["Profile"]
)

security = HTTPBearer()

# Create upload directory
UPLOAD_DIR = Path("uploads/profile_pictures")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/profile-picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Upload a profile picture for the current user"""
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/jpg", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only images allowed (JPEG, PNG, GIF, WEBP)."
        )
    
    # Read and validate file size (5MB max)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 5MB."
        )
    
    # Get current user from token
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )
            
        user = db.query(User).filter(User.id == int(user_id)).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
            
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is archived"
            )
            
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    
    # Delete old profile picture if exists
    if user.profile_picture:
        old_file = UPLOAD_DIR / user.profile_picture
        if old_file.exists():
            try:
                old_file.unlink()
            except Exception as e:
                print(f"Error deleting old file: {e}")
    
    # Save new file with unique name
    file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"{user_id}_{uuid.uuid4()}.{file_extension}"
    file_path = UPLOAD_DIR / filename
    
    try:
        with open(file_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}"
        )
    
    # Update user record
    user.profile_picture = filename
    db.commit()
    db.refresh(user)
    
    return {
        "message": "Profile picture updated successfully",
        "filename": filename
    }


@router.get("/profile-picture/{filename}")
async def get_profile_picture(filename: str):
    """Serve a profile picture file"""
    
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile picture not found"
        )
    
    return FileResponse(
        file_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"}
    )
