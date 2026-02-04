"""Outlook sync repository."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.outlook_sync import OutlookSync


class OutlookSyncRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_user_id(self, user_id: int) -> OutlookSync | None:
        res = await self.db.execute(select(OutlookSync).where(OutlookSync.user_id == user_id))
        return res.scalar_one_or_none()

    async def upsert(self, row: OutlookSync) -> OutlookSync:
        self.db.add(row)
        await self.db.flush()
        await self.db.refresh(row)
        return row

    async def delete_by_user_id(self, user_id: int) -> None:
        res = await self.db.execute(select(OutlookSync).where(OutlookSync.user_id == user_id))
        row = res.scalar_one_or_none()
        if row:
            await self.db.delete(row)
            await self.db.flush()
