# [PermSys-Core-002]
"""Custom exception hierarchy for the IAM subsystem.

All IAM exceptions inherit from IAMError so callers can catch the entire
family with a single except clause when appropriate.
"""

from __future__ import annotations


class IAMError(Exception):
    """Base class for all IAM-related errors."""

    def __init__(self, message: str = "An IAM error occurred") -> None:
        self.message = message
        super().__init__(self.message)


class PermissionDeniedError(IAMError):
    """Raised when a user lacks the required permission for an action."""

    def __init__(
        self,
        message: str = "Permission denied",
        *,
        user_id: int | None = None,
        action: str | None = None,
        resource_type: str | None = None,
        resource_id: int | str | None = None,
    ) -> None:
        self.user_id = user_id
        self.action = action
        self.resource_type = resource_type
        self.resource_id = resource_id
        detail_parts: list[str] = [message]
        if action:
            detail_parts.append(f"action={action}")
        if resource_type:
            detail_parts.append(f"resource={resource_type}")
        if resource_id is not None:
            detail_parts.append(f"id={resource_id}")
        super().__init__(" | ".join(detail_parts))


class RoleNotFoundError(IAMError):
    """Raised when a referenced role does not exist."""

    def __init__(self, role_name: str) -> None:
        self.role_name = role_name
        super().__init__(f"Role not found: {role_name}")


class InvalidAssignmentError(IAMError):
    """Raised when a role assignment request is invalid (e.g. duplicate, conflicting)."""

    def __init__(self, message: str = "Invalid role assignment") -> None:
        super().__init__(message)
