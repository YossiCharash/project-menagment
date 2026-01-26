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
    Budget,
    UnforeseenTransaction,
    UnforeseenTransactionExpense
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
        
        # Run migration to add contract_period_id to budgets table if it doesn't exist
        await _add_contract_period_id_to_budgets(engine)
        
        # Run migration to add contract_duration_months to projects table if it doesn't exist
        await _add_contract_duration_months_to_projects(engine)
        
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


async def _add_contract_period_id_to_budgets(engine: AsyncEngine):
    """Add contract_period_id column to budgets table if it doesn't exist"""
    try:
        async with engine.begin() as conn:
            # Check if column already exists
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'budgets' AND column_name = 'contract_period_id'
            """)
            result = await conn.execute(check_query)
            exists = result.scalar_one_or_none() is not None
            
            if exists:
                print("✓ Column contract_period_id already exists in budgets table")
            else:
                # Add contract_period_id column
                print("Adding contract_period_id column to budgets table...")
                alter_query = text("""
                    ALTER TABLE budgets
                    ADD COLUMN contract_period_id INTEGER
                """)
                await conn.execute(alter_query)
                
                # Add foreign key constraint (check if it exists first)
                fk_check_query = text("""
                    SELECT constraint_name 
                    FROM information_schema.table_constraints 
                    WHERE table_name = 'budgets' AND constraint_name = 'fk_budgets_contract_period_id'
                """)
                fk_result = await conn.execute(fk_check_query)
                fk_exists = fk_result.scalar_one_or_none() is not None
                
                if not fk_exists:
                    fk_query = text("""
                        ALTER TABLE budgets
                        ADD CONSTRAINT fk_budgets_contract_period_id 
                            FOREIGN KEY (contract_period_id) REFERENCES contract_periods(id) ON DELETE SET NULL
                    """)
                    await conn.execute(fk_query)
                
                # Create index
                index_query = text("""
                    CREATE INDEX IF NOT EXISTS ix_budgets_contract_period_id 
                    ON budgets(contract_period_id)
                """)
                await conn.execute(index_query)
                
                print("✓ Added contract_period_id column to budgets table successfully")
    except Exception as e:
        # Log but don't fail - column might already exist or there might be a constraint issue
        print(f"Note: Could not add contract_period_id column (may already exist): {e}")


async def _add_contract_duration_months_to_projects(engine: AsyncEngine):
    """Add contract_duration_months column to projects table if it doesn't exist"""
    try:
        async with engine.begin() as conn:
            # Check if column already exists
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'projects' AND column_name = 'contract_duration_months'
            """)
            result = await conn.execute(check_query)
            exists = result.scalar_one_or_none() is not None
            
            if exists:
                print("✓ Column contract_duration_months already exists in projects table")
            else:
                # Add contract_duration_months column
                print("Adding contract_duration_months column to projects table...")
                alter_query = text("""
                    ALTER TABLE projects
                    ADD COLUMN contract_duration_months INTEGER
                """)
                await conn.execute(alter_query)
                
                print("✓ Added contract_duration_months column to projects table successfully")
    except Exception as e:
        # Log but don't fail - column might already exist or there might be a constraint issue
        print(f"Note: Could not add contract_duration_months column (may already exist): {e}")
