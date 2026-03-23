"""FastAPI dependency-injection helpers for the CEMS module.

Re-uses the project-wide session, JWT decoding, and User model so that
CEMS endpoints share the same authentication as the rest of the app.
"""

import uuid
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


def _is_cems_admin(user: User) -> bool:
    return user.role == "Admin" or user.cems_role == "Admin"


class RequireRole:
    """Callable dependency that enforces CEMS role access.

    CEMS roles are stored in ``User.cems_role``.
    Admins (main system role == 'Admin') bypass all CEMS role checks.
    """

    def __init__(self, *allowed_cems_roles: str) -> None:
        self._allowed = set(allowed_cems_roles)

    async def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == "Admin":
            return current_user
        if current_user.cems_role not in self._allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"CEMS access requires one of: {sorted(self._allowed)}.",
            )
        return current_user


class RequireWarehouseManager:
    """Path-param dependency that enforces warehouse-level manager access.

    Admins bypass the check. Managers must be the current_manager_id of
    the warehouse identified by the ``warehouse_id`` path parameter.
    """

    async def __call__(
        self,
        warehouse_id: uuid.UUID,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if _is_cems_admin(current_user):
            return current_user
        if current_user.cems_role != "Manager":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins or the warehouse manager can perform this action.",
            )
        from backend.cems.models.warehouse import Warehouse

        warehouse = await db.get(Warehouse, warehouse_id)
        if warehouse is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found.")
        if warehouse.current_manager_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not the manager of this warehouse.",
            )
        return current_user


async def check_warehouse_manager_access(
    warehouse_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> None:
    """Inline helper: raises HTTP 403 if the user is a Manager but not this warehouse's manager."""
    if _is_cems_admin(current_user):
        return
    if current_user.cems_role != "Manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins or the warehouse manager can perform this action.",
        )
    from backend.cems.models.warehouse import Warehouse

    warehouse = await db.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warehouse not found.")
    if warehouse.current_manager_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the manager of this warehouse.",
        )


require_cems_access = RequireRole("Admin", "Manager", "Employee")
require_admin = RequireRole("Admin")
require_admin_or_manager = RequireRole("Manager", "Admin")
require_manager_or_above = require_admin_or_manager
require_any_cems_role = RequireRole("Admin", "Manager", "Employee")


def get_employee_warehouse_filter(user: User) -> uuid.UUID | None:
    """Return the warehouse UUID an Employee is restricted to, or None.

    Employees are scoped to the single warehouse stored in
    ``user.cems_warehouse_id``.  Admins and Managers see all warehouses
    so this returns None for them.
    """
    if user.cems_warehouse_id is None:
        return None
    # The DB column is UUID; the ORM type annotation is a legacy int stub.
    raw = user.cems_warehouse_id
    if isinstance(raw, uuid.UUID):
        return raw
    return uuid.UUID(str(raw))
