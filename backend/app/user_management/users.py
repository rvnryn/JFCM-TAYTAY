import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.rbac import require_admin
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from database.deps import get_db
from app.models.userModel import User, UserCreate, UserOut, UserUpdate, PasswordChangeRequest
from app.auth.utils.authUtils import hash_password

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/users",
    tags=["Users"]
)

# Get All Users — admin only + paginated
@router.get("/", response_model=List[UserOut], dependencies=[Depends(require_admin)])
def get_all_users(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    users = db.query(User).offset(skip).limit(limit).all()
    return users

@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    from sqlalchemy import func
    email_lower = user_in.email.strip().lower()
    username_lower = user_in.username.strip().lower()

    existing_email = db.query(User).filter(func.lower(User.email) == email_lower).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")

    existing_username = db.query(User).filter(func.lower(User.username) == username_lower).first()
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")

    try:
        user = User(
            full_name=user_in.full_name,
            username=username_lower,
            email=email_lower,
            password_hash=hash_password(user_in.password),
            role=user_in.role,
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Username or email already exists")

@router.put("/{user_id}", response_model=UserOut, dependencies=[Depends(require_admin)])
def update_user(
    user_id: int,
    user_in: UserUpdate,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # ---------- FULL NAME ----------
    if user_in.full_name is not None:
        full_name = user_in.full_name.strip()

        if full_name != user.full_name:
            existing = db.query(User).filter(
                User.full_name == full_name,
                User.id != user_id
            ).first()

            if existing:
                raise HTTPException(
                    status_code=409,
                    detail="Full name already taken"
                )

            user.full_name = full_name

    # ---------- USERNAME ----------
    if user_in.username is not None:
        username = user_in.username.strip().lower()

        if username != user.username:
            existing = db.query(User).filter(
                User.username == username,
                User.id != user_id
            ).first()

            if existing:
                raise HTTPException(
                    status_code=409,
                    detail="Username already taken"
                )

            user.username = username

    # ---------- EMAIL ----------
    email_changed = False
    if user_in.email is not None:
        email = user_in.email.strip().lower()
        if email != user.email:
            existing = db.query(User).filter(
                User.email == email,
                User.id != user_id
            ).first()
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail="Email already taken"
                )
            user.email = email
            email_changed = True

    # ---------- ROLE ----------
    if user_in.role is not None:
        user.role = user_in.role.strip().lower()

    db.commit()
    db.refresh(user)
    # Notify user if email was changed
    return user

@router.patch("/{user_id}/archive", response_model=UserOut, dependencies=[Depends(require_admin)])
def archive_user(
    user_id: int,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.is_active:
        raise HTTPException(
            status_code=400,
            detail="User already archived"
        )

    user.is_active = False
    db.commit()
    db.refresh(user)

    return user

@router.patch("/{user_id}/restore", response_model=UserOut, dependencies=[Depends(require_admin)])
def restore_user(
    user_id: int,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_active:
        raise HTTPException(
            status_code=400,
            detail="User is already active"
        )

    user.is_active = True
    db.commit()
    db.refresh(user)

    return user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def remove_user(
    user_id: int,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()

    return None

# Admin: Change user password
@router.patch("/{user_id}/change-password", response_model=UserOut, dependencies=[Depends(require_admin)])
def change_user_password(
    user_id: int,
    req: PasswordChangeRequest,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(req.new_password)
    db.commit()
    db.refresh(user)
    return user