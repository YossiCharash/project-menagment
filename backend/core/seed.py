"""
Database seeding utilities for initial admin user creation
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from backend.db.session import get_db
from backend.models.user import User, UserRole
from backend.core.security import hash_password
from backend.core.config import settings

# Import all models to ensure SQLAlchemy relationships are properly configured
from backend.models import (  # noqa: F401
    Project, Subproject, Transaction, AuditLog, 
    Supplier, SupplierDocument, AdminInvite, EmailVerification, 
    RecurringTransactionTemplate
)


async def create_super_admin() -> User:
    """Create super admin user from environment variables"""
    async for db in get_db():
        try:
            from backend.repositories.user_repository import UserRepository
            user_repo = UserRepository(db)
            
            # Check if super admin already exists
            existing_admin = await user_repo.get_by_email(settings.SUPER_ADMIN_EMAIL)
            if existing_admin:
                return existing_admin
            
            # Create super admin
            super_admin = User(
                email=settings.SUPER_ADMIN_EMAIL,
                full_name=settings.SUPER_ADMIN_NAME,
                password_hash=hash_password(settings.SUPER_ADMIN_PASSWORD),
                role=UserRole.ADMIN.value,
                is_active=True,
                group_id=None,  # Super admin doesn't need group_id
                email_verified=True  # Super admin email is considered verified
            )
            
            created_admin = await user_repo.create(super_admin)
            return created_admin
            
        except Exception:
            return None
        finally:
            await db.close()


async def seed_database():
    """Seed the database with initial data"""
    # Create super admin
    await create_super_admin()


if __name__ == "__main__":
    asyncio.run(seed_database())
