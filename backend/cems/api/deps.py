"""FastAPI dependency-injection helpers for the CEMS module.

All database sessions and authentication utilities used by the CEMS
endpoints are defined here, keeping the endpoint files thin and focused
on HTTP concerns only (Interface Segregation / SRP).
"""

import uuid
from typing import AsyncGenerator, List

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.cems.models.user import User, UserRole
from backend.cems.repositories.user_repository import UserRepository

# Re-use the project-wide session factory
from backend.db.session import AsyncSessionLocal

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/cems/auth/token", auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a transactional async session scoped to a single request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Decode the JWT and return the corresponding CEMS User."""
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload.",
            )
        user_id = uuid.UUID(user_id_str)
    except (JWTError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials.",
        ) from exc

    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )
    return user


class RequireRole:
    """Callable dependency that enforces one or more allowed roles.

    Usage::

        @router.post("/assets", dependencies=[Depends(RequireRole(UserRole.ADMIN, UserRole.MANAGER))])
        async def create_asset(...): ...
    """

    def __init__(self, *allowed_roles: UserRole) -> None:
        self._allowed_roles = allowed_roles

    async def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in self._allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of: {[r.value for r in self._allowed_roles]}.",
            )
        return current_user


# Convenience aliases
require_admin = RequireRole(UserRole.ADMIN)
require_admin_or_manager = RequireRole(UserRole.ADMIN, UserRole.MANAGER)
