from datetime import date, timedelta

from sqlalchemy import select, delete, func, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.transaction import Transaction
from backend.repositories.base import BaseRepository


class TransactionRepository(BaseRepository[Transaction]):
    model = Transaction

    async def create(self, entity: Transaction) -> Transaction:
        self.db.add(entity)
        await self.db.commit()
        await self.db.refresh(entity)
        return entity

    async def update(self, entity: Transaction) -> Transaction:
        await self.db.commit()
        await self.db.refresh(entity)
        return entity

    async def delete(self, entity: Transaction) -> None:
        await self.db.delete(entity)
        await self.db.commit()

    async def list_by_project(self, project_id: int, exclude_fund: bool = False) -> list[Transaction]:
        """List transactions for a project, optionally excluding fund transactions"""
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
        from backend.services.mappers import transaction_to_dict

        query = select(Transaction).where(Transaction.project_id == project_id)

        if project_start_date and project_end_date:
            query = query.where(
                or_(
                    Transaction.from_fund == True,
                    and_(
                        Transaction.tx_date >= project_start_date,
                        Transaction.tx_date <= project_end_date
                    ),
                    and_(
                        Transaction.period_start_date.is_not(None),
                        Transaction.period_end_date.is_not(None),
                        Transaction.period_start_date <= project_end_date,
                        Transaction.period_end_date >= project_start_date
                    )
                )
            )

        query = query.order_by(Transaction.tx_date.desc())

        result = await self.db.execute(query)
        tx_list = result.scalars().all()

        transactions = []
        for tx in tx_list:
            try:
                transactions.append(transaction_to_dict(tx))
            except Exception:
                continue

        return transactions

    async def delete_by_project(self, project_id: int) -> None:
        await self.db.execute(delete(Transaction).where(Transaction.project_id == project_id))
        await self.db.commit()

    async def get_transaction_value(self, project_id: int) -> float:
        """Get transaction value excluding fund transactions"""
        res = await self.db.execute(
            select(func.sum(Transaction.amount)).where(
                and_(
                    Transaction.project_id == project_id,
                    Transaction.from_fund == False
                )
            )
        )
        return res.scalar() or 0.0

    async def get_monthly_financial_summary(self, project_id: int, month_start: date) -> dict:
        """Get monthly financial summary for a project (excluding fund transactions).
        Handles period transactions by calculating proportional amounts for the month.

        OPTIMIZED: 2 queries instead of 4 (combined income+expense with CASE WHEN,
        single query for all period transactions)."""
        from backend.services.financial_utils import calculate_proportional_period_amount
        from datetime import date as date_type

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
                Transaction.from_fund == False,
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

        # Query 2: ALL period transactions that overlap with month
        period_query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.from_fund == False,
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                Transaction.period_start_date < month_end,
                Transaction.period_end_date >= month_start
            )
        )

        period_txs = (await self.db.execute(period_query)).scalars().all()

        period_income = 0.0
        period_expense = 0.0
        month_end_date = month_end - timedelta(days=1)

        for tx in period_txs:
            proportional = calculate_proportional_period_amount(
                amount=float(tx.amount),
                period_start=tx.period_start_date,
                period_end=tx.period_end_date,
                range_start=month_start,
                range_end=month_end_date,
            )
            if tx.type == "Income":
                period_income += proportional
            else:
                period_expense += proportional

        total_income = regular_income + period_income
        total_expense = regular_expense + period_expense

        return {
            "income": total_income,
            "expense": total_expense,
            "profit": total_income - total_expense
        }

    async def get_transactions_without_proof(self, project_id: int, month_start: date) -> int:
        """Count transactions without file attachments for a project in a given month"""
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
        from datetime import date as date_type

        current_date = date_type.today()

        query = select(func.count(Transaction.id)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Expense",
                Transaction.is_exceptional == False,
                Transaction.tx_date < current_date,
                Transaction.file_path.is_(None),
                Transaction.from_fund == False
            )
        )
        return (await self.db.execute(query)).scalar_one() or 0
