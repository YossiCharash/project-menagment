from sqlalchemy.ext.asyncio import AsyncSession
from backend.repositories.project_repository import ProjectRepository
from backend.models.project import Project
from backend.repositories.transaction_repository import TransactionRepository
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta


def calculate_start_date(project_start_date: date | None) -> date:
    """Calculate the start date for financial calculations: max(project_start_date, 1 year ago)"""
    current_date = date.today()
    one_year_ago = current_date - relativedelta(years=1)
    
    if project_start_date:
        # Return the later date (more recent)
        return max(project_start_date, one_year_ago)
    else:
        # If no project start date, use 1 year ago
        return one_year_ago


def calculate_monthly_income_amount(monthly_income: float, income_start_date: date, current_date: date) -> float:
    """
    Calculate expected income based on a fixed monthly amount that accrues on the same day of month as the start date.
    Income starts accruing from income_start_date, and then every month on that same day.
    For example, if start_date is 2024-01-15, income accrues on 15th of each month.
    """
    if monthly_income <= 0:
        return 0.0
    if income_start_date > current_date:
        return 0.0

    # Income accrues on the same day of month as the start date
    # First occurrence is on the start date itself
    first_occurrence = income_start_date
    
    if first_occurrence > current_date:
        return 0.0

    # Calculate how many monthly occurrences have passed from first_occurrence to current_date
    # Count occurrences on the same day of month (or last day of month if day doesn't exist)
    occurrences = 0
    occurrence_date = first_occurrence
    original_day = first_occurrence.day  # Remember the original day of month
    
    # Count all occurrences from start date to current date (inclusive)
    while occurrence_date <= current_date:
        occurrences += 1
        
        # Calculate next occurrence date
        if occurrence_date.month == 12:
            next_year = occurrence_date.year + 1
            next_month = 1
        else:
            next_year = occurrence_date.year
            next_month = occurrence_date.month + 1
        
        # Try to use the original day of month, but handle edge cases
        try:
            next_occurrence = date(next_year, next_month, original_day)
        except ValueError:
            # If day doesn't exist in this month (e.g., 31st in February), use last day of month
            if next_month == 12:
                next_month_date = date(next_year + 1, 1, 1)
            else:
                next_month_date = date(next_year, next_month + 1, 1)
            next_occurrence = next_month_date - timedelta(days=1)
        
        # Move to next occurrence for next iteration
        occurrence_date = next_occurrence

    return monthly_income * occurrences


async def calculate_recurring_transactions_amount(
    db: AsyncSession,
    project_id: int,
    start_date: date,
    end_date: date,
    transaction_type: str
) -> float:
    """Calculate the amount of recurring transactions (especially monthly) from start_date to end_date"""
    from sqlalchemy import select, and_, func
    from backend.models.recurring_transaction import RecurringTransactionTemplate
    from backend.models.transaction import Transaction
    
    # Get all active recurring transaction templates for this project and type
    templates_query = select(RecurringTransactionTemplate).where(
        and_(
            RecurringTransactionTemplate.project_id == project_id,
            RecurringTransactionTemplate.type == transaction_type,
            RecurringTransactionTemplate.is_active == True
        )
    )
    templates_result = await db.execute(templates_query)
    templates = list(templates_result.scalars().all())
    
    total_amount = 0.0
    
    for template in templates:
        # Only process monthly recurring transactions
        if template.frequency != "Monthly":
            continue
        
        # Calculate how many months from start_date to end_date
        # Start from the first occurrence on or after start_date
        template_start = max(template.start_date, start_date)
        
        # If template has an end_date, use the earlier of end_date or end_date parameter
        effective_end = end_date
        if template.end_type == "On Date" and template.end_date:
            effective_end = min(template.end_date, end_date)
        
        if template_start > effective_end:
            continue
        
        # Calculate months between template_start and effective_end
        # For monthly recurring, count how many times it should occur
        current_month = date(template_start.year, template_start.month, 1)
        end_month = date(effective_end.year, effective_end.month, 1)
        
        month_count = 0
        while current_month <= end_month:
            # Check if the day_of_month falls within the date range
            # For the first month, check if day_of_month is on or after template_start
            # For the last month, check if day_of_month is on or before effective_end
            occurrence_date = date(current_month.year, current_month.month, min(template.day_of_month, 28))
            
            # Handle months with fewer days (e.g., day 31 in February)
            try:
                occurrence_date = date(current_month.year, current_month.month, template.day_of_month)
            except ValueError:
                # If day doesn't exist in this month, use last day of month
                if current_month.month == 12:
                    next_month = date(current_month.year + 1, 1, 1)
                else:
                    next_month = date(current_month.year, current_month.month + 1, 1)
                occurrence_date = next_month - timedelta(days=1)
            
            # Check if this occurrence is within the date range
            if occurrence_date >= template_start and occurrence_date <= effective_end:
                # Check if transaction already exists (was actually generated)
                existing_query = select(func.count(Transaction.id)).where(
                    and_(
                        Transaction.project_id == project_id,
                        Transaction.recurring_template_id == template.id,
                        Transaction.tx_date == occurrence_date
                    )
                )
                existing_count = (await db.execute(existing_query)).scalar_one() or 0
                
                # If transaction exists, use its amount (might have been modified)
                if existing_count > 0:
                    tx_query = select(Transaction).where(
                        and_(
                            Transaction.project_id == project_id,
                            Transaction.recurring_template_id == template.id,
                            Transaction.tx_date == occurrence_date
                        )
                    ).limit(1)
                    tx_result = await db.execute(tx_query)
                    existing_tx = tx_result.scalar_one_or_none()
                    if existing_tx:
                        total_amount += float(existing_tx.amount)
                    else:
                        total_amount += float(template.amount)
                else:
                    # Transaction doesn't exist yet, use template amount
                    total_amount += float(template.amount)
            
            # Move to next month
            if current_month.month == 12:
                current_month = date(current_month.year + 1, 1, 1)
            else:
                current_month = date(current_month.year, current_month.month + 1, 1)
            
            month_count += 1
            # Safety check to prevent infinite loops
            if month_count > 120:  # Max 10 years
                break
    
    return total_amount


class ProjectService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.projects = ProjectRepository(db)
        self.transactions = TransactionRepository(db)

    async def get_value_of_projects(self, project_id: int):
        proj: Project = await self.projects.get_by_id(project_id=project_id)
        if not proj:
            return None
            
        # Get real-time financial data
        financial_data = await self.get_project_financial_data(project_id)
        
        project_data = {
            "id": proj.id,
            "name": proj.name,
            "description": proj.description,
            "start_date": proj.start_date,
            "end_date": proj.end_date,
            "budget_monthly": proj.budget_monthly,
            "budget_annual": proj.budget_annual,
            "num_residents": proj.num_residents,
            "monthly_price_per_apartment": proj.monthly_price_per_apartment,
            "address": proj.address,
            "city": proj.city,
            "relation_project": proj.relation_project,
            "is_active": proj.is_active,
            "manager_id": proj.manager_id,
            "created_at": proj.created_at,
            "contract_file_url": proj.contract_file_url,
            **financial_data
        }
        return project_data

    async def calculate_period_expenses(
        self,
        project_id: int,
        start_date: date,
        end_date: date,
        from_fund: bool = False
    ) -> float:
        """
        Calculate total expenses for a period, handling both regular transactions (sum)
        and period-based transactions (pro-rated split).
        """
        from sqlalchemy import select, and_, func, or_
        from backend.models.transaction import Transaction

        # 1. Regular expenses (no period dates) in range
        query_regular = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Expense",
                Transaction.from_fund == from_fund,
                Transaction.tx_date >= start_date,
                Transaction.tx_date <= end_date,
                # Explicitly exclude period transactions
                or_(
                    Transaction.period_start_date.is_(None),
                    Transaction.period_end_date.is_(None)
                )
            )
        )
        regular_expense = float((await self.db.execute(query_regular)).scalar_one())
        
        # 2. Period expenses that overlap with range
        query_period = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Expense",
                Transaction.from_fund == from_fund,
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                # Overlap: (StartA <= EndB) and (EndA >= StartB)
                Transaction.period_start_date <= end_date,
                Transaction.period_end_date >= start_date
            )
        )
        period_txs = (await self.db.execute(query_period)).scalars().all()
        
        period_expense = 0.0
        for tx in period_txs:
            # Total duration of the transaction
            total_days = (tx.period_end_date - tx.period_start_date).days + 1
            if total_days <= 0: continue
            
            daily_rate = float(tx.amount) / total_days
            
            # Calculate overlap with [start_date, end_date]
            overlap_start = max(tx.period_start_date, start_date)
            overlap_end = min(tx.period_end_date, end_date)
            
            overlap_days = (overlap_end - overlap_start).days + 1
            if overlap_days > 0:
                period_expense += daily_rate * overlap_days
                
        return regular_expense + period_expense

    async def get_project_financial_data(self, project_id: int) -> dict:
        """Get real-time financial calculations for a project - from project start date until now
        Only actual transactions are counted - budget is NOT included in income"""
        from sqlalchemy import func, select, and_
        from backend.models.transaction import Transaction
        from dateutil.relativedelta import relativedelta
        
        # Get project to access start_date
        project = await self.projects.get_by_id(project_id)
        if not project:
            return {
                "total_value": 0,
                "income_month_to_date": 0,
                "expense_month_to_date": 0,
                "profit_percent": 0,
                "status_color": "yellow"
            }
        
        current_date = date.today()
        
        # Calculate start date: use project.start_date if available, otherwise use 1 year ago as fallback
        if project.start_date:
            calculation_start_date = project.start_date
        else:
            # Fallback: use 1 year ago if no project start date
            calculation_start_date = current_date - relativedelta(years=1)
        
        # Get actual transactions from calculation_start_date to now (exclude fund transactions)
        # Only actual transactions are counted - budget is NOT included
        actual_income_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Income",
                Transaction.tx_date >= calculation_start_date,
                Transaction.tx_date <= current_date,
                Transaction.from_fund == False  # Exclude fund transactions
            )
        )
        
        actual_income = float((await self.db.execute(actual_income_query)).scalar_one())
        
        # Calculate expenses using the new logic that handles period splitting
        actual_expense = await self.calculate_period_expenses(
            project_id, 
            calculation_start_date, 
            current_date, 
            from_fund=False
        )
        
        # Calculate recurring transactions (especially monthly) from start_date to now
        recurring_income = await calculate_recurring_transactions_amount(
            self.db, project_id, calculation_start_date, current_date, "Income"
        )
        recurring_expense = await calculate_recurring_transactions_amount(
            self.db, project_id, calculation_start_date, current_date, "Expense"
        )
        
        # Calculate income from the monthly budget (treated as expected monthly income)
        # Calculate from project start date (or created_at if start_date not available)
        project_income = 0.0
        monthly_income = float(project.budget_monthly or 0)
        if monthly_income > 0:
            # When using monthly budget as the income source, ignore actual/recurring income transactions
            actual_income = 0.0
            recurring_income = 0.0
            # Use project start_date if available, otherwise use created_at date
            if project.start_date:
                income_calculation_start = project.start_date
            elif project.created_at:
                # Convert datetime to date if needed
                if hasattr(project.created_at, 'date'):
                    income_calculation_start = project.created_at.date()
                elif isinstance(project.created_at, date):
                    income_calculation_start = project.created_at
                else:
                    # Try to parse if it's a string
                    from datetime import datetime
                    if isinstance(project.created_at, str):
                        income_calculation_start = datetime.fromisoformat(project.created_at.replace('Z', '+00:00')).date()
                    else:
                        income_calculation_start = calculation_start_date
            else:
                # Fallback: use calculation_start_date (which is already 1 year ago if no start_date)
                income_calculation_start = calculation_start_date
            project_income = calculate_monthly_income_amount(monthly_income, income_calculation_start, current_date)
        elif monthly_income <= 0:
            project_income = 0.0
        
        # Total income = actual transactions + recurring transactions + project income (from monthly budget)
        # Note: Recurring transactions that were already generated are included in actual_income/actual_expense
        # So we need to avoid double counting. The calculate_recurring_transactions_amount function
        # already handles this by checking if transactions exist.
        # Budget is NOT included in income - only actual transactions and project income count
        total_income = actual_income + recurring_income + project_income
        total_expense = actual_expense + recurring_expense
        
        # Calculate profit and percentage
        profit = total_income - total_expense
        profit_percent = (profit / total_income * 100) if total_income > 0 else 0
        
        # Determine status color
        if profit_percent >= 10:
            status_color = "green"
        elif profit_percent <= -10:
            status_color = "red"
        else:
            status_color = "yellow"
        
        return {
            "total_value": profit,
            "income_month_to_date": total_income,  # From project start to now, only actual transactions
            "expense_month_to_date": total_expense,  # From project start to now
            "profit_percent": round(profit_percent, 1),
            "status_color": status_color
        }

    async def calculation_of_financials(self, project_id):
        monthly_payment_tenants = float(await self.projects.get_payments_of_monthly_tenants(project_id))
        transaction_val = float(await self.transactions.get_transaction_value(project_id))
        return monthly_payment_tenants - transaction_val

    async def create(self, **data) -> Project:
        project = Project(**data)
        return await self.projects.create(project)

    async def update(self, project: Project, **data) -> Project:
        for k, v in data.items():
            if v is not None:
                setattr(project, k, v)
        return await self.projects.update(project)

    async def delete(self, project: Project) -> None:
        await self.projects.delete(project)
