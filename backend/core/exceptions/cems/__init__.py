"""Custom CEMS exceptions.

Each domain raises its own typed exception. A single FastAPI handler
(:func:`cems_exception_handler`) translates them to JSON responses,
so services never construct ``HTTPException`` directly.
"""

from backend.core.exceptions.cems.base import (
    CEMSAuthError,
    CEMSConflictError,
    CEMSError,
    CEMSNotFoundError,
    CEMSPermissionError,
    CEMSValidationError,
)
from backend.core.exceptions.cems.alert_exceptions import StockAlertNotFoundError
from backend.core.exceptions.cems.asset_exceptions import (
    AssetAlreadyHasActiveTransferError,
    AssetNotAssignableError,
    AssetNotFoundError,
    AssetNotRetirableError,
    AssetNotReturnableError,
    AssetNotTransferableError,
    AssetUnassignedError,
)
from backend.core.exceptions.cems.category_exceptions import (
    CategoryCycleDetectedError,
    CategoryDescendantAsParentError,
    CategoryHasItemsError,
    CategoryMaxDepthExceededError,
    CategoryNotFoundError,
    CategorySelfParentError,
    ParentCategoryNotFoundError,
)
from backend.core.exceptions.cems.consumable_exceptions import (
    ConsumableItemNotFoundError,
    InsufficientStockError,
    NonPositiveQuantityError,
    SameWarehouseTransferError,
)
from backend.core.exceptions.cems.document_exceptions import (
    DocumentDeleteForbiddenError,
    DocumentNotFoundError,
    FileNotOnDiskError,
)
from backend.core.exceptions.cems.file_exceptions import (
    FileTooLargeError,
    UnsupportedFileExtensionError,
)
from backend.core.exceptions.cems.handlers import (
    cems_exception_handler,
    register_cems_exception_handlers,
)
from backend.core.exceptions.cems.reorder_exceptions import (
    ReorderAlreadyCancelledError,
    ReorderAlreadyReceivedError,
    ReorderInvalidTransitionError,
    ReorderNotFoundError,
)
from backend.core.exceptions.cems.retirement_exceptions import (
    RetirementApproverNotFoundError,
    RetirementNotFoundError,
    RetirementNotPendingError,
    RetirementUnauthorizedError,
)
from backend.core.exceptions.cems.return_exceptions import (
    ReturnWarehouseNotFoundError,
    WarehouseReturnNotFoundError,
    WarehouseReturnNotPendingError,
    WarehouseReturnUnauthorizedError,
)
from backend.core.exceptions.cems.transfer_exceptions import (
    TransferNotFoundError,
    TransferNotPendingError,
    TransferRecipientMismatchError,
)
from backend.core.exceptions.cems.user_exceptions import (
    CEMSRoleRequiredError,
    InvalidCredentialsError,
    InvalidTokenError,
    NotAuthenticatedError,
    UserNotFoundError,
)
from backend.core.exceptions.cems.warehouse_exceptions import (
    ManagerNotFoundError,
    NotWarehouseManagerError,
    OnlyAdminOrWarehouseManagerError,
    WarehouseNotFoundError,
)

__all__ = [
    "CEMSError",
    "CEMSNotFoundError",
    "CEMSConflictError",
    "CEMSPermissionError",
    "CEMSValidationError",
    "CEMSAuthError",
    "cems_exception_handler",
    "register_cems_exception_handlers",
    "StockAlertNotFoundError",
    "AssetNotFoundError",
    "AssetNotTransferableError",
    "AssetUnassignedError",
    "AssetAlreadyHasActiveTransferError",
    "AssetNotRetirableError",
    "AssetNotReturnableError",
    "AssetNotAssignableError",
    "CategoryNotFoundError",
    "ParentCategoryNotFoundError",
    "CategorySelfParentError",
    "CategoryCycleDetectedError",
    "CategoryMaxDepthExceededError",
    "CategoryDescendantAsParentError",
    "CategoryHasItemsError",
    "ConsumableItemNotFoundError",
    "InsufficientStockError",
    "NonPositiveQuantityError",
    "SameWarehouseTransferError",
    "DocumentNotFoundError",
    "FileNotOnDiskError",
    "DocumentDeleteForbiddenError",
    "UnsupportedFileExtensionError",
    "FileTooLargeError",
    "ReorderNotFoundError",
    "ReorderInvalidTransitionError",
    "ReorderAlreadyReceivedError",
    "ReorderAlreadyCancelledError",
    "RetirementNotFoundError",
    "RetirementNotPendingError",
    "RetirementApproverNotFoundError",
    "RetirementUnauthorizedError",
    "WarehouseReturnNotFoundError",
    "WarehouseReturnNotPendingError",
    "WarehouseReturnUnauthorizedError",
    "ReturnWarehouseNotFoundError",
    "TransferNotFoundError",
    "TransferNotPendingError",
    "TransferRecipientMismatchError",
    "UserNotFoundError",
    "NotAuthenticatedError",
    "InvalidTokenError",
    "InvalidCredentialsError",
    "CEMSRoleRequiredError",
    "WarehouseNotFoundError",
    "ManagerNotFoundError",
    "NotWarehouseManagerError",
    "OnlyAdminOrWarehouseManagerError",
]
