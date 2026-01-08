from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from backend.models.member_invite import MemberInvite


class MemberInviteRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, invite: MemberInvite) -> MemberInvite:
        self.db.add(invite)
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def get_by_token(self, token: str) -> Optional[MemberInvite]:
        result = await self.db.execute(
            select(MemberInvite).where(MemberInvite.invite_token == token)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[MemberInvite]:
        result = await self.db.execute(
            select(MemberInvite).where(MemberInvite.email == email).order_by(MemberInvite.created_at.desc())
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, invite_id: int) -> Optional[MemberInvite]:
        result = await self.db.execute(
            select(MemberInvite).where(MemberInvite.id == invite_id)
        )
        return result.scalar_one_or_none()

    async def list_all(self) -> list[MemberInvite]:
        result = await self.db.execute(
            select(MemberInvite).order_by(MemberInvite.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_by_creator(self, creator_id: int) -> list[MemberInvite]:
        result = await self.db.execute(
            select(MemberInvite)
            .where(MemberInvite.created_by == creator_id)
            .order_by(MemberInvite.created_at.desc())
        )
        return list(result.scalars().all())

    async def update(self, invite: MemberInvite) -> MemberInvite:
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def delete(self, invite: MemberInvite) -> None:
        await self.db.delete(invite)
        await self.db.commit()
