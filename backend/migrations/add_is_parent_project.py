"""
Migration script to add is_parent_project column to projects table
Run this script to add the is_parent_project column
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


async def add_is_parent_project_column():
    """Add is_parent_project column to projects table"""
    print("=" * 60)
    print("Adding is_parent_project column to projects table...")
    print("=" * 60)
    
    async with AsyncSessionLocal() as session:
        try:
            # Check if column exists
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'projects' 
                AND column_name = 'is_parent_project'
            """)
            result = await session.execute(check_query)
            exists = result.scalar() is not None
            
            if exists:
                print("✓ Column is_parent_project already exists in projects table")
            else:
                # Add column
                alter_query = text("""
                    ALTER TABLE projects 
                    ADD COLUMN is_parent_project BOOLEAN NOT NULL DEFAULT FALSE
                """)
                await session.execute(alter_query)
                
                # Create index
                index_query = text("""
                    CREATE INDEX IF NOT EXISTS ix_projects_is_parent_project 
                    ON projects(is_parent_project)
                """)
                await session.execute(index_query)
                
                await session.commit()
                print("✓ Added is_parent_project column to projects table")
                print("✓ Created index ix_projects_is_parent_project")
            
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
    asyncio.run(add_is_parent_project_column())

