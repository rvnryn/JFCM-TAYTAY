import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database.deps import get_db
from app.models.userModel import User
from app.auth.me import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["Profile"]
)

# Create upload directory
UPLOAD_DIR = Path("uploads/profile_pictures").resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Allowed MIME types and their magic byte signatures
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/jpg", "image/gif", "image/webp"}
MAGIC_BYTES: dict[bytes, str] = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG": "image/png",
    b"GIF8": "image/gif",
    b"RIFF": "image/webp",  # webp starts with RIFF....WEBP
}
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}


def _detect_image_type(data: bytes) -> bool:
    """Return True if file bytes match a known image magic signature."""
    for magic, _ in MAGIC_BYTES.items():
        if data[:len(magic)] == magic:
            return True
    return False


@router.post("/profile-picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a profile picture for the current user."""

    # Validate declared MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only JPEG, PNG, GIF, and WEBP images are allowed."
        )

    # Read file and enforce 5 MB limit
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 5 MB."
        )

    # Validate actual file bytes (magic bytes check)
    if not _detect_image_type(contents):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match a valid image format."
        )

    # Sanitize extension — only allow known safe extensions
    raw_ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    file_extension = raw_ext if raw_ext in ALLOWED_EXTENSIONS else "jpg"

    # Delete old profile picture if it exists
    if current_user.profile_picture:
        old_file = UPLOAD_DIR / current_user.profile_picture
        try:
            old_resolved = old_file.resolve()
            if str(old_resolved).startswith(str(UPLOAD_DIR)) and old_resolved.exists():
                old_resolved.unlink()
        except Exception as exc:
            logger.warning("Could not delete old profile picture: %s", exc)

    # Save new file with a random UUID name (no user-supplied filename in path)
    filename = f"{current_user.id}_{uuid.uuid4()}.{file_extension}"
    file_path = UPLOAD_DIR / filename

    try:
        file_path.write_bytes(contents)
    except Exception as exc:
        logger.error("Failed to save profile picture for user %s: %s", current_user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save file."
        )

    current_user.profile_picture = filename
    db.commit()
    db.refresh(current_user)

    return {"message": "Profile picture updated successfully", "filename": filename}


@router.get("/profile-picture/{filename}")
async def get_profile_picture(filename: str):
    """Serve a profile picture file."""

    # Resolve and guard against path traversal
    try:
        resolved = (UPLOAD_DIR / filename).resolve()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename.")

    if not str(resolved).startswith(str(UPLOAD_DIR)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename.")

    if not resolved.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile picture not found."
        )

    return FileResponse(
        resolved,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"}
    )
