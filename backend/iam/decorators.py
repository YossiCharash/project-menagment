# [PermSys-Deco-009]
"""Permission decorator and FastAPI dependency for endpoint protection.

Provides two complementary approaches:

1. ``require_permission(action, resource_type)`` -- a FastAPI dependency
   factory that can be used with ``Depends(...)`` on any endpoint.

2. ``permission_required(action, resource_type)`` -- a function decorator
   that wraps sync or async callables and performs permission checks
   based on function arguments.

Both raise ``PermissionDeniedError`` (caught by the exception handler
registered in middleware.py) when the user lacks access.
"""

from __future__ import annotations

import asyncio
import functools
import logging
from typing import Any, Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_current_user, DBSessionDep
from backend.iam.engine import PermissionsEngine
from backend.iam.exceptions import PermissionDeniedError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# FastAPI Dependency approach (recommended for endpoints)
# ---------------------------------------------------------------------------

def require_permission(
    action: str,
    resource_type: str,
    *,
    resource_id_param: str | None = None,
    project_id_param: str | None = "project_id",
) -> Callable:
    """FastAPI dependency factory that enforces a permission check.

    Usage::

        @router.post("/projects/{project_id}/transactions")
        async def create_transaction(
            project_id: int,
            db: DBSessionDep,
            user = Depends(require_permission("write", "transaction")),
        ):
            ...

    Args:
        action: The action to check (e.g. ``"write"``, ``"read"``).
        resource_type: The resource type (e.g. ``"transaction"``).
        resource_id_param: Name of the path/query parameter holding the
            specific resource ID. If None, no resource-level check is done.
        project_id_param: Name of the path/query parameter holding the
            project ID for project-scoped checks. Defaults to ``"project_id"``.
    """

    async def _permission_dep(
        request: Request,
        db: DBSessionDep,
        user=Depends(get_current_user),
    ):
        engine = PermissionsEngine(db)

        # Extract project_id from path params, query params, or body
        project_id = _extract_param(request, project_id_param)
        resource_id = _extract_param(request, resource_id_param)

        allowed = await engine.has_permission(
            user_id=user.id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            project_id=project_id,
        )

        if not allowed:
            logger.warning(
                "Permission denied: user=%d action=%s resource_type=%s "
                "resource_id=%s project_id=%s",
                user.id, action, resource_type, resource_id, project_id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {action} on {resource_type}",
            )

        return user

    return _permission_dep


def _extract_param(request: Request, param_name: str | None) -> int | None:
    """Try to extract an integer parameter from path params or query params."""
    if param_name is None:
        return None
    # Path parameters
    value = request.path_params.get(param_name)
    if value is not None:
        try:
            return int(value)
        except (ValueError, TypeError):
            return None
    # Query parameters
    value = request.query_params.get(param_name)
    if value is not None:
        try:
            return int(value)
        except (ValueError, TypeError):
            return None
    return None


# ---------------------------------------------------------------------------
# Function decorator approach (for service-layer or non-FastAPI code)
# ---------------------------------------------------------------------------

def permission_required(
    action: str,
    resource_type: str,
    *,
    user_id_arg: str = "user_id",
    resource_id_arg: str | None = None,
    project_id_arg: str | None = "project_id",
    db_arg: str = "db",
) -> Callable:
    """Decorator that checks permissions before executing a function.

    Works with both sync and async functions. Expects the decorated function
    to receive a ``db`` (AsyncSession) argument and a ``user_id`` argument
    (names configurable via kwargs).

    Usage::

        @permission_required("write", "transaction", project_id_arg="project_id")
        async def update_transaction(db: AsyncSession, user_id: int, project_id: int, ...):
            ...

    Raises:
        PermissionDeniedError: If the user lacks the required permission.
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            db = kwargs.get(db_arg)
            user_id = kwargs.get(user_id_arg)
            resource_id = kwargs.get(resource_id_arg) if resource_id_arg else None
            project_id = kwargs.get(project_id_arg) if project_id_arg else None

            if db is None or user_id is None:
                raise PermissionDeniedError(
                    "Missing db or user_id in function arguments"
                )

            engine = PermissionsEngine(db)
            await engine.check_permission(
                user_id=user_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                project_id=project_id,
            )

            return await func(*args, **kwargs)

        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            # For sync functions, run the async check in an event loop
            db = kwargs.get(db_arg)
            user_id = kwargs.get(user_id_arg)
            resource_id = kwargs.get(resource_id_arg) if resource_id_arg else None
            project_id = kwargs.get(project_id_arg) if project_id_arg else None

            if db is None or user_id is None:
                raise PermissionDeniedError(
                    "Missing db or user_id in function arguments"
                )

            # Attempt to get or create an event loop
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            async def _check() -> None:
                engine = PermissionsEngine(db)
                await engine.check_permission(
                    user_id=user_id,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    project_id=project_id,
                )

            if loop and loop.is_running():
                # We're already in an async context -- create a task
                # This branch shouldn't normally be hit for sync functions
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    pool.submit(asyncio.run, _check()).result()
            else:
                asyncio.run(_check())

            return func(*args, **kwargs)

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator
