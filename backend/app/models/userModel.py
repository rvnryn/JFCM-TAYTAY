from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from database.database import Base
from pydantic import BaseModel, EmailStr
from typing import Optional

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user")
    is_active = Column(Boolean, default=True)
    profile_picture: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

#Base Modal
class UserCreate(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    password: str
    role: str

class UserOut(BaseModel):
    id: int
    full_name: str
    username: str
    email: EmailStr
    role : str
    is_active: bool
    profile_picture: Optional[str] = None

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None