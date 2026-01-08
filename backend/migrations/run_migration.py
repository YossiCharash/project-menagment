"""
Script to run database migrations
Run this script to add the transaction_id column to supplier_documents table
"""
import asyncio
import asyncpg
from backend.core.config import settings


async def run_migration():
    """Run migration to add transaction_id to supplier_documents"""
    # Parse database URL
    db_url = settings.DATABASE_URL
    # Extract connection parameters from URL
    # Format: postgresql://user:password@host:port/database
    if db_url.startswith('postgresql://'):
        db_url = db_url.replace('postgresql://', 'postgresql+asyncpg://', 1)
    
    # Parse the URL
    import re
    match = re.match(r'postgresql\+?asyncpg?://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', db_url)
    if not match:
        print("Could not parse database URL. Please run the SQL script manually.")
        return
    
    user, password, host, port, database = match.groups()
    
    # Read SQL file
    sql_file = 'backend/migrations/add_transaction_id_to_supplier_documents.sql'
    try:
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql = f.read()
    except FileNotFoundError:
        print(f"SQL file not found: {sql_file}")
        return
    
    # Connect and execute
    try:
        conn = await asyncpg.connect(
            user=user,
            password=password,
            host=host,
            port=int(port),
            database=database
        )
        print("Connected to database. Running migration...")
        await conn.execute(sql)
        print("Migration completed successfully!")
        await conn.close()
    except Exception as e:
        print(f"Error running migration: {e}")
        print("\nPlease run the SQL script manually:")
        print(f"psql -U {user} -d {database} -f {sql_file}")


if __name__ == "__main__":
    asyncio.run(run_migration())

