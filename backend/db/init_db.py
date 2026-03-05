"""
Database initialization - creates all tables, enums, and indexes.
All database schema is defined in the SQLAlchemy models in backend/models/
This file only creates missing tables on first run; it never modifies existing schema.

Schema changes must be applied via SQL migration scripts in backend/migrations/.
"""
from sqlalchemy.ext.asyncio import AsyncEngine

from backend.db.base import Base

# Import all models to ensure they are registered with Base.metadata
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


async def init_database(engine: AsyncEngine):
    """
    Initialize a *tenant* database — creates all tenant tables from SQLAlchemy models.
    Only creates tables/columns that do not yet exist; never alters existing schema.

    To apply schema changes, run the relevant SQL script from backend/migrations/ manually.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("Database initialization completed successfully")


async def init_master_database(engine: AsyncEngine):
    """
    Initialize the *master* database — creates the tenants table (MasterBase metadata).
    Called once on startup against the master engine, after init_database().
    """
    from backend.master.models import MasterBase  # local import to avoid circular deps

    async with engine.begin() as conn:
        await conn.run_sync(MasterBase.metadata.create_all)

    print("Master database initialization completed successfully")
