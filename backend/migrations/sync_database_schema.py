"""
סקריפט מיגרציה מקיף לסינכרון בסיס הנתונים עם כל המודלים
בודק ומוסיף כל העמודות, אינדקסים ואילוצים החסרים
"""
import asyncio
import sys
import os

# Add parent directory to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
# Also add parent of backend_dir (project root)
project_root = os.path.dirname(backend_dir)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from sqlalchemy import text
from backend.db.session import AsyncSessionLocal


async def check_and_add_column(session, table_name: str, column_name: str, column_type: str, nullable: bool = True, default: str = None):
    """בדוק אם עמודה קיימת, ואם לא - הוסף אותה"""
    check_query = text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = :table_name 
        AND column_name = :column_name
    """)
    result = await session.execute(check_query, {"table_name": table_name, "column_name": column_name})
    exists = result.scalar() is not None
    
    if exists:
        print(f"  [OK] Column {table_name}.{column_name} already exists")
        return False
    
    # Build ALTER TABLE statement
    nullable_str = "NULL" if nullable else "NOT NULL"
    default_str = f" DEFAULT {default}" if default else ""
    alter_query = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type} {nullable_str}{default_str}"
    
    await session.execute(text(alter_query))
    print(f"  [OK] Added column {table_name}.{column_name}")
    return True


async def check_and_create_index(session, index_name: str, table_name: str, column_name: str):
    """בדוק אם אינדקס קיים, ואם לא - צור אותו"""
    check_query = text("""
        SELECT indexname 
        FROM pg_indexes 
        WHERE indexname = :index_name
    """)
    result = await session.execute(check_query, {"index_name": index_name})
    exists = result.scalar() is not None
    
    if exists:
        print(f"  [OK] Index {index_name} already exists")
        return False
    
    create_index_query = f"CREATE INDEX {index_name} ON {table_name}({column_name})"
    await session.execute(text(create_index_query))
    print(f"  [OK] Created index {index_name}")
    return True


async def check_and_add_foreign_key(session, constraint_name: str, table_name: str, column_name: str, referenced_table: str, referenced_column: str = "id"):
    """בדוק אם foreign key קיים, ואם לא - הוסף אותו"""
    check_query = text("""
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE constraint_name = :constraint_name
    """)
    result = await session.execute(check_query, {"constraint_name": constraint_name})
    exists = result.scalar() is not None
    
    if exists:
        print(f"  [OK] Foreign key {constraint_name} already exists")
        return False
    
    alter_query = f"""
        ALTER TABLE {table_name} 
        ADD CONSTRAINT {constraint_name} 
        FOREIGN KEY ({column_name}) REFERENCES {referenced_table}({referenced_column})
    """
    await session.execute(text(alter_query))
    print(f"  [OK] Added foreign key {constraint_name}")
    return True


async def check_and_create_enum(session, enum_name: str, enum_values: list[str]):
    """בדוק אם enum קיים, ואם לא - צור אותו"""
    check_query = text("""
        SELECT typname 
        FROM pg_type 
        WHERE typname = :enum_name
    """)
    result = await session.execute(check_query, {"enum_name": enum_name})
    exists = result.scalar() is not None
    
    if exists:
        print(f"  [OK] Enum {enum_name} already exists")
        return False
    
    values_str = ", ".join([f"'{v}'" for v in enum_values])
    create_enum_query = f"CREATE TYPE {enum_name} AS ENUM ({values_str})"
    await session.execute(text(create_enum_query))
    print(f"  [OK] Created enum {enum_name}")
    return True


async def sync_database_schema():
    """סנכרן את בסיס הנתונים עם כל המודלים"""
    print("=" * 60)
    print("Starting comprehensive database schema sync...")
    print("=" * 60)
    
    async with AsyncSessionLocal() as session:
        try:
            changes_made = False
            
            # 1. Create enums if needed
            print("\n[1/6] Checking enums...")
            await check_and_create_enum(session, "expense_category", ["ניקיון", "חשמל", "ביטוח", "גינון", "אחר"])
            await check_and_create_enum(session, "payment_method", ["הוראת קבע", "אשראי", "שיק", "מזומן", "העברה בנקאית", "גבייה מרוכזת סוף שנה"])
            await check_and_create_enum(session, "recurring_frequency", ["Monthly"])
            await check_and_create_enum(session, "recurring_end_type", ["No End", "After Occurrences", "On Date"])
            
            # 2. Sync users table
            print("\n[2/6] Syncing users table...")
            changes_made |= await check_and_add_column(session, "users", "group_id", "INTEGER", nullable=True)
            if changes_made:
                await check_and_create_index(session, "ix_users_group_id", "users", "group_id")
            changes_made |= await check_and_add_column(session, "users", "requires_password_change", "BOOLEAN", nullable=False, default="FALSE")
            changes_made |= await check_and_add_column(session, "users", "last_login", "TIMESTAMP WITHOUT TIME ZONE", nullable=True)
            
            # 3. Sync projects table
            print("\n[3/6] Syncing projects table...")
            changes_made |= await check_and_add_column(session, "projects", "num_residents", "INTEGER", nullable=True)
            changes_made |= await check_and_add_column(session, "projects", "monthly_price_per_apartment", "NUMERIC(10, 2)", nullable=True)
            changes_made |= await check_and_add_column(session, "projects", "address", "VARCHAR(255)", nullable=True)
            changes_made |= await check_and_add_column(session, "projects", "city", "VARCHAR(120)", nullable=True)
            changes_made |= await check_and_add_column(session, "projects", "relation_project", "INTEGER", nullable=True)
            changes_made |= await check_and_add_column(session, "projects", "image_url", "VARCHAR(500)", nullable=True)
            changes_made |= await check_and_add_column(session, "projects", "is_parent_project", "BOOLEAN", nullable=False, default="FALSE")
            if changes_made:
                await check_and_create_index(session, "ix_projects_is_parent_project", "projects", "is_parent_project")
            
            # 4. Sync suppliers table
            print("\n[4/6] Syncing suppliers table...")
            changes_made |= await check_and_add_column(session, "suppliers", "category", "VARCHAR(255)", nullable=True)
            if changes_made:
                await check_and_create_index(session, "ix_suppliers_category", "suppliers", "category")
            
            # 5. Sync transactions table
            print("\n[5/7] Syncing transactions table...")
            changes_made |= await check_and_add_column(session, "transactions", "supplier_id", "INTEGER", nullable=True)
            if changes_made:
                await check_and_create_index(session, "ix_transactions_supplier_id", "transactions", "supplier_id")
                await check_and_add_foreign_key(session, "transactions_supplier_id_fkey", "transactions", "supplier_id", "suppliers")
            
            changes_made |= await check_and_add_column(session, "transactions", "recurring_template_id", "INTEGER", nullable=True)
            if changes_made:
                await check_and_create_index(session, "ix_transactions_recurring_template_id", "transactions", "recurring_template_id")
                await check_and_add_foreign_key(session, "transactions_recurring_template_id_fkey", "transactions", "recurring_template_id", "recurring_transaction_templates")
            
            changes_made |= await check_and_add_column(session, "transactions", "is_generated", "BOOLEAN", nullable=False, default="FALSE")
            if changes_made:
                await check_and_create_index(session, "ix_transactions_is_generated", "transactions", "is_generated")
            
            # Add from_fund column to transactions
            changes_made |= await check_and_add_column(session, "transactions", "from_fund", "BOOLEAN", nullable=False, default="FALSE")
            if changes_made:
                await check_and_create_index(session, "ix_transactions_from_fund", "transactions", "from_fund")
            
            # 6. Sync supplier_documents table
            print("\n[6/7] Syncing supplier_documents table...")
            changes_made |= await check_and_add_column(session, "supplier_documents", "transaction_id", "INTEGER", nullable=True)
            if changes_made:
                await check_and_create_index(session, "ix_supplier_documents_transaction_id", "supplier_documents", "transaction_id")
                await check_and_add_foreign_key(session, "supplier_documents_transaction_id_fkey", "supplier_documents", "transaction_id", "transactions")
            
            # 7. Sync recurring_transaction_templates table
            print("\n[7/7] Syncing recurring_transaction_templates table...")
            # Check if table exists first
            table_check = text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_name = 'recurring_transaction_templates'
            """)
            result = await session.execute(table_check)
            table_exists = result.scalar() is not None
            
            if not table_exists:
                print("  [WARN] Table recurring_transaction_templates does not exist. Creating it...")
                # Create the table with all columns
                create_table_query = text("""
                    CREATE TABLE recurring_transaction_templates (
                        id SERIAL PRIMARY KEY,
                        project_id INTEGER NOT NULL,
                        description TEXT NOT NULL,
                        type VARCHAR(20) NOT NULL,
                        amount NUMERIC(14, 2) NOT NULL,
                        category_id INTEGER,
                        supplier_id INTEGER,
                        notes TEXT,
                        frequency recurring_frequency DEFAULT 'Monthly',
                        day_of_month INTEGER DEFAULT 1,
                        start_date DATE NOT NULL,
                        end_type recurring_end_type DEFAULT 'No End',
                        end_date DATE,
                        max_occurrences INTEGER,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT recurring_transaction_templates_project_id_fkey 
                            FOREIGN KEY (project_id) REFERENCES projects(id),
                        CONSTRAINT recurring_transaction_templates_category_id_fkey 
                            FOREIGN KEY (category_id) REFERENCES categories(id),
                        CONSTRAINT recurring_transaction_templates_supplier_id_fkey 
                            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                    )
                """)
                await session.execute(create_table_query)
                print("  ✓ Created table recurring_transaction_templates")
                
                # Create indexes
                await session.execute(text("CREATE INDEX ix_recurring_transaction_templates_project_id ON recurring_transaction_templates(project_id)"))
                await session.execute(text("CREATE INDEX ix_recurring_transaction_templates_type ON recurring_transaction_templates(type)"))
                await session.execute(text("CREATE INDEX ix_recurring_transaction_templates_is_active ON recurring_transaction_templates(is_active)"))
                await session.execute(text("CREATE INDEX ix_recurring_transaction_templates_start_date ON recurring_transaction_templates(start_date)"))
                changes_made = True
            else:
                # Table exists, check for missing columns
                changes_made |= await check_and_add_column(session, "recurring_transaction_templates", "updated_at", "TIMESTAMP WITHOUT TIME ZONE", nullable=False, default="CURRENT_TIMESTAMP")
                changes_made |= await check_and_add_column(session, "recurring_transaction_templates", "category_id", "INTEGER", nullable=True)
                changes_made |= await check_and_add_column(session, "recurring_transaction_templates", "supplier_id", "INTEGER", nullable=True)
                
                if changes_made:
                    await check_and_create_index(session, "ix_recurring_transaction_templates_supplier_id", "recurring_transaction_templates", "supplier_id")
                    await check_and_add_foreign_key(session, "recurring_transaction_templates_category_id_fkey", "recurring_transaction_templates", "category_id", "categories")
                    await check_and_add_foreign_key(session, "recurring_transaction_templates_supplier_id_fkey", "recurring_transaction_templates", "supplier_id", "suppliers")
            
            # Commit all changes
            if changes_made:
                await session.commit()
                print("\n" + "=" * 60)
                print("[OK] Database schema sync completed successfully!")
                print("=" * 60)
            else:
                print("\n" + "=" * 60)
                print("[OK] Database schema is already in sync. No changes needed.")
                print("=" * 60)
                
        except Exception as e:
            await session.rollback()
            print(f"\n[ERROR] Error syncing database schema: {e}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    asyncio.run(sync_database_schema())

