"""
Centralized exception handlers for the FastAPI application.

Extracted from main.py to satisfy SRP: main.py should only assemble the app,
not define error handling logic. Each handler maps a specific exception type
to an appropriate HTTP response.
"""

from __future__ import annotations

import logging
import re

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError, DataError, OperationalError, DBAPIError

logger = logging.getLogger(__name__)

# Hebrew field labels for user-friendly constraint violation messages
_FIELD_LABELS = {
    "name": "שם",
    "email": "אימייל",
    "username": "שם משתמש",
}


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers on the given FastAPI application."""

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError):
        """Handle database integrity errors (unique constraints, foreign keys)"""
        error_msg = str(exc.orig) if exc.orig else str(exc)
        error_lower = error_msg.lower()

        if "unique constraint" in error_lower or "duplicate key" in error_lower:
            detail = "הפעולה נכשלה: הרשומה כבר קיימת במערכת."

            constraint_match = re.search(r'constraint\s+"([^"]+)"', error_msg, re.IGNORECASE)
            if constraint_match:
                constraint_name = constraint_match.group(1)
                field_match = re.search(r'ix_\w+_(.+)$', constraint_name)
                if field_match:
                    field_name = field_match.group(1)
                    field_label = _FIELD_LABELS.get(field_name, field_name)

                    value_match = re.search(r'Key\s+\([^)]+\)=\(([^)]+)\)', error_msg, re.IGNORECASE)
                    if value_match:
                        duplicate_value = value_match.group(1)
                        detail = f"הפעולה נכשלה: {field_label} '{duplicate_value}' כבר קיים במערכת."
                    else:
                        detail = f"הפעולה נכשלה: {field_label} כבר קיים במערכת."

            status_code = 409
        elif "foreign key constraint" in error_lower:
            detail = "הפעולה נכשלה: קיימת תלות ברשומות אחרות המונעת את הפעולה."
            status_code = 400
        else:
            detail = "שגיאת מסד נתונים."
            status_code = 400

        logger.warning("Integrity Error at %s: %s", request.url.path, detail)
        return JSONResponse(status_code=status_code, content={"detail": detail})

    @app.exception_handler(DataError)
    async def data_error_handler(request: Request, exc: DataError):
        """Handle database data errors (invalid types, values too long)"""
        return JSONResponse(
            status_code=400,
            content={"detail": "הנתונים שהוזנו אינם תקינים (סוג נתונים שגוי או ערך ארוך מדי)."},
        )

    @app.exception_handler(ConnectionRefusedError)
    @app.exception_handler(ConnectionError)
    async def db_connection_refused_handler(request: Request, exc: Exception):
        """DB unreachable -- return 503 so frontend does not treat as auth failure."""
        logger.error("Database connection failed at %s: %s", request.url.path, exc)
        return JSONResponse(
            status_code=503,
            content={"detail": "מסד הנתונים לא זמין כרגע. נסה שוב בעוד רגע."},
        )

    @app.exception_handler(OperationalError)
    @app.exception_handler(DBAPIError)
    async def db_unavailable_handler(request: Request, exc: Exception):
        """DB connection/operation failed -- return 503."""
        logger.error("Database error at %s: %s", request.url.path, exc)
        return JSONResponse(
            status_code=503,
            content={"detail": "מסד הנתונים לא זמין כרגע. נסה שוב בעוד רגע."},
        )

    @app.exception_handler(RuntimeError)
    async def runtime_error_handler(request: Request, exc: RuntimeError):
        """Log when response was already started; cannot send new response so re-raise."""
        if "response already started" in str(exc):
            logger.warning("%s: Exception after response already started: %s", request.url.path, exc)
        raise exc

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """Handle Pydantic validation errors with cleaner messages"""
        errors = []
        for error in exc.errors():
            field = ".".join(str(x) for x in error["loc"] if x != "body")
            msg = error["msg"]
            errors.append(f"{field}: {msg}")

        return JSONResponse(
            status_code=422,
            content={"detail": "שגיאת אימות נתונים", "errors": errors},
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled exception at %s", request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error. Please contact support."},
        )
