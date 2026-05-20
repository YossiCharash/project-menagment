"""Exceptions raised by the consumable-inventory domain."""

from backend.cems.core.exceptions.base import CEMSConflictError, CEMSNotFoundError, CEMSValidationError
from backend.cems.messages import consumable_messages


class ConsumableItemNotFoundError(CEMSNotFoundError):
    def __init__(self, *, short: bool = False) -> None:
        msg = (
            consumable_messages.ITEM_NOT_FOUND_SHORT
            if short
            else consumable_messages.ITEM_NOT_FOUND
        )
        super().__init__(msg)


class InsufficientStockError(CEMSConflictError):
    def __init__(self, available: object, requested: object) -> None:
        super().__init__(consumable_messages.insufficient_stock(available, requested))


class NonPositiveQuantityError(CEMSValidationError):
    def __init__(self) -> None:
        super().__init__(consumable_messages.QUANTITY_MUST_BE_POSITIVE)


class SameWarehouseTransferError(CEMSValidationError):
    def __init__(self) -> None:
        super().__init__(consumable_messages.SAME_WAREHOUSE)
