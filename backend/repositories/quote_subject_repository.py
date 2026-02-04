from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models import QuoteSubject


class QuoteSubjectRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(self) -> List[QuoteSubject]:
        result = await self.db.execute(select(QuoteSubject).order_by(QuoteSubject.id.desc()))
        return list(result.scalars().all())

    async def get(self, quote_subject_id: int) -> QuoteSubject | None:
        result = await self.db.execute(
            select(QuoteSubject).where(QuoteSubject.id == quote_subject_id)
        )
        return result.scalar_one_or_none()

    async def create(self, qs: QuoteSubject) -> QuoteSubject:
        self.db.add(qs)
        await self.db.commit()
        await self.db.refresh(qs)
        return qs

    async def update(self, qs: QuoteSubject) -> QuoteSubject:
        await self.db.flush()
        await self.db.refresh(qs)
        return qs

    async def delete(self, qs: QuoteSubject) -> None:
        await self.db.delete(qs)
        await self.db.commit()
