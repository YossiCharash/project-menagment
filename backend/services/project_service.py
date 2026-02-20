from sqlalchemy.ext.asyncio import AsyncSession
from backend.repositories.project_repository import ProjectRepository
from backend.models.project import Project
from backend.repositories.transaction_repository import TransactionRepository
from backend.services.financial_utils import (
    calculate_proportional_period_amount,
    determine_profit_status_color,
)
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta


def calculate_start_date(project_start_date: date | None) -> date:
    """Calculate the start date for financial calculations: max(project_start_date, 1 year ago)"""
    current_date = date.today()
    one_year_ago = current_date - relativedelta(years=1)

    if project_start_date:
        return max(project_start_date, one_year_ago)
    else:
        return one_year_ago


def calculate_monthly_income_amount(monthly_income: float, income_start_date: date, current_date: date) -> float:
    """
    Calculate expected income based on a fixed monthly amount that accrues on the same day of month as the start date.
    """
    if monthly_income <= 0:
        return 0.0
    if income_start_date > current_date:
        return 0.0

    first_occurrence = income_start_date

    if first_occurrence > current_date:
        return 0.0

    occurrences = 0
    occurrence_date = first_occurrence
    original_day = first_occurrence.day

    while occurrence_date <= current_date:
        occurrences += 1

        if occurrence_date.month == 12:
            next_year = occurrence_date.year + 1
            next_month = 1
        else:
            next_year = occurrence_date.year
            next_month = occurrence_date.month + 1

        try:
            next_occurrence = date(next_year, next_month, original_day)
        except ValueError:
            if next_month == 12:
                next_month_date = date(next_year + 1, 1, 1)
            else:
                next_month_date = date(next_year, next_month + 1, 1)
            next_occurrence = next_month_date - timedelta(days=1)

        occurrence_date = next_occurrence

    return monthly_income * occurrences


async def calculate_recurring_transactions_amount(
    db: AsyncSession,
    project_id: int,
    start_date: date,
    end_date: date,
    transaction_type: str
) -> float:
    """Calculate the amount of recurring transactions from start_date to end_date"""
    from sqlalchemy import select, and_, func
    from backend.models.recurring_transaction import RecurringTransactionTemplate
    from backend.models.transaction import Transaction

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
        if template.frequency != "Monthly":
            continue

        template_start = max(template.start_date, start_date)

        effective_end = end_date
        if template.end_type == "On Date" and template.end_date:
            effective_end = min(template.end_date, end_date)

        if template_start > effective_end:
            continue

        current_month = date(template_start.year, template_start.month, 1)
        end_month = date(effective_end.year, effective_end.month, 1)

        month_count = 0
        while current_month <= end_month:
            try:
                occurrence_date = date(current_month.year, current_month.month, template.day_of_month)
            except ValueError:
                if current_month.month == 12:
                    next_month = date(current_month.year + 1, 1, 1)
                else:
                    next_month = date(current_month.year, current_month.month + 1, 1)
                occurrence_date = next_month - timedelta(days=1)

            if occurrence_date >= template_start and occurrence_date <= effective_end:
                existing_query = select(func.count(Transaction.id)).where(
                    and_(
                        Transaction.project_id == project_id,
                        Transaction.recurring_template_id == template.id,
                        Transaction.tx_date == occurrence_date
                    )
                )
                existing_count = (await db.execute(existing_query)).scalar_one() or 0

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
                    total_amount += float(template.amount)

            if current_month.month == 12:
                current_month = date(current_month.year + 1, 1, 1)
            else:
                current_month = date(current_month.year, current_month.month + 1, 1)

            month_count += 1
            if month_count > 120:
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

        financial_data = await self.get_project_financial_data(project_id)

        project_data = {
            "id": proj.id,
            "name": proj.name,
            "description": proj.description,
            "start_date": proj.start_date.isoformat() if proj.start_date else None,
            "end_date": proj.end_date.isoformat() if proj.end_date else None,
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
        """Calculate total expenses for a period, handling both regular and period-based transactions."""
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
                Transaction.period_start_date <= end_date,
                Transaction.period_end_date >= start_date
            )
        )
        period_txs = (await self.db.execute(query_period)).scalars().all()

        period_expense = 0.0
        for tx in period_txs:
            period_expense += calculate_proportional_period_amount(
                amount=float(tx.amount),
                period_start=tx.period_start_date,
                period_end=tx.period_end_date,
                range_start=start_date,
                range_end=end_date,
            )

        return regular_expense + period_expense

    async def get_project_financial_data(self, project_id: int) -> dict:
        """Get real-time financial calculations for a project"""
        from sqlalchemy import func, select, and_
        from backend.models.transaction import Transaction
        from dateutil.relativedelta import relativedelta

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

        if project.start_date:
            calculation_start_date = project.start_date
        else:
            calculation_start_date = current_date - relativedelta(years=1)

        actual_income_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Income",
                Transaction.tx_date >= calculation_start_date,
                Transaction.tx_date <= current_date,
                Transaction.from_fund == False
            )
        )

        actual_income = float((await self.db.execute(actual_income_query)).scalar_one())

        actual_expense = await self.calculate_period_expenses(
            project_id,
            calculation_start_date,
            current_date,
            from_fund=False
        )

        recurring_income = await calculate_recurring_transactions_amount(
            self.db, project_id, calculation_start_date, current_date, "Income"
        )
        recurring_expense = await calculate_recurring_transactions_amount(
            self.db, project_id, calculation_start_date, current_date, "Expense"
        )

        project_income = 0.0
        monthly_income = float(project.budget_monthly or 0)
        if monthly_income > 0:
            actual_income = 0.0
            recurring_income = 0.0
            if project.start_date:
                income_calculation_start = project.start_date
            elif project.created_at:
                if hasattr(project.created_at, 'date'):
                    income_calculation_start = project.created_at.date()
                elif isinstance(project.created_at, date):
                    income_calculation_start = project.created_at
                else:
                    from datetime import datetime
                    if isinstance(project.created_at, str):
                        income_calculation_start = datetime.fromisoformat(project.created_at.replace('Z', '+00:00')).date()
                    else:
                        income_calculation_start = calculation_start_date
            else:
                income_calculation_start = calculation_start_date
            project_income = calculate_monthly_income_amount(monthly_income, income_calculation_start, current_date)
        elif monthly_income <= 0:
            project_income = 0.0

        total_income = actual_income + recurring_income + project_income
        total_expense = actual_expense + recurring_expense

        profit = total_income - total_expense
        profit_percent = (profit / total_income * 100) if total_income > 0 else 0

        return {
            "total_value": profit,
            "income_month_to_date": total_income,
            "expense_month_to_date": total_expense,
            "profit_percent": round(profit_percent, 1),
            "status_color": determine_profit_status_color(profit_percent)
        }

    async def calculation_of_financials(self, project_id):
        monthly_payment_tenants = float(await self.projects.get_payments_of_monthly_tenants(project_id))
        transaction_val = float(await self.transactions.get_transaction_value(project_id))
        return monthly_payment_tenants - transaction_val

    async def create(self, user_id: int = 1, **data) -> Project:
        from datetime import date as date_type

        start_date = data.get('start_date')
        if start_date and isinstance(start_date, str):
            start_date = date_type.fromisoformat(start_date)
            data['start_date'] = start_date

        end_date = data.get('end_date')
        if end_date and isinstance(end_date, str):
            end_date = date_type.fromisoformat(end_date)
            data['end_date'] = end_date

        project = Project(**data)
        created_project = await self.projects.create(project)

        start_date = data.get('start_date')
        contract_duration_months = data.get('contract_duration_months')

        if start_date and contract_duration_months:
            from backend.services.contract_period_service import ContractPeriodService
            contract_service = ContractPeriodService(self.db)
            project_id = created_project.id
            await contract_service.generate_initial_periods_by_duration(
                project_id=project_id,
                start_date=start_date,
                duration_months=contract_duration_months,
                user_id=user_id
            )
            self.db.expire(created_project)
            created_project = await self.projects.get_by_id(project_id)
        elif start_date and end_date:
            from backend.services.contract_period_service import ContractPeriodService
            contract_service = ContractPeriodService(self.db)
            project_id = created_project.id
            await contract_service.generate_initial_periods(
                project_id=project_id,
                start_date=start_date,
                end_date=end_date,
                user_id=user_id
            )
            self.db.expire(created_project)
            created_project = await self.projects.get_by_id(project_id)

        return created_project

    async def update(self, project: Project, **data) -> Project:
        for k, v in data.items():
            if v is not None:
                setattr(project, k, v)
        return await self.projects.update(project)

    async def delete(self, project: Project) -> None:
        await self.projects.delete(project)
