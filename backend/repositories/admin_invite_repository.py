from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.invite import Invite


class AdminInviteRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _base_query(self):
        return select(Invite).where(Invite.invite_type == "admin")

    async def get_by_code(self, invite_token: str) -> Invite | None:
        """Get admin invite by token (stored in invite_token column)."""
        res = await self.db.execute(
            self._base_query().where(Invite.invite_token == invite_token)
        )
        return res.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Invite | None:
        """Get admin invite by email."""
        res = await self.db.execute(
            self._base_query().where(Invite.email == email)
        )
        return res.scalar_one_or_none()

    async def create(self, invite: Invite) -> Invite:
        self.db.add(invite)
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def update(self, invite: Invite) -> Invite:
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def list_by_creator(self, creator_id: int) -> list[Invite]:
        res = await self.db.execute(
            self._base_query().where(Invite.created_by == creator_id)
        )
        return list(res.scalars().all())

    async def list_all(self) -> list[Invite]:
        res = await self.db.execute(self._base_query())
        return list(res.scalars().all())

    async def delete(self, invite: Invite) -> None:
        await self.db.delete(invite)
        await self.db.commit()
