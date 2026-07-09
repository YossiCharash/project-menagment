"""CEMS model registration aggregator.

Importing this module imports every CEMS model module for its side effect:
registering the mapped tables on the shared ``Base.metadata``. It replaces the
former ``backend.cems.models`` package barrel after CEMS was flattened into the
main backend layout (one ``cems_*`` module per model file).

The imports are intentionally side-effect only; ``__all__`` re-exports the
concrete classes so callers that need names can import them from one place.
"""

from backend.models.cems_base import CEMSBase, TimestampMixin
from backend.models.cems_warehouse import Warehouse, WarehouseProject, ManagerHistory
from backend.models.cems_category import AssetCategory
from backend.models.cems_project import CemsProject, Project
from backend.models.cems_fixed_asset import FixedAsset, AssetStatus, AssetHistory
from backend.models.cems_consumable import (
    ConsumableItem,
    ConsumptionLog,
    StockAlert,
    AlertType,
)
from backend.models.cems_consumable_movement import (
    ConsumableMovementLog,
    ConsumableMovementAction,
)
from backend.models.cems_transfer import (
    Transfer,
    TransferStatus,
    WarehouseReturn,
    ReturnStatus,
)
from backend.models.cems_reorder import ReorderRequest, ReorderStatus
from backend.models.cems_retirement import AssetRetirement, RetirementStatus
from backend.models.cems_signature import Signature, SignatureType
from backend.models.cems_document import CemsDocument, Document, DocumentType

__all__ = [
    "CEMSBase",
    "TimestampMixin",
    "Warehouse",
    "WarehouseProject",
    "ManagerHistory",
    "AssetCategory",
    "CemsProject",
    "Project",
    "FixedAsset",
    "AssetStatus",
    "AssetHistory",
    "ConsumableItem",
    "ConsumptionLog",
    "StockAlert",
    "AlertType",
    "ConsumableMovementLog",
    "ConsumableMovementAction",
    "Transfer",
    "TransferStatus",
    "WarehouseReturn",
    "ReturnStatus",
    "ReorderRequest",
    "ReorderStatus",
    "AssetRetirement",
    "RetirementStatus",
    "Signature",
    "SignatureType",
    "CemsDocument",
    "Document",
    "DocumentType",
]
