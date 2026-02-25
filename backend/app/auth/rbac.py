import logging
from fastapi import Depends, HTTPException, status
from app.models.userModel import User
from app.auth.me import get_current_user

logger = logging.getLogger(__name__)


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return current_user
