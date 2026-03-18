"""FastAPI dependency-injection helpers for the CEMS module.

Re-uses the project-wide session, JWT decoding, and User model so that
CEMS endpoints share the same authentication as the rest of the app.
"""

from typing import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.db.session import AsyncSessionLocal
from backend.models.user import User
from backend.repositories.user_repository import UserRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


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
    """Decode the JWT and return the User from the shared users table."""
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload.")
        user_id = int(user_id_str)
    except (JWTError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials.",
        ) from exc

    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive.")
    return user


class RequireRole:
    """Callable dependency that enforces CEMS role access.

    CEMS roles are stored in ``User.cems_role``.
    Admins (main system role == 'Admin') bypass all CEMS role checks.
    """

    def __init__(self, *allowed_cems_roles: str) -> None:
        self._allowed = set(allowed_cems_roles)

    async def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        # Main-system Admins always have full CEMS access
        if current_user.role == "Admin":
            return current_user
        if current_user.cems_role not in self._allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"CEMS access requires one of: {sorted(self._allowed)}.",
            )
        return current_user


# Convenience aliases using plain strings to avoid circular imports
require_admin = RequireRole("Admin")
require_admin_or_manager = RequireRole("Manager", "Admin")
require_manager_or_above = require_admin_or_manager  # backwards-compat alias
require_any_cems_role = RequireRole("Admin", "Manager", "Employee")
