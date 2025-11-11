# app/auth.py
import hashlib
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional


# -----------------------
#  Configuration - change for production
# -----------------------
# For now keep a simple secret. In real projects read from environment variables.
SECRET_KEY = "change-this-secret-to-a-long-random-string"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


# -----------------------
#  Password hashing utilities
# -----------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# -----------------------
#  Helper: pre-hash password with SHA-256
# -----------------------
def _sha256_hex(password: str) -> str:
    """
    Return a hex string of SHA-256(password).
    This makes the input to bcrypt a fixed-length value (<=72 bytes),
    avoiding bcrypt's 72-byte limit.
    """
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def hash_password(password: str) -> str:
    """
    Hash a password safely:
    1) pre-hash with SHA-256 (hex string, length 64)
    2) truncate to 72 bytes (bcrypt limit)
    3) bcrypt-hash that hex string via passlib
    """
    pre_hashed = _sha256_hex(password)
    # Truncate to 72 bytes to avoid bcrypt error on Python 3.13+
    truncated = pre_hashed[:72]
    return pwd_context.hash(truncated)


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify a plain password against stored bcrypt-hash of SHA-256(plain).
    """
    pre_hashed = _sha256_hex(plain)
    # Truncate to 72 bytes to match hash_password behavior
    truncated = pre_hashed[:72]
    return pwd_context.verify(truncated, hashed)


# -----------------------
#  JWT token utilities
# -----------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return token

def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
