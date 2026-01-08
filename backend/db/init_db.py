"""
Database initialization - creates all tables, enums, and indexes
All database schema is defined in the SQLAlchemy models in backend/models/
This file simply ensures all models are imported and creates the database schema.
"""
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy import text

from backend.db.base import Base

# Import all models to ensure they are registered with Base.metadata
# This ensures all tables, enums, indexes, and relationships are defined
from backend.models import (  # noqa: F401
    User,
    Project,
    Subproject,
    Transaction,
    AuditLog,
    Supplier,
    SupplierDocument,
    AdminInvite,
    EmailVerification,
    RecurringTransactionTemplate,
    MemberInvite,
    Budget
)


async def init_database(engine: AsyncEngine):
    """
    Initialize database - create all tables, enums, and indexes
    All schema definitions come from SQLAlchemy models in backend/models/
    
    SQLAlchemy will automatically:
    - Create enums defined with SAEnum(native_enum=True) in models
    - Create tables with all columns as defined in models
    - Create indexes defined with mapped_column(index=True)
    - Create foreign keys defined with ForeignKey()
    - Create relationships as defined in models
    
    This should be called on application startup
    """
    try:
        # Create all tables, enums, indexes, and foreign keys from models
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        print("Database initialization completed successfully")
        print("All tables, enums, indexes, and relationships created from SQLAlchemy models")
    except OSError as e:
        # Connection errors - PostgreSQL is not running or not accessible
        error_msg = str(e)
        if "10061" in error_msg or "Connect call failed" in error_msg:
            print("\n" + "="*70)
            print("ERROR: Cannot connect to PostgreSQL database")
            print("="*70)
            print("\nPossible causes:")
            print("1. PostgreSQL is not running")
            print("   - On Windows: Check Services or run 'net start postgresql-x64-XX'")
            print("   - On Linux/Mac: Run 'sudo systemctl start postgresql' or 'brew services start postgresql'")
            print("2. PostgreSQL is running on a different port")
            print("   - Check your DATABASE_URL environment variable")
            print("   - Default is: postgresql+asyncpg://postgres:postgres@localhost:5432/bms")
            print("3. Database credentials are incorrect")
            print("   - Verify username, password, and database name in DATABASE_URL")
            print("\nTo fix:")
            print("- Start PostgreSQL service")
            print("- Verify DATABASE_URL in your .env file or environment variables")
            print("- Ensure the database 'bms' exists (or create it)")
            print("="*70 + "\n")
        else:
            print(f"Connection error: {e}")
        # Don't raise - allow the app to start even if migration fails
        # The migration will be retried on next startup
        import traceback
        traceback.print_exc()
    except Exception as e:
        print(f"Error during database initialization: {e}")
        # Don't raise - allow the app to start even if migration fails
        # The migration will be retried on next startup
        import traceback
        traceback.print_exc()
