from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.admin_invite import AdminInvite


class AdminInviteRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_code(self, invite_code: str) -> AdminInvite | None:
        """Get invite by code"""
        res = await self.db.execute(select(AdminInvite).where(AdminInvite.invite_code == invite_code))
        return res.scalar_one_or_none()

    async def get_by_email(self, email: str) -> AdminInvite | None:
        """Get invite by email"""
        res = await self.db.execute(select(AdminInvite).where(AdminInvite.email == email))
        return res.scalar_one_or_none()

    async def create(self, invite: AdminInvite) -> AdminInvite:
        """Create new invite"""
        self.db.add(invite)
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def update(self, invite: AdminInvite) -> AdminInvite:
        """Update invite"""
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def list_by_creator(self, creator_id: int) -> list[AdminInvite]:
        """List invites created by specific user"""
        res = await self.db.execute(select(AdminInvite).where(AdminInvite.created_by == creator_id))
        return list(res.scalars().all())

    async def list_all(self) -> list[AdminInvite]:
        """List all invites"""
        res = await self.db.execute(select(AdminInvite))
        return list(res.scalars().all())

    async def delete(self, invite: AdminInvite) -> None:
        """Delete invite"""
        await self.db.delete(invite)
        await self.db.commit()
