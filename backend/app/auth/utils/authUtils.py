from passlib.context import CryptContext

# Argon2id with OWASP-minimum parameters (m=19 MiB, t=2, p=1).
# Passlib's default is memory_cost=102400 (100 MiB) which is dangerously slow
# on free-tier servers with 512 MB RAM and causes 2-5 s login times.
pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto",
    argon2__memory_cost=19456,   # 19 MiB  (OWASP min)
    argon2__time_cost=2,
    argon2__parallelism=1,
)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
