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
    UnforeseenTransactionExpense,
    QuoteStructureItem,
    QuoteSubject,
    QuoteProject,
    QuoteLine,
    Task,
    TaskAttachment,
    UserNotification,
    GroupTransactionDraft,
    GroupTransactionDraftDocument,
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
        
        # Run migration: quote_subjects table + quote_subject_id on quote_projects
        await _add_quote_subjects(engine)
        
        # Run migration: add composite indexes to transactions for performance
        await _add_composite_indexes_to_transactions(engine)

        # Run migration: add assignee_acknowledged_at to tasks (לקוח מאשר קבלת משימה)
        await _add_assignee_acknowledged_at_to_tasks(engine)
        
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


async def _add_quote_subjects(engine: AsyncEngine):
    """Create quote_subjects table and add quote_subject_id to quote_projects if not exist."""
    try:
        async with engine.begin() as conn:
            # Check if quote_subjects table exists
            check_table = text("""
                SELECT 1 FROM information_schema.tables WHERE table_name = 'quote_subjects'
            """)
            result = await conn.execute(check_table)
            table_exists = result.scalar_one_or_none() is not None
            if not table_exists:
                print("Creating quote_subjects table...")
                await conn.execute(text("""
                    CREATE TABLE quote_subjects (
                        id SERIAL PRIMARY KEY,
                        address VARCHAR(255),
                        num_apartments INTEGER,
                        num_buildings INTEGER,
                        notes TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    )
                """))
                print("✓ Created quote_subjects table")
            else:
                print("✓ quote_subjects table already exists")
            # Add quote_subject_id to quote_projects if not exists
            check_col = text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'quote_projects' AND column_name = 'quote_subject_id'
            """)
            r2 = await conn.execute(check_col)
            col_exists = r2.scalar_one_or_none() is not None
            if not col_exists:
                print("Adding quote_subject_id to quote_projects...")
                await conn.execute(text("""
                    ALTER TABLE quote_projects ADD COLUMN quote_subject_id INTEGER REFERENCES quote_subjects(id) ON DELETE RESTRICT
                """))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_quote_projects_quote_subject_id ON quote_projects(quote_subject_id)"))
                print("✓ Added quote_subject_id to quote_projects")
            else:
                print("✓ quote_subject_id already exists on quote_projects")
    except Exception as e:
        print(f"Note: Could not add quote_subjects (may already exist): {e}")


async def _add_composite_indexes_to_transactions(engine: AsyncEngine):
    """Add composite indexes to transactions table for query performance.
    Uses CREATE INDEX IF NOT EXISTS so it's safe to run multiple times."""
    try:
        async with engine.begin() as conn:
            indexes = [
                ("ix_transactions_project_type_date", "transactions(project_id, type, tx_date)"),
                ("ix_transactions_project_category_type_date", "transactions(project_id, category_id, type, tx_date)"),
                ("ix_transactions_project_period", "transactions(project_id, period_start_date, period_end_date)"),
                ("ix_transactions_project_fund_date", "transactions(project_id, from_fund, tx_date)"),
            ]
            for idx_name, idx_def in indexes:
                await conn.execute(text(
                    f"CREATE INDEX IF NOT EXISTS {idx_name} ON {idx_def}"
                ))
            print("✓ Composite indexes on transactions table are up to date")
    except Exception as e:
        print(f"Note: Could not add composite indexes to transactions (may already exist): {e}")


async def _add_assignee_acknowledged_at_to_tasks(engine: AsyncEngine):
    """Add assignee_acknowledged_at column to tasks table if it doesn't exist."""
    try:
        async with engine.begin() as conn:
            check_query = text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'tasks' AND column_name = 'assignee_acknowledged_at'
            """)
            result = await conn.execute(check_query)
            exists = result.scalar_one_or_none() is not None
            if exists:
                print("✓ Column assignee_acknowledged_at already exists in tasks table")
            else:
                print("Adding assignee_acknowledged_at column to tasks table...")
                await conn.execute(text("""
                    ALTER TABLE tasks ADD COLUMN assignee_acknowledged_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
                """))
                await conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS ix_tasks_assignee_acknowledged_at ON tasks(assignee_acknowledged_at)
                """))
                print("✓ Added assignee_acknowledged_at column to tasks table successfully")
    except Exception as e:
        print(f"Note: Could not add assignee_acknowledged_at (may already exist): {e}")
