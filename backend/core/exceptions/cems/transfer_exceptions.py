"""Exceptions raised by the transfer domain."""

from backend.core.exceptions.cems.base import (
    CEMSConflictError,
    CEMSNotFoundError,
    CEMSPermissionError,
)
from backend.messages.cems import transfer_messages


class TransferNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(transfer_messages.NOT_FOUND)


class TransferNotPendingError(CEMSConflictError):
    def __init__(self, current_status: str) -> None:
        super().__init__(transfer_messages.not_pending(current_status))


class TransferRecipientMismatchError(CEMSPermissionError):
    def __init__(self) -> None:
        super().__init__(transfer_messages.RECIPIENT_MISMATCH)
