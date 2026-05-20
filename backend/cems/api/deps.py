"""FastAPI dependency-injection helpers for the CEMS module.

Re-uses the project-wide session, JWT decoding, and User model so that
CEMS endpoints share the same authentication as the rest of the app.
"""

import uuid
from typing import AsyncGenerator

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.configurations.auth import OAUTH2_TOKEN_URL
from backend.cems.configurations.roles import (
    ADMIN_OR_MANAGER,
    ALL_CEMS_ROLES,
    CEMS_ADMIN,
    CEMS_MANAGER,
    MAIN_ADMIN,
)
from backend.cems.core.exceptions import (
    CEMSRoleRequiredError,
    InvalidCredentialsError,
    InvalidTokenError,
    NotAuthenticatedError,
    NotWarehouseManagerError,
    OnlyAdminOrWarehouseManagerError,
    WarehouseNotFoundError,
)
from backend.core.config import settings
from backend.db.session import AsyncSessionLocal
from backend.models.user import User
from backend.repositories.user_repository import UserRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=OAUTH2_TOKEN_URL, auto_error=False)


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
        raise NotAuthenticatedError()

    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            raise InvalidTokenError(payload=True)
        user_id = int(user_id_str)
    except (JWTError, ValueError) as exc:
        raise InvalidTokenError() from exc

    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if user is None or not user.is_active:
        raise InvalidCredentialsError()
    return user


def _is_cems_admin(user: User) -> bool:
    return user.role == MAIN_ADMIN or user.cems_role == CEMS_ADMIN


class RequireRole:
    """Callable dependency that enforces CEMS role access."""

    def __init__(self, *allowed_cems_roles: str) -> None:
        self._allowed = set(allowed_cems_roles)

    async def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == MAIN_ADMIN:
            return current_user
        if current_user.cems_role not in self._allowed:
            raise CEMSRoleRequiredError(list(self._allowed))
        return current_user


class RequireWarehouseManager:
    """Path-param dependency that enforces warehouse-level manager access."""

    async def __call__(
        self,
        warehouse_id: uuid.UUID,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if _is_cems_admin(current_user):
            return current_user
        if current_user.cems_role != CEMS_MANAGER:
            raise OnlyAdminOrWarehouseManagerError()
        from backend.cems.models.warehouse import Warehouse

        warehouse = await db.get(Warehouse, warehouse_id)
        if warehouse is None:
            raise WarehouseNotFoundError()
        if warehouse.current_manager_id != current_user.id:
            raise NotWarehouseManagerError()
        return current_user


async def check_warehouse_manager_access(
    warehouse_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> None:
    """Inline helper: raises a CEMS exception if the user is a Manager but not this warehouse's manager."""
    if _is_cems_admin(current_user):
        return
    if current_user.cems_role != CEMS_MANAGER:
        raise OnlyAdminOrWarehouseManagerError()
    from backend.cems.models.warehouse import Warehouse

    warehouse = await db.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise WarehouseNotFoundError()
    if warehouse.current_manager_id != current_user.id:
        raise NotWarehouseManagerError()


require_cems_access = RequireRole(*ALL_CEMS_ROLES)
require_admin = RequireRole(CEMS_ADMIN)
require_admin_or_manager = RequireRole(*ADMIN_OR_MANAGER)
require_manager_or_above = require_admin_or_manager
require_any_cems_role = RequireRole(*ALL_CEMS_ROLES)


def get_employee_warehouse_filter(user: User) -> uuid.UUID | None:
    """Return the warehouse UUID that should be used as a mandatory filter for Employees.

    Admins and Managers see all warehouses (returns ``None`` = no filter).
    Employees are restricted to their assigned warehouse.
    """
    if _is_cems_admin(user) or user.cems_role == CEMS_MANAGER:
        return None
    if user.cems_warehouse_id is None:
        return None
    raw = user.cems_warehouse_id
    if isinstance(raw, uuid.UUID):
        return raw
    return uuid.UUID(str(raw))
