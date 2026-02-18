from datetime import date, timedelta

from sqlalchemy import select, delete, func, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.transaction import Transaction


class TransactionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, tx_id: int) -> Transaction | None:
        res = await self.db.execute(select(Transaction).where(Transaction.id == tx_id))
        return res.scalar_one_or_none()

    async def create(self, tx: Transaction) -> Transaction:
        self.db.add(tx)
        await self.db.commit()
        await self.db.refresh(tx)
        return tx

    async def update(self, tx: Transaction) -> Transaction:
        await self.db.commit()
        await self.db.refresh(tx)
        return tx

    async def delete(self, tx: Transaction) -> bool:
        await self.db.delete(tx)  # marks object for deletion
        await self.db.commit()  # commits the deletion
        return True

    async def list_by_project(self, project_id: int, exclude_fund: bool = False) -> list[Transaction]:
        """List transactions for a project, optionally excluding fund transactions"""
        from sqlalchemy import and_
        if exclude_fund:
            res = await self.db.execute(
                select(Transaction).where(
                    and_(
                        Transaction.project_id == project_id,
                        Transaction.from_fund == False
                    )
                )
            )
        else:
            res = await self.db.execute(select(Transaction).where(Transaction.project_id == project_id))
        return list(res.scalars().all())

    async def list_by_project_with_users(
        self, 
        project_id: int, 
        project_start_date: date | None = None,
        project_end_date: date | None = None
    ) -> list[dict]:
        """
        List transactions for a project with user info loaded via JOIN (no N+1 queries).
        Optionally filters by project contract period dates using parameterized SQLAlchemy queries.
        Returns list of dicts ready for TransactionOut schema.
        """
        from sqlalchemy import and_, or_
        from sqlalchemy.orm import selectinload
        from backend.models.user import User
        from backend.models.category import Category

        # Build query using SQLAlchemy ORM (safe from SQL injection)
        query = select(Transaction).where(Transaction.project_id == project_id)

        # Add date filtering if project has contract period dates
        if project_start_date and project_end_date:
            query = query.where(
                or_(
                    # Fund transactions always included
                    Transaction.from_fund == True,
                    # Regular transactions within tx_date range
                    and_(
                        Transaction.tx_date >= project_start_date,
                        Transaction.tx_date <= project_end_date
                    ),
                    # Period transactions that overlap with the range
                    and_(
                        Transaction.period_start_date.is_not(None),
                        Transaction.period_end_date.is_not(None),
                        Transaction.period_start_date <= project_end_date,
                        Transaction.period_end_date >= project_start_date
                    )
                )
            )

        query = query.order_by(Transaction.tx_date.desc())

        # Execute with eager loading of relationships
        result = await self.db.execute(query)
        tx_list = result.scalars().all()

        # Convert ORM objects to dicts
        transactions = []
        for tx in tx_list:
            try:
                # Build created_by_user object
                created_by_user = None
                if tx.created_by_user:
                    created_by_user = {
                        'id': tx.created_by_user.id,
                        'full_name': tx.created_by_user.full_name,
                        'email': tx.created_by_user.email
                    }

                # Handle is_generated logic
                is_generated_value = tx.is_generated
                if tx.recurring_template_id and not is_generated_value:
                    is_generated_value = True

                # Get category name from relationship
                category_name = tx.category.name if tx.category else None

                row_dict = {
                    'id': tx.id,
                    'project_id': tx.project_id,
                    'tx_date': tx.tx_date,
                    'type': tx.type,
                    'amount': float(tx.amount),
                    'description': tx.description,
                    'category_id': tx.category_id,
                    'category': category_name,
                    'payment_method': tx.payment_method,  # TypeDecorator handles conversion
                    'notes': tx.notes,
                    'is_exceptional': tx.is_exceptional,
                    'is_generated': is_generated_value,
                    'file_path': tx.file_path,
                    'supplier_id': tx.supplier_id,
                    'created_by_user_id': tx.created_by_user_id,
                    'created_at': tx.created_at,
                    'from_fund': tx.from_fund or False,
                    'recurring_template_id': tx.recurring_template_id,
                    'period_start_date': tx.period_start_date,
                    'period_end_date': tx.period_end_date,
                    'created_by_user': created_by_user,
                }

                transactions.append(row_dict)
            except Exception:
                # Skip malformed rows
                continue

        return transactions

    async def delete_by_project(self, project_id: int) -> None:
        await self.db.execute(delete(Transaction).where(Transaction.project_id == project_id))
        await self.db.commit()

    async def get_transaction_value(self, project_id: int) -> float:
        """Get transaction value excluding fund transactions"""
        from sqlalchemy import and_
        res = await self.db.execute(
            select(func.sum(Transaction.amount)).where(
                and_(
                    Transaction.project_id == project_id,
                    Transaction.from_fund == False  # Exclude fund transactions
                )
            )
        )
        return res.scalar() or 0.0

    async def get_monthly_financial_summary(self, project_id: int, month_start: date) -> dict:
        """Get monthly financial summary for a project (excluding fund transactions)
        Handles period transactions by calculating proportional amounts for the month.
        
        OPTIMIZED: 2 queries instead of 4 (combined income+expense with CASE WHEN,
        single query for all period transactions)."""
        from sqlalchemy import and_, or_, case
        from datetime import date as date_type
        
        # Calculate month end date
        if month_start.month == 12:
            month_end = date_type(month_start.year + 1, 1, 1)
        else:
            month_end = date_type(month_start.year, month_start.month + 1, 1)
        
        # Query 1: Regular income + expense in a single query using CASE WHEN
        regular_query = select(
            func.coalesce(func.sum(case(
                (Transaction.type == "Income", Transaction.amount),
                else_=0
            )), 0).label("income"),
            func.coalesce(func.sum(case(
                (Transaction.type == "Expense", Transaction.amount),
                else_=0
            )), 0).label("expense"),
        ).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.tx_date >= month_start,
                Transaction.tx_date < month_end,
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
        regular_income = float(regular_row.income or 0.0)
        regular_expense = float(regular_row.expense or 0.0)
        
        # Query 2: ALL period transactions that overlap with month (income + expense together)
        period_query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.from_fund == False,  # Exclude fund transactions
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                # Overlap: (StartA <= EndB) and (EndA >= StartB)
                Transaction.period_start_date < month_end,
                Transaction.period_end_date >= month_start
            )
        )
        
        period_txs = (await self.db.execute(period_query)).scalars().all()
        
        # Calculate proportional amounts for period transactions (income + expense)
        period_income = 0.0
        period_expense = 0.0
        month_end_date = month_end - timedelta(days=1)
        
        for tx in period_txs:
            total_days = (tx.period_end_date - tx.period_start_date).days + 1
            if total_days <= 0:
                continue
            
            daily_rate = float(tx.amount) / total_days
            
            # Calculate overlap with month
            overlap_start = max(tx.period_start_date, month_start)
            # month_end is the first day of next month, so subtract 1 day to get last day of current month
            overlap_end = min(tx.period_end_date, month_end_date)
            
            overlap_days = (overlap_end - overlap_start).days + 1
            if overlap_days > 0:
                proportional_amount = daily_rate * overlap_days
                if tx.type == "Income":
                    period_income += proportional_amount
                else:
                    period_expense += proportional_amount
        
        total_income = regular_income + period_income
        total_expense = regular_expense + period_expense
        
        return {
            "income": total_income,
            "expense": total_expense,
            "profit": total_income - total_expense
        }

    async def get_transactions_without_proof(self, project_id: int, month_start: date) -> int:
        """Count transactions without file attachments for a project in a given month"""
        from sqlalchemy import and_
        
        query = select(func.count(Transaction.id)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.file_path.is_(None),
                Transaction.tx_date >= month_start
            )
        )
        
        return (await self.db.execute(query)).scalar_one() or 0

    async def get_unpaid_recurring_count(self, project_id: int) -> int:
        """Count unpaid recurring expenses for a project (excluding fund transactions)"""
        from sqlalchemy import and_
        from datetime import date
        
        current_date = date.today()
        
        query = select(func.count(Transaction.id)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Expense",
                Transaction.is_exceptional == False,
                Transaction.tx_date < current_date,
                Transaction.file_path.is_(None),
                Transaction.from_fund == False  # Exclude fund transactions
            )
        )
        
        return (await self.db.execute(query)).scalar_one() or 0
