from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from database.database import Base
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, Literal
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user")
    is_active = Column(Boolean, default=True)
    profile_picture: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

#Base Modal
class UserCreate(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    password: str
    role: Literal["admin", "user"] = "user"

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

class UserOut(BaseModel):
    id: int
    full_name: str
    username: str
    email: EmailStr
    role : str
    is_active: bool
    profile_picture: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[Literal["admin", "user"]] = None
    is_active: Optional[bool] = None


class PasswordChangeRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v