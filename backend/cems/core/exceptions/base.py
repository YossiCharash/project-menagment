"""Base exception hierarchy for the CEMS module.

Every CEMS-specific exception inherits ``CEMSError``. The
:class:`status_code` class attribute carries the HTTP semantic so that
the FastAPI exception handler can build a uniform JSON response without
each call-site having to think about transport details.
"""

from __future__ import annotations

from fastapi import status


class CEMSError(Exception):
    """Root of all CEMS domain exceptions.

    Subclasses MUST set :attr:`status_code` and either override the
    constructor to compose a detailed ``detail`` string, or pass one in
    explicitly. Detailed messages are a hard project rule (CLAUDE.md).
    """

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(self, detail: str) -> None:
        if not detail:
            raise ValueError(
                "CEMSError subclasses must be raised with a non-empty detail message "
                "so that the API response carries actionable information."
            )
        self.detail = detail
        super().__init__(detail)


class CEMSNotFoundError(CEMSError):
    status_code = status.HTTP_404_NOT_FOUND


class CEMSConflictError(CEMSError):
    status_code = status.HTTP_409_CONFLICT


class CEMSValidationError(CEMSError):
    status_code = status.HTTP_400_BAD_REQUEST


class CEMSPermissionError(CEMSError):
    status_code = status.HTTP_403_FORBIDDEN


class CEMSAuthError(CEMSError):
    status_code = status.HTTP_401_UNAUTHORIZED
