"""Exceptions raised by user lookup and authentication."""

from backend.cems.core.exceptions.base import (
    CEMSAuthError,
    CEMSNotFoundError,
    CEMSPermissionError,
)
from backend.cems.messages import user_messages


class UserNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(user_messages.NOT_FOUND)


class NotAuthenticatedError(CEMSAuthError):
    def __init__(self) -> None:
        super().__init__(user_messages.NOT_AUTHENTICATED)


class InvalidTokenError(CEMSAuthError):
    def __init__(self, *, payload: bool = False) -> None:
        msg = (
            user_messages.INVALID_TOKEN_PAYLOAD
            if payload
            else user_messages.INVALID_CREDENTIALS
        )
        super().__init__(msg)


class InvalidCredentialsError(CEMSAuthError):
    def __init__(self) -> None:
        super().__init__(user_messages.INACTIVE_OR_NOT_FOUND)


class CEMSRoleRequiredError(CEMSPermissionError):
    def __init__(self, allowed_roles: list[str]) -> None:
        super().__init__(user_messages.cems_role_required(allowed_roles))
