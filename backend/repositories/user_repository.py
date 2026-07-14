from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.user import User
from backend.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        res = await self.db.execute(select(User).where(User.email == email))
        return res.scalar_one_or_none()

    async def list(self) -> list[User]:
        res = await self.db.execute(select(User))
        return list(res.scalars().all())

    async def has_admin_user(self) -> bool:
        """Check if any admin user exists in the system"""
        from backend.models.user import UserRole
        res = await self.db.execute(select(User).where(User.role == UserRole.ADMIN.value))
        return res.scalar_one_or_none() is not None

    async def list_admins(self) -> list[User]:
        """Return every active admin user that can authenticate with a password."""
        from backend.models.user import UserRole
        res = await self.db.execute(
            select(User).where(
                User.role == UserRole.ADMIN.value,
                User.is_active.is_(True),
                User.password_hash.is_not(None),
            )
        )
        return list(res.scalars().all())

    async def delete(self, entity: User) -> None:
        """Delete a user with rollback on failure"""
        try:
            await self.db.delete(entity)
            await self.db.commit()
        except Exception as e:
            await self.db.rollback()
            raise e
