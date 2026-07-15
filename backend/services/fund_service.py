from datetime import date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from backend.repositories.fund_repository import FundRepository
from backend.models.fund import Fund
from backend.services.project_service import calculate_monthly_income_amount


class FundService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.funds = FundRepository(db)

    async def create_fund(self, project_id: int, monthly_amount: float = 0, initial_balance: float = 0, last_monthly_addition: date | None = None) -> Fund:
        """Create a new fund for a project"""
        fund = Fund(
            project_id=project_id,
            current_balance=initial_balance,
            monthly_amount=monthly_amount,
            last_monthly_addition=last_monthly_addition
        )
        return await self.funds.create(fund)

    async def get_fund_by_project(self, project_id: int) -> Fund | None:
        """Get fund for a project"""
        return await self.funds.get_by_project_id(project_id)

    async def update_fund(self, fund: Fund, update_scope: str = None, project_start_date: date = None, **data) -> Fund:
        """Update fund with optional scope"""
        old_monthly_amount = float(fund.monthly_amount)
        new_monthly_amount = data.get('monthly_amount')
        if new_monthly_amount is not None:
            new_monthly_amount = float(new_monthly_amount)
        
        today = date.today()

        # Apply manual updates from data first (except monthly_amount if scope is handled separately)
        if 'current_balance' in data and data['current_balance'] is not None:
            fund.current_balance = float(data['current_balance'])
        
        # Handle monthly_amount based on scope
        if update_scope == 'from_start' and new_monthly_amount is not None and project_start_date:
            # Calculate difference from start
            old_total = calculate_monthly_income_amount(old_monthly_amount, project_start_date, today)
            new_total = calculate_monthly_income_amount(new_monthly_amount, project_start_date, today)
            diff = new_total - old_total
            fund.current_balance = float(fund.current_balance) + diff
            fund.monthly_amount = new_monthly_amount
        
        elif update_scope == 'from_this_month' and new_monthly_amount is not None:
            # If this month was already added, adjust it
            if fund.last_monthly_addition and fund.last_monthly_addition.year == today.year and fund.last_monthly_addition.month == today.month:
                diff = new_monthly_amount - old_monthly_amount
                fund.current_balance = float(fund.current_balance) + diff
            fund.monthly_amount = new_monthly_amount
            
        elif update_scope == 'only_this_month' and new_monthly_amount is not None:
            # Only adjust current balance by the difference for this month
            diff = new_monthly_amount - old_monthly_amount
            fund.current_balance = float(fund.current_balance) + diff
            # Do NOT update monthly_amount permanently
            
        else:
            # Default behavior for monthly_amount if no scope or unrecognized scope
            if new_monthly_amount is not None:
                fund.monthly_amount = new_monthly_amount

        return await self.funds.update(fund)

    async def compute_normalized_balance(self, project_id: int, *, persist: bool = False) -> dict | None:
        """Recompute the fund's current_balance from monthly additions + fund transactions.

        This is the single source of truth for the "current balance" shown in the
        fund panel (``get_project_full`` / ``get_project_fund``) and must also be used
        by the report so both display the same number. Historically the report printed
        the raw stored ``current_balance`` while the fund panel recalculated it, which
        made the two diverge whenever the stored balance drifted (e.g. an implied
        negative initial balance that the panel clamps to 0).

        Returns None when the project has no fund, otherwise a dict with the fund and
        the computed components. When ``persist`` is True the synced balance is written
        back to the fund (matching the fund-panel behaviour).
        """
        from sqlalchemy import select, and_, func
        from backend.models.transaction import Transaction
        from backend.repositories.project_repository import ProjectRepository

        fund = await self.funds.get_by_project_id(project_id)
        if not fund:
            return None

        # Sum fund transactions by type
        totals_query = select(Transaction.type, func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.from_fund == True,
            )
        ).group_by(Transaction.type)
        totals_result = await self.db.execute(totals_query)
        totals = {row[0]: float(row[1]) for row in totals_result.all()}
        total_deductions = totals.get('Expense', 0.0)
        total_additions_from_transactions = totals.get('Income', 0.0)

        # Monthly additions accrued from the project start date to today
        total_monthly_additions = 0.0
        monthly_amount = float(fund.monthly_amount)
        if monthly_amount > 0:
            today = date.today()
            project = await ProjectRepository(self.db).get_by_id(project_id)
            if project and project.start_date:
                calculation_start_date = project.start_date
            else:
                calculation_start_date = fund.created_at.date() if hasattr(fund.created_at, 'date') else today
            total_monthly_additions = calculate_monthly_income_amount(
                monthly_amount, calculation_start_date, today
            )

        stored_current_balance = float(fund.current_balance)
        total_additions = total_monthly_additions + total_additions_from_transactions
        # Work backwards to the initial balance; clamp negatives (implied debt) to 0 so a
        # drifted stored balance does not carry a phantom shortfall forward.
        calculated_initial = stored_current_balance + total_deductions - total_additions
        initial_total = max(0.0, calculated_initial)
        recalculated_current_balance = initial_total + total_additions - total_deductions

        if persist and abs(recalculated_current_balance - stored_current_balance) > 0.01:
            await self.update_fund(fund, current_balance=recalculated_current_balance)
            fund = await self.funds.get_by_project_id(project_id)

        return {
            "fund": fund,
            "current_balance": recalculated_current_balance,
            "initial_total": initial_total,
            "total_additions": total_additions,
            "total_deductions": total_deductions,
            "total_monthly_additions": total_monthly_additions,
            "total_additions_from_transactions": total_additions_from_transactions,
        }

    async def add_monthly_amount(self, project_id: int) -> Fund | None:
        """Add monthly amount to fund if not already added this month"""
        fund = await self.funds.get_by_project_id(project_id)
        if not fund or fund.monthly_amount == 0:
            return None
        
        today = date.today()
        
        # Check if already added this month
        if fund.last_monthly_addition:
            if (fund.last_monthly_addition.year == today.year and 
                fund.last_monthly_addition.month == today.month):
                return fund  # Already added this month
        
        # Add monthly amount
        fund.current_balance = float(fund.current_balance) + float(fund.monthly_amount)
        fund.last_monthly_addition = today
        return await self.funds.update(fund)

    async def deduct_from_fund(self, project_id: int, amount: float, commit: bool = True) -> Fund | None:
        """Deduct amount from fund.

        With commit=False the change is only flushed, so it commits (or rolls back)
        together with the rest of the request - e.g. atomically with transaction creation.
        """
        fund = await self.funds.get_by_project_id(project_id, for_update=True)
        if not fund:
            return None

        fund.current_balance = float(fund.current_balance) - float(amount)
        # Allow negative balance (removed the check that prevented it)

        if commit:
            return await self.funds.update(fund)
        await self.db.flush()
        return fund

    async def add_to_fund(self, project_id: int, amount: float, commit: bool = True) -> Fund | None:
        """Add amount to fund. See deduct_from_fund for commit=False semantics."""
        fund = await self.funds.get_by_project_id(project_id, for_update=True)
        if not fund:
            return None

        fund.current_balance = float(fund.current_balance) + float(amount)

        if commit:
            return await self.funds.update(fund)
        await self.db.flush()
        return fund

    async def refund_to_fund(self, project_id: int, amount: float, commit: bool = True) -> Fund | None:
        """Refund amount back to fund (e.g., when deleting a transaction)"""
        return await self.add_to_fund(project_id, amount, commit=commit)

    async def ensure_monthly_addition(self, project_id: int) -> Fund | None:
        """Ensure all monthly amounts are added from project start date to today"""
        fund = await self.funds.get_by_project_id(project_id)
        if not fund or fund.monthly_amount == 0:
            return fund
        
        # Get project to access start_date
        from backend.repositories.project_repository import ProjectRepository
        project_repo = ProjectRepository(self.db)
        project = await project_repo.get_by_id(project_id)
        if not project:
            return fund
        
        today = date.today()
        
        # Determine the calculation start date: prefer project.start_date, fallback to fund.created_at
        if project.start_date:
            calculation_start_date = project.start_date
        else:
            calculation_start_date = fund.created_at.date() if hasattr(fund.created_at, 'date') else today
        
        # Calculate total amount that should have been added from start date to today
        total_expected = calculate_monthly_income_amount(
            float(fund.monthly_amount),
            calculation_start_date,
            today
        )
        
        # Calculate how much has already been added
        # If last_monthly_addition exists, calculate from start_date to last_monthly_addition
        already_added = 0.0
        if fund.last_monthly_addition:
            # Calculate what was added up to last_monthly_addition
            last_addition_date = fund.last_monthly_addition
            if last_addition_date >= calculation_start_date:
                already_added = calculate_monthly_income_amount(
                    float(fund.monthly_amount),
                    calculation_start_date,
                    last_addition_date
                )
        
        # Calculate the difference that needs to be added
        amount_to_add = total_expected - already_added
        
        if amount_to_add > 0:
            # Add the missing amount
            fund.current_balance = float(fund.current_balance) + amount_to_add
            fund.last_monthly_addition = today
            return await self.funds.update(fund)
        
        # If we're up to date, just update last_monthly_addition if needed
        if not fund.last_monthly_addition or (fund.last_monthly_addition.year != today.year or fund.last_monthly_addition.month != today.month):
            fund.last_monthly_addition = today
            return await self.funds.update(fund)
        
        return fund
