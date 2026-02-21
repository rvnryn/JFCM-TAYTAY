from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
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
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/jpg", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, detail="Invalid file type. Only images allowed.")
    
    # Read and validate file size (5MB max)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, detail="File too large. Max 5MB.")
    
    # Get current user from token
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(401, detail="Invalid token")
            
        user = db.query(User).filter(User.id == int(user_id)).first()
        
        if not user:
            raise HTTPException(404, detail="User not found")
    except JWTError:
        raise HTTPException(401, detail="Invalid token")
    
    # Delete old profile picture if exists
    if user.profile_picture:
        old_file = UPLOAD_DIR / user.profile_picture
        if old_file.exists():
            old_file.unlink()
    
    # Save new file with unique name
    file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"{user_id}_{uuid.uuid4()}.{file_extension}"
    file_path = UPLOAD_DIR / filename
    
    with open(file_path, "wb") as f:
        f.write(contents)
    
    # Update user record
    user.profile_picture = filename
    db.commit()
    
    return {"message": "Profile picture updated", "filename": filename}

# Serve profile pictures
@router.get("/profile-picture/{filename}")
async def get_profile_picture(filename: str):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(404, detail="File not found")
    return FileResponse(file_path)