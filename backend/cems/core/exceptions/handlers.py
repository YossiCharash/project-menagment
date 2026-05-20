"""FastAPI exception handler that translates :class:`CEMSError` to JSON.

Registering this handler on the app means service-layer code only ever
raises typed domain exceptions; the transport concern (status code,
JSON body shape) lives in one place.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from backend.cems.configurations.auth import WWW_AUTHENTICATE_BEARER
from backend.cems.core.exceptions.base import CEMSAuthError, CEMSError


async def cems_exception_handler(request: Request, exc: CEMSError) -> JSONResponse:
    headers: dict[str, str] | None = None
    if isinstance(exc, CEMSAuthError):
        headers = WWW_AUTHENTICATE_BEARER
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )


def register_cems_exception_handlers(app: FastAPI) -> None:
    """Wire :class:`CEMSError` into the FastAPI app's handler table."""
    app.add_exception_handler(CEMSError, cems_exception_handler)
