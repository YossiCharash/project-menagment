"""Custom CEMS exceptions.

Each domain raises its own typed exception. A single FastAPI handler
(:func:`cems_exception_handler`) translates them to JSON responses,
so services never construct ``HTTPException`` directly.
"""

from backend.cems.core.exceptions.base import (
    CEMSAuthError,
    CEMSConflictError,
    CEMSError,
    CEMSNotFoundError,
    CEMSPermissionError,
    CEMSValidationError,
)
from backend.cems.core.exceptions.alert_exceptions import StockAlertNotFoundError
from backend.cems.core.exceptions.asset_exceptions import (
    AssetAlreadyHasActiveTransferError,
    AssetNotAssignableError,
    AssetNotFoundError,
    AssetNotRetirableError,
    AssetNotReturnableError,
    AssetNotTransferableError,
    AssetUnassignedError,
)
from backend.cems.core.exceptions.category_exceptions import (
    CategoryCycleDetectedError,
    CategoryDescendantAsParentError,
    CategoryHasItemsError,
    CategoryMaxDepthExceededError,
    CategoryNotFoundError,
    CategorySelfParentError,
    ParentCategoryNotFoundError,
)
from backend.cems.core.exceptions.consumable_exceptions import (
    ConsumableItemNotFoundError,
    InsufficientStockError,
    NonPositiveQuantityError,
    SameWarehouseTransferError,
)
from backend.cems.core.exceptions.document_exceptions import (
    DocumentDeleteForbiddenError,
    DocumentNotFoundError,
    FileNotOnDiskError,
)
from backend.cems.core.exceptions.file_exceptions import (
    FileTooLargeError,
    UnsupportedFileExtensionError,
)
from backend.cems.core.exceptions.handlers import (
    cems_exception_handler,
    register_cems_exception_handlers,
)
from backend.cems.core.exceptions.reorder_exceptions import (
    ReorderAlreadyCancelledError,
    ReorderAlreadyReceivedError,
    ReorderInvalidTransitionError,
    ReorderNotFoundError,
)
from backend.cems.core.exceptions.retirement_exceptions import (
    RetirementApproverNotFoundError,
    RetirementNotFoundError,
    RetirementNotPendingError,
    RetirementUnauthorizedError,
)
from backend.cems.core.exceptions.return_exceptions import (
    ReturnWarehouseNotFoundError,
    WarehouseReturnNotFoundError,
    WarehouseReturnNotPendingError,
    WarehouseReturnUnauthorizedError,
)
from backend.cems.core.exceptions.transfer_exceptions import (
    TransferNotFoundError,
    TransferNotPendingError,
    TransferRecipientMismatchError,
)
from backend.cems.core.exceptions.user_exceptions import (
    CEMSRoleRequiredError,
    InvalidCredentialsError,
    InvalidTokenError,
    NotAuthenticatedError,
    UserNotFoundError,
)
from backend.cems.core.exceptions.warehouse_exceptions import (
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
