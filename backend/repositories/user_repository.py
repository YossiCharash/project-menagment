from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.user import User


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: int) -> User | None:
        res = await self.db.execute(select(User).where(User.id == user_id))
        return res.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        res = await self.db.execute(select(User).where(User.email == email))
        return res.scalar_one_or_none()

    async def create(self, user: User) -> User:
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def update(self, user: User) -> User:
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def list(self) -> list[User]:
        res = await self.db.execute(select(User))
        return list(res.scalars().all())

    async def has_admin_user(self) -> bool:
        """Check if any admin user exists in the system"""
        from backend.models.user import UserRole
        res = await self.db.execute(select(User).where(User.role == UserRole.ADMIN.value))
        return res.scalar_one_or_none() is not None

    async def delete(self, user: User) -> None:
        """Delete a user"""
        try:
            await self.db.delete(user)
            await self.db.commit()
        except Exception as e:
            await self.db.rollback()
            raise e