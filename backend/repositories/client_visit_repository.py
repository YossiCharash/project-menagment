from __future__ import annotations
from datetime import datetime, timezone
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models.client_visit import ClientVisit, ClientVisitStatus


class ClientVisitRepository:
    """Data access for client arrivals (הגעות לקוחות)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, visit_id: int) -> ClientVisit | None:
        result = await self.db.execute(
            select(ClientVisit).where(ClientVisit.id == visit_id)
        )
        return result.scalar_one_or_none()

    async def list_by_apartment(self, apartment_id: int) -> List[ClientVisit]:
        result = await self.db.execute(
            select(ClientVisit)
            .where(ClientVisit.apartment_id == apartment_id)
            .order_by(ClientVisit.arrived_at.desc())
        )
        return list(result.scalars().all())

    async def list_due(self, apartment_ids: List[int] | None = None) -> List[ClientVisit]:
        """Active visits whose ``expected_until`` has already passed.

        When ``apartment_ids`` is given the scan is scoped to those apartments
        (used by the on-read reconcile); otherwise every apartment is checked
        (used by the background scheduler).
        """
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        query = (
            select(ClientVisit)
            .where(ClientVisit.status == ClientVisitStatus.PRESENT)
            .where(ClientVisit.expected_until.isnot(None))
            .where(ClientVisit.expected_until <= now)
        )
        if apartment_ids is not None:
            if not apartment_ids:
                return []
            query = query.where(ClientVisit.apartment_id.in_(apartment_ids))
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, visit: ClientVisit) -> ClientVisit:
        self.db.add(visit)
        await self.db.commit()
        await self.db.refresh(visit)
        return visit

    async def update(self, visit: ClientVisit) -> ClientVisit:
        await self.db.commit()
        await self.db.refresh(visit)
        return visit

    async def delete(self, visit: ClientVisit) -> None:
        await self.db.delete(visit)
        await self.db.commit()
