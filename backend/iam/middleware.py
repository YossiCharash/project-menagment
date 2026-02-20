# [PermSys-Deco-010]
"""FastAPI exception handler registration for IAM exceptions.

Call ``register_iam_exception_handlers(app)`` during app startup to
ensure that ``PermissionDeniedError`` and other IAM exceptions are
converted into proper HTTP responses instead of 500 Internal Server Error.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from backend.iam.exceptions import (
    PermissionDeniedError,
    IAMError,
    RoleNotFoundError,
    InvalidAssignmentError,
)

logger = logging.getLogger(__name__)


def register_iam_exception_handlers(app: FastAPI) -> None:
    """Register exception handlers for IAM-specific errors.

    This function should be called once during application startup,
    after the FastAPI app is created but before it starts serving.

    Args:
        app: The FastAPI application instance.
    """

    @app.exception_handler(PermissionDeniedError)
    async def permission_denied_handler(
        request: Request, exc: PermissionDeniedError
    ) -> JSONResponse:
        logger.warning(
            "Permission denied at %s: user=%s action=%s resource=%s/%s",
            request.url.path,
            exc.user_id,
            exc.action,
            exc.resource_type,
            exc.resource_id,
        )
        return JSONResponse(
            status_code=403,
            content={
                "detail": "Permission denied",
                "error_code": "PERMISSION_DENIED",
                "action": exc.action,
                "resource_type": exc.resource_type,
            },
        )

    @app.exception_handler(RoleNotFoundError)
    async def role_not_found_handler(
        request: Request, exc: RoleNotFoundError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content={
                "detail": f"Role not found: {exc.role_name}",
                "error_code": "ROLE_NOT_FOUND",
            },
        )

    @app.exception_handler(InvalidAssignmentError)
    async def invalid_assignment_handler(
        request: Request, exc: InvalidAssignmentError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={
                "detail": exc.message,
                "error_code": "INVALID_ASSIGNMENT",
            },
        )

    @app.exception_handler(IAMError)
    async def iam_error_handler(
        request: Request, exc: IAMError
    ) -> JSONResponse:
        logger.error("IAM error at %s: %s", request.url.path, exc.message)
        return JSONResponse(
            status_code=500,
            content={
                "detail": "An internal permissions error occurred",
                "error_code": "IAM_ERROR",
            },
        )
