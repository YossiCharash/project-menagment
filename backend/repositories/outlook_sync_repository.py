"""Outlook sync repository."""
from datetime import datetime

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

    async def save_tokens(
        self,
        user_id: int,
        access_token: str,
        refresh_token: str,
        token_expires_at: datetime,
    ) -> OutlookSync:
        """Create or update the Outlook connection tokens for a user."""
        row = await self.get_by_user_id(user_id)
        if row is None:
            row = OutlookSync(
                user_id=user_id,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expires_at=token_expires_at,
            )
        else:
            row.access_token = access_token
            row.refresh_token = refresh_token
            row.token_expires_at = token_expires_at
        return await self.upsert(row)

    async def update_access_token(
        self, row: OutlookSync, access_token: str, expires_at: datetime, refresh_token: str | None = None
    ) -> OutlookSync:
        """Persist a refreshed access token on an existing row."""
        row.access_token = access_token
        row.token_expires_at = expires_at
        if refresh_token:
            row.refresh_token = refresh_token
        return await self.upsert(row)

    async def delete_by_user_id(self, user_id: int) -> None:
        row = await self.get_by_user_id(user_id)
        if row:
            await self.db.delete(row)
            await self.db.flush()
