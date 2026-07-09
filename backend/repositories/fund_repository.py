from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.fund import Fund


class FundRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_project_id(self, project_id: int, for_update: bool = False) -> Fund | None:
        stmt = select(Fund).where(Fund.project_id == project_id)
        if for_update:
            # Row lock so concurrent balance updates serialize instead of losing writes
            stmt = stmt.with_for_update()
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def create(self, fund: Fund) -> Fund:
        self.db.add(fund)
        await self.db.commit()
        await self.db.refresh(fund)
        return fund

    async def update(self, fund: Fund) -> Fund:
        await self.db.commit()
        await self.db.refresh(fund)
        return fund

    async def delete(self, fund: Fund) -> None:
        await self.db.delete(fund)
        await self.db.commit()
