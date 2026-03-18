"""
Database initialization - creates all tables, enums, and indexes.
All database schema is defined in the SQLAlchemy models in backend/models/
and backend/cems/models/.

This file only creates missing tables on first run; it never modifies existing schema.
Schema changes must be applied via SQL migration scripts in backend/migrations/.
"""
from sqlalchemy.ext.asyncio import AsyncEngine

from backend.db.base import Base

# ── Main application models ──────────────────────────────────────────────────
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

# ── CEMS models (same Base, so the same create_all covers them) ───────────────
from backend.cems.models import (  # noqa: F401
    Warehouse,
    Area,
    ManagerHistory,
    AssetCategory,
    Project as CemsProject,
    FixedAsset,
    AssetHistory,
    ConsumableItem,
    ConsumptionLog,
    StockAlert,
    Transfer,
    WarehouseReturn,
    AssetRetirement,
    Signature,
    Document as CemsDocument,
)


async def init_database(engine: AsyncEngine):
    """
    Initialize database — create all tables, enums, and indexes from SQLAlchemy models.
    Only creates tables/columns that do not yet exist; never alters existing schema.

    To apply schema changes, run the relevant SQL script from backend/migrations/ manually.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("Database initialization completed successfully")
