"""
CEO-specific JWT security utilities.

Uses a separate secret (CEO_JWT_SECRET) so that CEO tokens cannot be
confused with regular user tokens, enforcing a clear security boundary
between the platform administration layer and tenant workspaces.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.db.master_session import get_master_db
from backend.models.tenant import CEOCredential

CEO_TOKEN_EXPIRE_HOURS = 12
CEO_JWT_ALGORITHM = "HS256"

ceo_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/ceo/auth/login")


def create_ceo_access_token(data: Dict[str, Any]) -> str:
    """Create a JWT access token for the CEO with a 12-hour expiry."""
    expire = datetime.now(timezone.utc) + timedelta(hours=CEO_TOKEN_EXPIRE_HOURS)
    to_encode = {
        **data,
        "exp": expire,
        "type": "ceo_access",
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(to_encode, settings.CEO_JWT_SECRET, algorithm=CEO_JWT_ALGORITHM)


def decode_ceo_token(token: str) -> Dict[str, Any]:
    """Decode and validate a CEO JWT token.

    Raises ``HTTPException(401)`` if the token is invalid or expired.
    """
    try:
        payload = jwt.decode(
            token, settings.CEO_JWT_SECRET, algorithms=[CEO_JWT_ALGORITHM]
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired CEO token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_ceo(
    token: str = Depends(ceo_oauth2_scheme),
    db: AsyncSession = Depends(get_master_db),
) -> CEOCredential:
    """FastAPI dependency that returns the authenticated CEOCredential."""
    payload = decode_ceo_token(token)
    email: str | None = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid CEO token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    stmt = select(CEOCredential).where(CEOCredential.email == email)
    result = await db.execute(stmt)
    ceo = result.scalar_one_or_none()

    if ceo is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="CEO credential not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return ceo
