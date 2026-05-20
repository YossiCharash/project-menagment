"""Exceptions raised by the retirement domain."""

from backend.core.exceptions.cems.base import (
    CEMSConflictError,
    CEMSNotFoundError,
    CEMSPermissionError,
)
from backend.messages.cems import retirement_messages


class RetirementNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(retirement_messages.NOT_FOUND)


class RetirementNotPendingError(CEMSConflictError):
    def __init__(self) -> None:
        super().__init__(retirement_messages.NOT_PENDING)


class RetirementApproverNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(retirement_messages.APPROVER_NOT_FOUND)


class RetirementUnauthorizedError(CEMSPermissionError):
    def __init__(self) -> None:
        super().__init__(retirement_messages.UNAUTHORIZED)
