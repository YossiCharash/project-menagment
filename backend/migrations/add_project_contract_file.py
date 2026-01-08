"""
Migration script to add contract_file_url column to projects table.
Run this script once to allow storing a link to the building contract file.
"""
import asyncio
import os
import sys

from sqlalchemy import text

# Ensure backend directory is on the path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.db.session import AsyncSessionLocal


async def add_contract_file_column():
    """Add contract_file_url column to projects table if it does not exist."""
    print("=" * 60)
    print("Adding contract_file_url column to projects table...")
    print("=" * 60)

    async with AsyncSessionLocal() as session:
        try:
            # Check if column already exists
            check_query = text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'projects'
                  AND column_name = 'contract_file_url'
                """
            )
            result = await session.execute(check_query)
            exists = result.scalar() is not None

            if exists:
                print("✓ Column contract_file_url already exists")
            else:
                alter_query = text(
                    """
                    ALTER TABLE projects
                    ADD COLUMN contract_file_url VARCHAR(500)
                    """
                )
                await session.execute(alter_query)
                await session.commit()
                print("✓ Added contract_file_url column to projects table")

            print("\n" + "=" * 60)
            print("✅ Migration completed successfully!")
            print("=" * 60)
        except Exception as exc:
            await session.rollback()
            print(f"\n❌ Error running migration: {exc}")
            import traceback

            traceback.print_exc()
            raise


if __name__ == "__main__":
    asyncio.run(add_contract_file_column())

