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

    async def update_fund(self, fund: Fund, **data) -> Fund:
        """Update fund"""
        for k, v in data.items():
            if v is not None:
                setattr(fund, k, v)
        return await self.funds.update(fund)

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

    async def deduct_from_fund(self, project_id: int, amount: float) -> Fund | None:
        """Deduct amount from fund"""
        fund = await self.funds.get_by_project_id(project_id)
        if not fund:
            return None
        
        fund.current_balance = float(fund.current_balance) - float(amount)
        # Allow negative balance (removed the check that prevented it)
        
        return await self.funds.update(fund)

    async def add_to_fund(self, project_id: int, amount: float) -> Fund | None:
        """Add amount to fund"""
        fund = await self.funds.get_by_project_id(project_id)
        if not fund:
            return None
        
        fund.current_balance = float(fund.current_balance) + float(amount)
        
        return await self.funds.update(fund)

    async def refund_to_fund(self, project_id: int, amount: float) -> Fund | None:
        """Refund amount back to fund (e.g., when deleting a transaction)"""
        return await self.add_to_fund(project_id, amount)

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
