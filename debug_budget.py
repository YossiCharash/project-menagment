import asyncio
import sys
import os

sys.path.append(os.getcwd())

from sqlalchemy import select
from backend.db.session import AsyncSessionLocal
from backend.models.project import Project
from backend.models.budget import Budget
from backend.models.transaction import Transaction
from backend.models.category import Category

async def debug_budget():
    async with AsyncSessionLocal() as session:
        # Get all active projects
        stmt = select(Project).where(Project.is_active == True)
        projects = (await session.execute(stmt)).scalars().all()
        
        for project in projects:
            print(f"Project: {project.id} - {project.name}")
            print(f"  Annual Budget: {project.budget_annual}")
            
            # Get budgets
            stmt = select(Budget).where(Budget.project_id == project.id, Budget.is_active == True)
            budgets = (await session.execute(stmt)).scalars().all()
            
            for budget in budgets:
                print(f"    Budget ID: {budget.id}, Cat: '{budget.category}', Amount: {budget.amount}")
                if float(budget.amount) == 22000 or float(budget.amount) == 48000:
                    print("    *** FOUND MATCHING BUDGET ***")
                    
                    # Check expenses
                    cat_stmt = select(Category).where(Category.name == budget.category)
                    category = (await session.execute(cat_stmt)).scalar_one_or_none()
                    
                    if category:
                        tx_stmt = select(Transaction).where(
                            Transaction.project_id == project.id,
                            Transaction.type == 'Expense',
                            Transaction.category_id == category.id
                        )
                        transactions = (await session.execute(tx_stmt)).scalars().all()
                        total = sum(tx.amount for tx in transactions)
                        print(f"    Expenses for this budget: {total}")
                        print(f"    Transaction Count: {len(transactions)}")
                    else:
                        print(f"    Category '{budget.category}' not found in DB")

if __name__ == "__main__":
    asyncio.run(debug_budget())
