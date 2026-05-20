"""Exceptions raised by the reorder-request domain."""

from backend.cems.core.exceptions.base import CEMSConflictError, CEMSNotFoundError
from backend.cems.messages import reorder_messages


class ReorderNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(reorder_messages.NOT_FOUND)


class ReorderInvalidTransitionError(CEMSConflictError):
    def __init__(self, current_status: str, *, target: str) -> None:
        if target == "ordered":
            detail = reorder_messages.cannot_mark_ordered(current_status)
        elif target == "received":
            detail = reorder_messages.cannot_mark_received(current_status)
        else:
            raise ValueError(
                f"ReorderInvalidTransitionError got unsupported target='{target}'. "
                "Allowed: 'ordered' or 'received'."
            )
        super().__init__(detail)


class ReorderAlreadyReceivedError(CEMSConflictError):
    def __init__(self) -> None:
        super().__init__(reorder_messages.ALREADY_RECEIVED)


class ReorderAlreadyCancelledError(CEMSConflictError):
    def __init__(self) -> None:
        super().__init__(reorder_messages.ALREADY_CANCELLED)
