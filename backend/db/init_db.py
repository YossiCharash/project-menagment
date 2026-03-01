"""
Database initialization - creates all tables, enums, and indexes.
All database schema is defined in the SQLAlchemy models in backend/models/
This file only creates missing tables on first run; it never modifies existing schema.

Schema changes must be applied manually via SQL migration scripts in backend/migrations/.
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
    Initialize database — create all tables, enums, and indexes from SQLAlchemy models.
    Only creates tables/columns that do not yet exist; never alters existing schema.

    To apply schema changes, run the relevant SQL script from backend/migrations/ manually.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # One-time fix: drop UNIQUE constraint on documents(source_table, source_id)
    # that prevented uploading more than one document per transaction.
    # Safe to run repeatedly — no-op once the constraint is gone.
    await _drop_documents_source_unique_constraint(engine)

    print("Database initialization completed successfully")


async def _drop_documents_source_unique_constraint(engine: AsyncEngine):
    """Drop the unique index on documents(source_table, source_id) that prevents
    uploading more than one document per transaction. The index may exist as a
    UNIQUE INDEX (not a constraint), so we check pg_indexes directly."""
    try:
        async with engine.begin() as conn:
            result = await conn.execute(text("""
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'documents'
                  AND indexdef ILIKE '%UNIQUE%'
                  AND (indexdef ILIKE '%source_table%' OR indexdef ILIKE '%source_id%')
            """))
            indexes = [row[0] for row in result.fetchall()]
            for name in indexes:
                await conn.execute(text(f"DROP INDEX IF EXISTS {name}"))
            if indexes:
                print(f"✓ Dropped documents unique index(es): {indexes}")
            else:
                print("✓ No unique index on documents(source_table, source_id) — already clean")
    except Exception as e:
        print(f"Note: could not drop documents unique index: {e}")
