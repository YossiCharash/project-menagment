from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Dict
from jose import jwt, JWTError
from passlib.context import CryptContext
import secrets
import string

from backend.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(subject: str | int, expires_minutes: int | None = None) -> str:
    expire_minutes = expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    to_encode = {
        "sub": str(subject), 
        "exp": expire,
        "type": "access",
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str | int, expires_days: int = 30) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=expires_days)
    to_encode = {
        "sub": str(subject),
        "exp": expire,
        "type": "refresh",
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict[str, Any]]:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None


def generate_password_reset_token() -> str:
    """Generate a secure password reset token"""
    return ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))


def create_password_reset_token(email: str, expires_minutes: int = 30) -> str:
    """Create a password reset token for a specific email"""
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    to_encode = {
        "sub": email,
        "exp": expire,
        "type": "password_reset",
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_initial_password_reset_token(user_id: int, expires_days: int = 7) -> str:
    """Create a token for initial password reset (for new users with temporary password)"""
    expire = datetime.now(timezone.utc) + timedelta(days=expires_days)
    to_encode = {
        "sub": str(user_id),
        "exp": expire,
        "type": "initial_password_reset",
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_initial_password_reset_token(token: str) -> Optional[int]:
    """Verify initial password reset token and return user_id if valid"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") == "initial_password_reset":
            return int(payload.get("sub"))
    except (JWTError, ValueError):
        pass
    return None


def verify_password_reset_token(token: str) -> Optional[str]:
    """Verify password reset token and return email if valid"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") == "password_reset":
            return payload.get("sub")
    except JWTError:
        pass
    return None


def create_token_pair(user_id: int, remember_me: bool = False) -> Dict[str, Any]:
    """Create both access and refresh tokens"""
    access_expires = 60 * 24 if remember_me else 60 * 8  # 24 hours if remember me, 8 hours otherwise
    refresh_expires = 30 if remember_me else 7  # 30 days if remember me, 7 days otherwise
    
    access_token = create_access_token(user_id, access_expires)
    refresh_token = create_refresh_token(user_id, refresh_expires)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": access_expires * 60,  # in seconds
        "token_type": "bearer"
    }


def generate_temporary_password(length: int = 12) -> str:
    """Generate a secure temporary password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(alphabet) for _ in range(length))