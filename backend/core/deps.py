import logging
from typing import Annotated, AsyncGenerator

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
import sqlalchemy.exc

from backend.db.session import get_master_db, MasterAsyncSessionLocal
from backend.core.security import decode_token
from backend.repositories.user_repository import UserRepository
from backend.models.user import UserRole

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)

# ---------------------------------------------------------------------------
# Master DB dependency — always uses the super-admin database
# ---------------------------------------------------------------------------
MasterDBSessionDep = Annotated[AsyncSession, Depends(get_master_db)]


# ---------------------------------------------------------------------------
# Smart / tenant-aware DB session dependency
#
# Routing logic:
#   • No token (public endpoints)       → master DB
#   • Token without tenant_id claim     → master DB  (super admin)
#   • Token with tenant_id claim        → that tenant's DB
# ---------------------------------------------------------------------------
async def get_current_tenant_db_session(
    token: Annotated[str | None, Depends(oauth2_scheme_optional)] = None,
) -> AsyncGenerator[AsyncSession, None]:
    """
    Yields the right AsyncSession for the current request:
    - master DB when no token / super-admin token (no tenant_id claim)
    - tenant DB when the JWT contains a tenant_id claim
    """
    tenant_id: int | None = None

    if token:
        payload = decode_token(token)
        if payload:
            raw = payload.get("tenant_id")
            if raw is not None:
                try:
                    tenant_id = int(raw)
                except (TypeError, ValueError):
                    tenant_id = None

    if tenant_id is None:
        # ── Master DB path ──────────────────────────────────────────────
        async with MasterAsyncSessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                try:
                    await session.close()
                except Exception as exc:
                    logger.warning("Master session close failed: %s", exc)
    else:
        # ── Tenant DB path ──────────────────────────────────────────────
        from backend.db.tenant_registry import tenant_registry

        session_maker = tenant_registry.get_session_maker(tenant_id)
        if session_maker is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Tenant service not available",
            )
        async with session_maker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                try:
                    await session.close()
                except Exception as exc:
                    logger.warning(
                        "Tenant session close failed (tenant=%s): %s", tenant_id, exc
                    )


# Tenant-aware session dep — replaces DBSessionDep for all authenticated endpoints
TenantDBSessionDep = Annotated[AsyncSession, Depends(get_current_tenant_db_session)]

# DBSessionDep is now tenant-aware; public endpoints that genuinely need the
# master DB should use MasterDBSessionDep explicitly.
DBSessionDep = TenantDBSessionDep


# ---------------------------------------------------------------------------
# Current-user dependency
# ---------------------------------------------------------------------------
async def get_current_user(
    db: TenantDBSessionDep,
    token: Annotated[str, Depends(oauth2_scheme)],
):
    try:
        payload = decode_token(token)
        if not payload or "sub" not in payload:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user_id = int(payload["sub"])
        user = await UserRepository(db).get_by_id(user_id)
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
        return user
    except HTTPException:
        raise
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception as e:
        if isinstance(e, (sqlalchemy.exc.DBAPIError, sqlalchemy.exc.OperationalError, ConnectionError, OSError)):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Service temporarily unavailable. Please try again.",
            ) from e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred. Please try again.",
        ) from e


async def get_current_user_with_details(
    db: TenantDBSessionDep,
    token: Annotated[str, Depends(oauth2_scheme)],
):
    """Get current user with role and group_id for RBAC"""
    user = await get_current_user(db, token)
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "group_id": user.group_id,
        "is_active": user.is_active,
        "user": user,
    }


# ---------------------------------------------------------------------------
# Role-based access control helpers
# ---------------------------------------------------------------------------
def require_roles(*roles: UserRole | str):
    async def _role_dep(user=Depends(get_current_user)):
        allowed = {r.value if hasattr(r, "value") else r for r in roles}
        if allowed and user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user
    return _role_dep


def require_role(required_role: str):
    """Require specific role (Admin or Member)"""
    async def _role_dep(user_details=Depends(get_current_user_with_details)):
        if user_details["role"] != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {required_role}",
            )
        return user_details["user"]
    return _role_dep


def require_group_access():
    """Require group access — Admin bypasses, Members must match group_id"""
    async def _group_dep(user_details=Depends(get_current_user_with_details)):
        if user_details["role"] == "Admin":
            return user_details["user"]
        return user_details["user"]
    return _group_dep


def require_admin():
    """Require Admin role"""
    async def _admin_dep(user=Depends(get_current_user)):
        if user.role != "Admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Admin role required",
            )
        return user
    return _admin_dep


def require_super_admin():
    """
    Require super-admin access:
    - JWT must have NO tenant_id claim (i.e. user is on master DB)
    - user.role must be Admin
    """
    async def _super_admin_dep(
        master_db: MasterDBSessionDep,
        token: Annotated[str, Depends(oauth2_scheme)],
    ):
        payload = decode_token(token)
        if not payload or "sub" not in payload:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        if payload.get("tenant_id") is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Super admin access required",
            )

        user_id = int(payload["sub"])
        user = await UserRepository(master_db).get_by_id(user_id)
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
        if user.role != "Admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Super admin access required",
            )
        return user
    return _super_admin_dep


async def get_outlook_connect_user_id(
    request: Request,
    token_header: Annotated[str | None, Depends(oauth2_scheme_optional)] = None,
):
    """For Outlook connect: user id from ?token= JWT or Authorization header."""
    query_token = request.query_params.get("token")
    token = query_token or token_header
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token required")
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return int(payload["sub"])
