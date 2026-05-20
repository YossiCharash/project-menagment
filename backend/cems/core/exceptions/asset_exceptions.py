"""Exceptions raised by the fixed-asset domain."""

from backend.cems.core.exceptions.base import (
    CEMSConflictError,
    CEMSNotFoundError,
    CEMSValidationError,
)
from backend.cems.messages import asset_messages


class AssetNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(asset_messages.NOT_FOUND)


class AssetNotTransferableError(CEMSConflictError):
    def __init__(self, current_status: str) -> None:
        super().__init__(asset_messages.not_transferable(current_status))


class AssetUnassignedError(CEMSValidationError):
    def __init__(self) -> None:
        super().__init__(asset_messages.UNASSIGNED)


class AssetAlreadyHasActiveTransferError(CEMSConflictError):
    def __init__(self) -> None:
        super().__init__(asset_messages.ALREADY_ACTIVE_TRANSFER)


class AssetNotRetirableError(CEMSConflictError):
    def __init__(self, current_status: str) -> None:
        super().__init__(asset_messages.not_retirable(current_status))


class AssetNotReturnableError(CEMSConflictError):
    def __init__(self, current_status: str) -> None:
        super().__init__(asset_messages.not_returnable(current_status))


class AssetNotAssignableError(CEMSConflictError):
    def __init__(self, current_status: str) -> None:
        super().__init__(asset_messages.not_assignable(current_status))
