"""
Database seeding utilities for initial admin user creation.
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from backend.db.session import get_master_db
from backend.models.user import User, UserRole
from backend.core.security import hash_password
from backend.core.config import settings

# Import all models to ensure SQLAlchemy relationships are properly configured
from backend.models import (  # noqa: F401
    Project, Subproject, Transaction, AuditLog,
    Supplier, Document, Invite, EmailVerification,
    RecurringTransactionTemplate,
)


async def seed_tenant_database(
    session: AsyncSession,
    admin_email: str,
    admin_password: str,
    admin_name: str,
) -> User:
    """
    Seed a tenant database with its first Admin user.

    Accepts an external session so the caller controls the transaction.
    Returns the existing admin if one already exists.
    """
    from backend.repositories.user_repository import UserRepository

    user_repo = UserRepository(session)
    existing = await user_repo.get_by_email(admin_email)
    if existing:
        return existing

    admin = User(
        email=admin_email,
        full_name=admin_name,
        password_hash=hash_password(admin_password),
        role=UserRole.ADMIN.value,
        is_active=True,
        group_id=None,
        email_verified=True,
    )
    return await user_repo.create(admin)


async def create_super_admin() -> User | None:
    """Create super admin user from environment variables in the master DB."""
    async for db in get_master_db():
        try:
            from backend.repositories.user_repository import UserRepository

            user_repo = UserRepository(db)

            existing_admin = await user_repo.get_by_email(settings.SUPER_ADMIN_EMAIL)
            if existing_admin:
                return existing_admin

            super_admin = User(
                email=settings.SUPER_ADMIN_EMAIL,
                full_name=settings.SUPER_ADMIN_NAME,
                password_hash=hash_password(settings.SUPER_ADMIN_PASSWORD),
                role=UserRole.ADMIN.value,
                is_active=True,
                group_id=None,
                email_verified=True,
            )

            created_admin = await user_repo.create(super_admin)
            return created_admin

        except Exception:
            return None
        finally:
            await db.close()


async def seed_database():
    """Seed the master database with initial data."""
    await create_super_admin()


if __name__ == "__main__":
    asyncio.run(seed_database())
