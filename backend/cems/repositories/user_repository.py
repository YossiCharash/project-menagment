"""CEMS user repository.

Queries the shared ``users`` table using the project-wide User model.
CEMS-specific filtering uses the ``cems_role`` column added to that model.
"""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.repositories.base_repository import BaseRepository
from backend.models.user import User


class UserRepository(BaseRepository[User]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(User, session)

    async def get_by_email(self, email: str) -> Optional[User]:
        stmt = select(User).where(User.email == email)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_cems_role(self, cems_role: str, skip: int = 0, limit: int = 100) -> list[User]:
        stmt = (
            select(User)
            .where(User.cems_role == cems_role, User.is_active.is_(True))
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_active_users(self, skip: int = 0, limit: int = 100) -> list[User]:
        stmt = select(User).where(User.is_active.is_(True)).offset(skip).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_cems_users(self, skip: int = 0, limit: int = 100) -> list[User]:
        """Return all users that have any CEMS role assigned."""
        stmt = (
            select(User)
            .where(User.cems_role.isnot(None), User.is_active.is_(True))
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
