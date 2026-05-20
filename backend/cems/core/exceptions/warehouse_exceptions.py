"""Exceptions raised by the warehouse domain."""

from backend.cems.core.exceptions.base import CEMSNotFoundError, CEMSPermissionError
from backend.cems.messages import warehouse_messages


class WarehouseNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(warehouse_messages.NOT_FOUND)


class ManagerNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(warehouse_messages.NEW_MANAGER_NOT_FOUND)


class OnlyAdminOrWarehouseManagerError(CEMSPermissionError):
    def __init__(self) -> None:
        super().__init__(warehouse_messages.ONLY_ADMIN_OR_WAREHOUSE_MANAGER)


class NotWarehouseManagerError(CEMSPermissionError):
    def __init__(self) -> None:
        super().__init__(warehouse_messages.NOT_THIS_WAREHOUSE_MANAGER)
