import base64
import logging

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from sqlalchemy.orm import Session

from database.deps import get_db
from app.models.userModel import User
from app.auth.me import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["Profile"]
)

# Allowed MIME types and their data-URL media types
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/jpg", "image/gif", "image/webp"}
MIME_TO_DATAURL: dict[str, str] = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/gif": "image/gif",
    "image/webp": "image/webp",
}
MAGIC_BYTES: dict[bytes, str] = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG": "image/png",
    b"GIF8": "image/gif",
    b"RIFF": "image/webp",
}

# Client should compress to <500 KB before uploading
MAX_UPLOAD_BYTES = 500 * 1024


def _detect_image_type(data: bytes) -> bool:
    """Return True if file bytes match a known image magic signature."""
    for magic in MAGIC_BYTES:
        if data[:len(magic)] == magic:
            return True
    return False


@router.post("/profile-picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a profile picture. Stored as a base64 data URL in the DB so it
    survives server restarts (no ephemeral filesystem dependency)."""

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only JPEG, PNG, GIF, and WEBP images are allowed."
        )

    contents = await file.read()

    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 500 KB (please compress the image first)."
        )

    if not _detect_image_type(contents):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match a valid image format."
        )

    mime_type = MIME_TO_DATAURL.get(file.content_type or "", "image/jpeg")
    data_url = f"data:{mime_type};base64,{base64.b64encode(contents).decode()}"

    # Re-fetch the user in THIS session so the change is tracked and committed correctly.
    # (current_user belongs to a different injected session from get_current_user)
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.profile_picture = data_url
    db.commit()

    return {"message": "Profile picture updated successfully"}


@router.delete("/profile-picture")
async def remove_profile_picture(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove the current user's profile picture."""
    user = db.query(User).filter(User.id == current_user.id).first()
    if user:
        user.profile_picture = None
        db.commit()
    return {"message": "Profile picture removed successfully"}
