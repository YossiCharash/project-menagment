"""Exceptions raised by the warehouse-return domain."""

from backend.core.exceptions.cems.base import (
    CEMSConflictError,
    CEMSNotFoundError,
    CEMSPermissionError,
    CEMSValidationError,
)
from backend.messages.cems import return_messages


class WarehouseReturnNotFoundError(CEMSNotFoundError):
    def __init__(self, *, short: bool = False) -> None:
        msg = return_messages.RETURN_NOT_FOUND_SHORT if short else return_messages.NOT_FOUND
        super().__init__(msg)


class WarehouseReturnNotPendingError(CEMSConflictError):
    def __init__(self) -> None:
        super().__init__(return_messages.NOT_PENDING)


class WarehouseReturnUnauthorizedError(CEMSPermissionError):
    def __init__(self) -> None:
        super().__init__(return_messages.UNAUTHORIZED)


class ReturnWarehouseNotFoundError(CEMSValidationError):
    def __init__(self) -> None:
        super().__init__(return_messages.RETURN_WAREHOUSE_NOT_FOUND)
