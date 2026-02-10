from sqlalchemy import select, and_, func, or_, case
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from typing import Tuple, Optional
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
        active_only: bool = True,
        contract_period_id: int | None = None
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
                Budget.category == category_name,  # Budget stores category as string (name)
                Budget.contract_period_id == contract_period_id  # Filter by contract period
            )
        )
        if active_only:
            stmt = stmt.where(Budget.is_active == True)  # noqa: E712
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_active_budgets_for_project(self, project_id: int, contract_period_id: int | None = None) -> list[Budget]:
        """Get all active budgets for a project, optionally filtered by contract period"""
        conditions = [
            Budget.project_id == project_id,
            Budget.is_active == True  # noqa: E712
        ]
        # Handle None properly for SQL - use is_(None) instead of == None
        if contract_period_id is None:
            conditions.append(Budget.contract_period_id.is_(None))
        else:
            conditions.append(Budget.contract_period_id == contract_period_id)
        
        stmt = select(Budget).where(and_(*conditions))
        res = await self.db.execute(stmt.order_by(Budget.start_date.desc()))
        return list(res.scalars().all())

    async def calculate_spending_for_budget(
        self, 
        budget: Budget, 
        as_of_date: date | None = None,
        contract_period: "Optional[object]" = ...,
        category_ids: "Optional[list[int]]" = None,
    ) -> Tuple[float, float]:
        """Calculate spending breakdown for a budget's category within the budget period.
        If budget is linked to a contract period, filter transactions by contract period dates.
        Returns (total_expenses, total_income).
        
        OPTIMIZED: Accepts pre-loaded contract_period and category_ids to avoid redundant
        queries when called in a loop. Pass contract_period=None to skip lookup,
        or omit (sentinel ...) to auto-load from DB.
        Combined 4 queries into 2 (CASE WHEN for regular, single query for period txs).
        """
        if as_of_date is None:
            as_of_date = date.today()
        
        # If budget is linked to a contract period, use contract period dates for filtering
        # Otherwise, use budget dates
        if budget.contract_period_id:
            # Allow caller to pass pre-loaded contract_period to avoid re-querying
            if contract_period is ...:
                from backend.models.contract_period import ContractPeriod
                contract_period_result = await self.db.execute(
                    select(ContractPeriod).where(ContractPeriod.id == budget.contract_period_id)
                )
                contract_period = contract_period_result.scalar_one_or_none()
            
            if contract_period:
                # Use contract period dates (end_date is EXCLUSIVE, so use end_date - 1 day as the last day)
                from datetime import timedelta
                start_date = contract_period.start_date
                # end_date is EXCLUSIVE in contract periods, so the last day is end_date - 1
                end_date = contract_period.end_date - timedelta(days=1) if contract_period.end_date else as_of_date
            else:
                # Contract period not found, fall back to budget dates
                start_date = budget.start_date
                end_date = budget.end_date if budget.end_date else as_of_date
        else:
            # No contract period, use budget dates
            start_date = budget.start_date
            end_date = budget.end_date if budget.end_date else as_of_date
        
        # Allow caller to pass pre-loaded category_ids to avoid re-querying
        if category_ids is None:
            # Get category_ids from category name (Budget stores category as string name)
            # Handle case where multiple categories might have the same name (due to removed unique constraint)
            from backend.models.category import Category
            category_result = await self.db.execute(
                select(Category.id).where(Category.name == budget.category)
            )
            category_ids = list(category_result.scalars().all())
        
        # If category not found, return zero spending
        if not category_ids:
            return 0.0, 0.0
        
        # Query 1: Regular expenses + income in a single query using CASE WHEN
        regular_query = select(
            func.coalesce(func.sum(case(
                (Transaction.type == "Expense", Transaction.amount),
                else_=0
            )), 0).label("expenses"),
            func.coalesce(func.sum(case(
                (Transaction.type == "Income", Transaction.amount),
                else_=0
            )), 0).label("income"),
        ).where(
            and_(
                Transaction.project_id == budget.project_id,
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
        
        regular_result = await self.db.execute(regular_query)
        regular_row = regular_result.one()
        total_expenses = float(regular_row.expenses or 0.0)
        total_income = float(regular_row.income or 0.0)
        
        # Query 2: ALL period transactions that overlap with budget period (income + expense)
        period_query = select(Transaction).where(
            and_(
                Transaction.project_id == budget.project_id,
                Transaction.category_id.in_(category_ids),
                Transaction.from_fund == False,  # Exclude fund transactions
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                # Overlap: (StartA <= EndB) and (EndA >= StartB)
                Transaction.period_start_date <= end_date,
                Transaction.period_end_date >= start_date
            )
        )
        
        period_txs = (await self.db.execute(period_query)).scalars().all()
        
        # Calculate proportional amounts for period transactions
        for tx in period_txs:
            total_days = (tx.period_end_date - tx.period_start_date).days + 1
            if total_days <= 0:
                continue
            
            daily_rate = float(tx.amount) / total_days
            
            # Calculate overlap with budget period
            overlap_start = max(tx.period_start_date, start_date)
            overlap_end = min(tx.period_end_date, end_date)
            
            overlap_days = (overlap_end - overlap_start).days + 1
            if overlap_days > 0:
                proportional_amount = daily_rate * overlap_days
                if tx.type == "Expense":
                    total_expenses += proportional_amount
                else:
                    total_income += proportional_amount
        
        return total_expenses, total_income

