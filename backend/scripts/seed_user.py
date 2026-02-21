from database.database import SessionLocal
from app.auth.utils.authUtils import hash_password
from app.models.userModel import User

db = SessionLocal()

user = User(
    full_name="Test User",
    username="testuser",          
    email="test@example.com",
    password_hash=hash_password("password123"),
    is_active=True
)

db.add(user)
db.commit()
db.close()

print("✅ Mock user inserted")
