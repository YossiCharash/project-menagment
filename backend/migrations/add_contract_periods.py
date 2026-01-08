"""
Migration script to add contract_periods table
Run this script to add the contract_periods table for managing contract periods/years
"""
import asyncio
import sys
import os

# Add parent directory to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sqlalchemy import text
from backend.db.session import AsyncSessionLocal


async def add_contract_periods_table():
    """Add contract_periods table"""
    print("=" * 60)
    print("Adding contract_periods table...")
    print("=" * 60)
    
    async with AsyncSessionLocal() as session:
        try:
            # Check if table exists
            check_query = text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_name = 'contract_periods'
            """)
            result = await session.execute(check_query)
            exists = result.scalar() is not None
            
            if exists:
                print("✓ Table contract_periods already exists")
            else:
                # Create table
                create_query = text("""
                    CREATE TABLE contract_periods (
                        id SERIAL PRIMARY KEY,
                        project_id INTEGER NOT NULL,
                        start_date DATE NOT NULL,
                        end_date DATE NOT NULL,
                        contract_year INTEGER NOT NULL,
                        year_index INTEGER NOT NULL DEFAULT 1,
                        total_income NUMERIC(14, 2) NOT NULL DEFAULT 0,
                        total_expense NUMERIC(14, 2) NOT NULL DEFAULT 0,
                        total_profit NUMERIC(14, 2) NOT NULL DEFAULT 0,
                        budgets_snapshot TEXT,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT fk_contract_periods_project_id 
                            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                    )
                """)
                await session.execute(create_query)
                
                # Create indexes
                indexes = [
                    "CREATE INDEX IF NOT EXISTS ix_contract_periods_project_id ON contract_periods(project_id)",
                    "CREATE INDEX IF NOT EXISTS ix_contract_periods_start_date ON contract_periods(start_date)",
                    "CREATE INDEX IF NOT EXISTS ix_contract_periods_end_date ON contract_periods(end_date)",
                    "CREATE INDEX IF NOT EXISTS ix_contract_periods_contract_year ON contract_periods(contract_year)",
                    "CREATE INDEX IF NOT EXISTS ix_contract_periods_year_index ON contract_periods(year_index)"
                ]
                
                for index_query in indexes:
                    await session.execute(text(index_query))
                
                await session.commit()
                print("✓ Created contract_periods table")
                print("✓ Created indexes for contract_periods table")
            
            print("\n" + "=" * 60)
            print("✅ Migration completed successfully!")
            print("=" * 60)
                
        except Exception as e:
            await session.rollback()
            print(f"\n❌ Error running migration: {e}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    asyncio.run(add_contract_periods_table())

