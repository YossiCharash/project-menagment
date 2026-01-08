from sqlalchemy import select, and_, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from typing import Tuple
from backend.models.budget import Budget
from backend.models.transaction import Transaction


class BudgetRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, budget_id: int) -> Budget | None:
        res = await self.db.execute(select(Budget).where(Budget.id == budget_id))
        return res.scalar_one_or_none()

    async def create(self, budget: Budget) -> Budget:
        self.db.add(budget)
        await self.db.commit()
        await self.db.refresh(budget)
        return budget

    async def update(self, budget: Budget) -> Budget:
        await self.db.commit()
        await self.db.refresh(budget)
        return budget

    async def delete(self, budget: Budget) -> None:
        await self.db.delete(budget)
        await self.db.commit()

    async def list_by_project(self, project_id: int, active_only: bool = True) -> list[Budget]:
        stmt = select(Budget).where(Budget.project_id == project_id)
        if active_only:
            stmt = stmt.where(Budget.is_active == True)  # noqa: E712
        res = await self.db.execute(stmt.order_by(Budget.start_date.desc()))
        return list(res.scalars().all())

    async def get_by_project_and_category(
        self,
        project_id: int,
        category_id: int,
        active_only: bool = True
    ) -> Budget | None:
        # First get the category name from category_id
        from backend.models.category import Category
        category_result = await self.db.execute(
            select(Category.name).where(Category.id == category_id)
        )
        category_name = category_result.scalar_one_or_none()
        if not category_name:
            return None
        
        stmt = select(Budget).where(
            and_(
                Budget.project_id == project_id,
                Budget.category == category_name  # Budget stores category as string (name)
            )
        )
        if active_only:
            stmt = stmt.where(Budget.is_active == True)  # noqa: E712
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_active_budgets_for_project(self, project_id: int) -> list[Budget]:
        """Get all active budgets for a project"""
        return await self.list_by_project(project_id, active_only=True)

    async def calculate_spending_for_budget(
        self, 
        budget: Budget, 
        as_of_date: date | None = None
    ) -> Tuple[float, float]:
        """Calculate spending breakdown for a budget's category within the budget period.
        Returns (total_expenses, total_income).
        """
        if as_of_date is None:
            as_of_date = date.today()
        
        # Determine the date range for the budget
        start_date = budget.start_date
        end_date = budget.end_date if budget.end_date else as_of_date
        
        # Get category_ids from category name (Budget stores category as string name)
        # Handle case where multiple categories might have the same name (due to removed unique constraint)
        from backend.models.category import Category
        category_result = await self.db.execute(
            select(Category.id).where(Category.name == budget.category)
        )
        category_ids = category_result.scalars().all()
        
        # If category not found, return zero spending
        if not category_ids:
            return 0.0, 0.0
        
        # 1. Regular expenses (no period dates) in range
        regular_expenses_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == budget.project_id,
                Transaction.type == "Expense",
                Transaction.category_id.in_(category_ids),
                Transaction.tx_date >= start_date,
                Transaction.tx_date <= end_date,
                Transaction.from_fund == False,  # Exclude fund transactions
                # Explicitly exclude period transactions
                or_(
                    Transaction.period_start_date.is_(None),
                    Transaction.period_end_date.is_(None)
                )
            )
        )
        
        # 2. Regular income (no period dates) in range
        regular_income_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == budget.project_id,
                Transaction.type == "Income",
                Transaction.category_id.in_(category_ids),
                Transaction.tx_date >= start_date,
                Transaction.tx_date <= end_date,
                Transaction.from_fund == False,  # Exclude fund transactions
                # Explicitly exclude period transactions
                or_(
                    Transaction.period_start_date.is_(None),
                    Transaction.period_end_date.is_(None)
                )
            )
        )
        
        regular_expenses_result = await self.db.execute(regular_expenses_query)
        regular_income_result = await self.db.execute(regular_income_query)
        
        total_expenses = float(regular_expenses_result.scalar_one() or 0.0)
        total_income = float(regular_income_result.scalar_one() or 0.0)
        
        # 3. Period expenses that overlap with budget period
        period_expenses_query = select(Transaction).where(
            and_(
                Transaction.project_id == budget.project_id,
                Transaction.type == "Expense",
                Transaction.category_id.in_(category_ids),
                Transaction.from_fund == False,  # Exclude fund transactions
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                # Overlap: (StartA <= EndB) and (EndA >= StartB)
                Transaction.period_start_date <= end_date,
                Transaction.period_end_date >= start_date
            )
        )
        
        # 4. Period income that overlaps with budget period
        period_income_query = select(Transaction).where(
            and_(
                Transaction.project_id == budget.project_id,
                Transaction.type == "Income",
                Transaction.category_id.in_(category_ids),
                Transaction.from_fund == False,  # Exclude fund transactions
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                # Overlap: (StartA <= EndB) and (EndA >= StartB)
                Transaction.period_start_date <= end_date,
                Transaction.period_end_date >= start_date
            )
        )
        
        period_expenses = (await self.db.execute(period_expenses_query)).scalars().all()
        period_income = (await self.db.execute(period_income_query)).scalars().all()
        
        # Calculate proportional amounts for period expenses
        for tx in period_expenses:
            total_days = (tx.period_end_date - tx.period_start_date).days + 1
            if total_days <= 0:
                continue
            
            daily_rate = float(tx.amount) / total_days
            
            # Calculate overlap with budget period
            overlap_start = max(tx.period_start_date, start_date)
            overlap_end = min(tx.period_end_date, end_date)
            
            overlap_days = (overlap_end - overlap_start).days + 1
            if overlap_days > 0:
                total_expenses += daily_rate * overlap_days
        
        # Calculate proportional amounts for period income
        for tx in period_income:
            total_days = (tx.period_end_date - tx.period_start_date).days + 1
            if total_days <= 0:
                continue
            
            daily_rate = float(tx.amount) / total_days
            
            # Calculate overlap with budget period
            overlap_start = max(tx.period_start_date, start_date)
            overlap_end = min(tx.period_end_date, end_date)
            
            overlap_days = (overlap_end - overlap_start).days + 1
            if overlap_days > 0:
                total_income += daily_rate * overlap_days
        
        return total_expenses, total_income

