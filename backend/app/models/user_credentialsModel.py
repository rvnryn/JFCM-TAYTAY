from sqlalchemy import Column, String, Text, DateTime
from datetime import datetime
from database.database import Base  # Import from database.database

class UserCredential(Base):
    __tablename__ = "user_credentials"
    
    user_id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    token = Column(Text, nullable=False)
    refresh_token = Column(Text)
    token_uri = Column(String)
    client_id = Column(String)
    client_secret = Column(String)
    scopes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<UserCredential(user_id='{self.user_id}', email='{self.email}')>"