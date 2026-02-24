from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from backend.models.invite import Invite


class MemberInviteRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _base_query(self):
        return select(Invite).where(Invite.invite_type == "member")

    async def create(self, invite: Invite) -> Invite:
        self.db.add(invite)
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def get_by_token(self, token: str) -> Optional[Invite]:
        result = await self.db.execute(
            self._base_query().where(Invite.invite_token == token)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[Invite]:
        result = await self.db.execute(
            self._base_query().where(Invite.email == email)
            .order_by(Invite.created_at.desc())
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, invite_id: int) -> Optional[Invite]:
        result = await self.db.execute(
            self._base_query().where(Invite.id == invite_id)
        )
        return result.scalar_one_or_none()

    async def list_all(self) -> list[Invite]:
        result = await self.db.execute(
            self._base_query().order_by(Invite.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_by_creator(self, creator_id: int) -> list[Invite]:
        result = await self.db.execute(
            self._base_query()
            .where(Invite.created_by == creator_id)
            .order_by(Invite.created_at.desc())
        )
        return list(result.scalars().all())

    async def update(self, invite: Invite) -> Invite:
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def delete(self, invite: Invite) -> None:
        await self.db.delete(invite)
        await self.db.commit()
