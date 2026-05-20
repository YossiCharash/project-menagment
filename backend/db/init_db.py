"""
Database initialization - creates all tables, enums, and indexes.
All database schema is defined in the SQLAlchemy models in backend/models/.

This file only creates missing tables on first run; it never modifies existing schema.
Schema changes must be applied via SQL migration scripts in backend/migrations/.
"""
from sqlalchemy.ext.asyncio import AsyncEngine

from backend.db.base import Base

from backend.models import (  # noqa: F401
    User,
    Project,
    Subproject,
    Transaction,
    AuditLog,
    Supplier,
    Document,
    Invite,
    EmailVerification,
    RecurringTransactionTemplate,
    Budget,
    UnforeseenTransaction,
    UnforeseenTransactionLine,
    QuoteStructureItem,
    QuoteSubject,
    QuoteProject,
    QuoteLine,
    Task,
    TaskAttachment,
    TaskMessage,
    UserNotification,
    GroupTransactionDraft,
    GroupTransactionDraftDocument,
)

from backend.models.cems_warehouse import Warehouse, ManagerHistory  # noqa: F401
from backend.models.cems_category import AssetCategory  # noqa: F401
from backend.models.cems_project import CemsProject  # noqa: F401
from backend.models.cems_fixed_asset import FixedAsset, AssetHistory  # noqa: F401
from backend.models.cems_consumable import (  # noqa: F401
    ConsumableItem,
    ConsumptionLog,
    StockAlert,
)
from backend.models.cems_consumable_movement import ConsumableMovementLog  # noqa: F401
from backend.models.cems_transfer import Transfer, WarehouseReturn  # noqa: F401
from backend.models.cems_retirement import AssetRetirement  # noqa: F401
from backend.models.cems_reorder import ReorderRequest  # noqa: F401
from backend.models.cems_signature import Signature  # noqa: F401
from backend.models.cems_document import CemsDocument  # noqa: F401


async def init_database(engine: AsyncEngine):
    """
    Initialize database — create all tables, enums, and indexes from SQLAlchemy models.
    Only creates tables/columns that do not yet exist; never alters existing schema.

    To apply schema changes, run the relevant SQL script from backend/migrations/ manually.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("Database initialization completed successfully")
