from datetime import date, timedelta

from sqlalchemy import select, delete, func
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
        await self.db.delete(tx)  # async - marks object for deletion
        await self.db.commit()  # async - commits the deletion
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
        Optionally filters by project contract period dates in SQL.
        Returns list of dicts ready for TransactionOut schema.
        """
        import time
        from sqlalchemy import text, and_, or_
        from datetime import datetime
        
        # Log start time for performance monitoring
        start_time = time.time()

        # Build WHERE clause with optional date filtering
        where_conditions = ["t.project_id = :project_id"]
        params = {"project_id": project_id}
        
        # Add date filtering if project has contract period dates
        if project_start_date and project_end_date:
            # Include transactions within contract period OR fund transactions
            where_conditions.append(
                "(COALESCE(t.from_fund, false) = true OR "
                "(t.tx_date >= :start_date AND t.tx_date <= :end_date))"
            )
            params["start_date"] = project_start_date
            params["end_date"] = project_end_date
        
        where_clause = " AND ".join(where_conditions)
        
        # Query with JOIN to users to avoid N+1 queries
        query = text(f"""
            SELECT t.id,
                   t.project_id,
                   t.tx_date,
                   t.type,
                   t.amount,
                   t.description,
                   t.category_id,
                   c.name as category_name,
                   t.payment_method,
                   t.notes,
                   t.is_exceptional,
                   t.is_generated,
                   t.file_path,
                   t.supplier_id,
                   t.created_by_user_id,
                   t.created_at,
                   COALESCE(t.from_fund, false) as from_fund,
                   t.recurring_template_id,
                   t.period_start_date,
                   t.period_end_date,
                   CASE
                       WHEN u.id IS NOT NULL THEN json_build_object(
                               'id', u.id,
                               'full_name', u.full_name,
                               'email', u.email
                           )
                       ELSE NULL END AS created_by_user
            FROM transactions t
            LEFT JOIN users u ON u.id = t.created_by_user_id
            LEFT JOIN categories c ON c.id = t.category_id
            WHERE {where_clause}
            ORDER BY t.tx_date DESC
        """)
        
        result = await self.db.execute(query, params)
        rows = result.fetchall()

        
        # Convert rows to dicts
        transactions = []
        for row in rows:
            try:
                # Convert row to dict
                if hasattr(row, '_mapping'):
                    row_dict = dict(row._mapping)
                elif hasattr(row, '_asdict'):
                    row_dict = row._asdict()
                elif isinstance(row, dict):
                    row_dict = row
                else:
                    # Fallback: create dict from row tuple
                    row_dict = {
                        'id': row[0], 'project_id': row[1], 'tx_date': row[2],
                        'type': row[3], 'amount': row[4], 'description': row[5],
                        'category_id': row[6], 'category': row[7], 'payment_method': row[8],
                        'notes': row[9], 'is_exceptional': row[10], 'is_generated': row[11],
                        'file_path': row[12], 'supplier_id': row[13], 'created_by_user_id': row[14],
                        'created_at': row[15], 'from_fund': row[16], 'recurring_template_id': row[17],
                        'period_start_date': row[18], 'period_end_date': row[19],
                        'created_by_user': row[20]
                    }
                
                # Parse created_by_user JSON if it's a string
                import json
                created_by_user = row_dict.get('created_by_user')
                if isinstance(created_by_user, str):
                    try:
                        created_by_user = json.loads(created_by_user)
                    except (json.JSONDecodeError, TypeError):
                        created_by_user = None
                
                # Handle is_generated logic: if recurring_template_id exists but is_generated is False, set to True
                is_generated_value = row_dict.get('is_generated', False)
                recurring_template_id = row_dict.get('recurring_template_id')
                if recurring_template_id and not is_generated_value:
                    is_generated_value = True
                
                row_dict['is_generated'] = is_generated_value
                row_dict['created_by_user'] = created_by_user
                
                # Add category name to row_dict (it may be named 'category_name' in the result)
                # If category_name exists, use it as category; otherwise set category to None
                if 'category_name' in row_dict:
                    row_dict['category'] = row_dict.get('category_name')
                else:
                    row_dict['category'] = None
                
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
        Handles period transactions by calculating proportional amounts for the month"""
        from sqlalchemy import and_, or_
        from datetime import date as date_type
        
        # Calculate month end date
        if month_start.month == 12:
            month_end = date_type(month_start.year + 1, 1, 1)
        else:
            month_end = date_type(month_start.year, month_start.month + 1, 1)
        
        # 1. Regular income (no period dates) in month
        regular_income_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Income",
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
        
        # 2. Regular expenses (no period dates) in month
        regular_expense_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Expense",
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
        
        regular_income = float((await self.db.execute(regular_income_query)).scalar_one() or 0.0)
        regular_expense = float((await self.db.execute(regular_expense_query)).scalar_one() or 0.0)
        
        # 3. Period income that overlaps with month
        period_income_query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Income",
                Transaction.from_fund == False,  # Exclude fund transactions
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                # Overlap: (StartA <= EndB) and (EndA >= StartB)
                Transaction.period_start_date < month_end,
                Transaction.period_end_date >= month_start
            )
        )
        
        # 4. Period expenses that overlap with month
        period_expense_query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Expense",
                Transaction.from_fund == False,  # Exclude fund transactions
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                # Overlap: (StartA <= EndB) and (EndA >= StartB)
                Transaction.period_start_date < month_end,
                Transaction.period_end_date >= month_start
            )
        )
        
        period_income_txs = (await self.db.execute(period_income_query)).scalars().all()
        period_expense_txs = (await self.db.execute(period_expense_query)).scalars().all()
        
        # Calculate proportional amounts for period income
        period_income = 0.0
        for tx in period_income_txs:
            total_days = (tx.period_end_date - tx.period_start_date).days + 1
            if total_days <= 0:
                continue
            
            daily_rate = float(tx.amount) / total_days
            
            # Calculate overlap with month
            overlap_start = max(tx.period_start_date, month_start)
            # month_end is the first day of next month, so subtract 1 day to get last day of current month
            month_end_date = month_end - timedelta(days=1)
            overlap_end = min(tx.period_end_date, month_end_date)
            
            overlap_days = (overlap_end - overlap_start).days + 1
            if overlap_days > 0:
                period_income += daily_rate * overlap_days
        
        # Calculate proportional amounts for period expenses
        period_expense = 0.0
        for tx in period_expense_txs:
            total_days = (tx.period_end_date - tx.period_start_date).days + 1
            if total_days <= 0:
                continue
            
            daily_rate = float(tx.amount) / total_days
            
            # Calculate overlap with month
            overlap_start = max(tx.period_start_date, month_start)
            # month_end is the first day of next month, so subtract 1 day to get last day of current month
            month_end_date = month_end - timedelta(days=1)
            overlap_end = min(tx.period_end_date, month_end_date)
            
            overlap_days = (overlap_end - overlap_start).days + 1
            if overlap_days > 0:
                period_expense += daily_rate * overlap_days
        
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
