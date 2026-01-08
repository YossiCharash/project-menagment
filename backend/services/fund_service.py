from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from backend.repositories.fund_repository import FundRepository
from backend.models.fund import Fund


class FundService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.funds = FundRepository(db)

    async def create_fund(self, project_id: int, monthly_amount: float = 0, initial_balance: float = 0) -> Fund:
        """Create a new fund for a project"""
        fund = Fund(
            project_id=project_id,
            current_balance=initial_balance,
            monthly_amount=monthly_amount,
            last_monthly_addition=None
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
        """Ensure monthly amount is added (called when needed)"""
        return await self.add_monthly_amount(project_id)
