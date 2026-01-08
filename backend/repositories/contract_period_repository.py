from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from typing import List, Optional
from datetime import date

from backend.models.contract_period import ContractPeriod
from backend.db.base import Base


class ContractPeriodRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, contract_period: ContractPeriod) -> ContractPeriod:
        """Create a new contract period"""
        self.db.add(contract_period)
        await self.db.commit()
        await self.db.refresh(contract_period)
        return contract_period

    async def get_by_id(self, period_id: int) -> Optional[ContractPeriod]:
        """Get contract period by ID"""
        result = await self.db.execute(
            select(ContractPeriod).where(ContractPeriod.id == period_id)
        )
        return result.scalar_one_or_none()

    async def get_by_project(self, project_id: int) -> List[ContractPeriod]:
        """Get all contract periods for a project, ordered by year and index"""
        result = await self.db.execute(
            select(ContractPeriod)
            .where(ContractPeriod.project_id == project_id)
            .order_by(ContractPeriod.contract_year.desc(), ContractPeriod.year_index.desc())
        )
        return list(result.scalars().all())

    async def get_by_project_and_year(self, project_id: int, year: int) -> List[ContractPeriod]:
        """Get all contract periods for a project in a specific year"""
        result = await self.db.execute(
            select(ContractPeriod)
            .where(
                and_(
                    ContractPeriod.project_id == project_id,
                    ContractPeriod.contract_year == year
                )
            )
            .order_by(ContractPeriod.year_index.asc())
        )
        return list(result.scalars().all())

    async def get_by_project_and_date_range(
        self, 
        project_id: int, 
        start_date: date, 
        end_date: date
    ) -> Optional[ContractPeriod]:
        """Get contract period that contains the given date range"""
        result = await self.db.execute(
            select(ContractPeriod)
            .where(
                and_(
                    ContractPeriod.project_id == project_id,
                    ContractPeriod.start_date <= end_date,
                    ContractPeriod.end_date >= start_date
                )
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_by_exact_dates(
        self,
        project_id: int,
        start_date: date,
        end_date: date
    ) -> Optional[ContractPeriod]:
        """Get contract period with exact same start and end dates"""
        result = await self.db.execute(
            select(ContractPeriod)
            .where(
                and_(
                    ContractPeriod.project_id == project_id,
                    ContractPeriod.start_date == start_date,
                    ContractPeriod.end_date == end_date
                )
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def count_by_year(self, project_id: int, year: int) -> int:
        """Count how many contract periods exist for a project in a given year"""
        result = await self.db.execute(
            select(func.count(ContractPeriod.id))
            .where(
                and_(
                    ContractPeriod.project_id == project_id,
                    ContractPeriod.contract_year == year
                )
            )
        )
        return result.scalar_one() or 0

    async def get_years_for_project(self, project_id: int) -> List[int]:
        """Get all years that have contract periods for a project"""
        result = await self.db.execute(
            select(ContractPeriod.contract_year)
            .where(ContractPeriod.project_id == project_id)
            .distinct()
            .order_by(ContractPeriod.contract_year.desc())
        )
        return [row[0] for row in result.all()]

    async def update(self, contract_period: ContractPeriod) -> ContractPeriod:
        """Update a contract period"""
        await self.db.commit()
        await self.db.refresh(contract_period)
        return contract_period

    async def delete(self, contract_period: ContractPeriod) -> None:
        """Delete a contract period"""
        await self.db.delete(contract_period)
        await self.db.commit()

