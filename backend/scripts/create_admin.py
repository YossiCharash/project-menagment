"""
Script to create or verify the super admin user
Run this script if you're having trouble logging in with the admin account
"""
import asyncio
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.db.session import get_db
from backend.repositories.user_repository import UserRepository
from backend.models.user import User, UserRole
from backend.core.security import hash_password, verify_password
from backend.core.config import settings


async def create_or_verify_admin():
    """Create or verify the super admin user"""
    print("🔍 Checking for super admin user...")
    print(f"   Email: {settings.SUPER_ADMIN_EMAIL}")
    print(f"   Name: {settings.SUPER_ADMIN_NAME}")
    
    async for db in get_db():
        try:
            user_repo = UserRepository(db)
            
            # Check if super admin exists
            existing_admin = await user_repo.get_by_email(settings.SUPER_ADMIN_EMAIL)
            
            if existing_admin:
                print(f"✅ Super admin user already exists!")
                print(f"   ID: {existing_admin.id}")
                print(f"   Email: {existing_admin.email}")
                print(f"   Name: {existing_admin.full_name}")
                print(f"   Role: {existing_admin.role}")
                print(f"   Active: {existing_admin.is_active}")
                print(f"   Email Verified: {existing_admin.email_verified}")
                
                # Verify password
                if existing_admin.password_hash:
                    password_correct = verify_password(settings.SUPER_ADMIN_PASSWORD, existing_admin.password_hash)
                    if password_correct:
                        print(f"✅ Password is correct!")
                        print(f"\n📝 Login credentials:")
                        print(f"   Email: {settings.SUPER_ADMIN_EMAIL}")
                        print(f"   Password: {settings.SUPER_ADMIN_PASSWORD}")
                    else:
                        print(f"⚠️  Password hash exists but doesn't match current settings!")
                        print(f"   You may need to reset the password.")
                else:
                    print(f"⚠️  No password hash found! This user might be OAuth-only.")
                
                return existing_admin
            else:
                print(f"❌ Super admin user does not exist. Creating...")
                
                # Create super admin
                super_admin = User(
                    email=settings.SUPER_ADMIN_EMAIL,
                    full_name=settings.SUPER_ADMIN_NAME,
                    password_hash=hash_password(settings.SUPER_ADMIN_PASSWORD),
                    role=UserRole.ADMIN.value,
                    is_active=True,
                    group_id=None,
                    email_verified=True
                )
                
                created_admin = await user_repo.create(super_admin)
                print(f"✅ Super admin user created successfully!")
                print(f"   ID: {created_admin.id}")
                print(f"   Email: {created_admin.email}")
                print(f"   Name: {created_admin.full_name}")
                print(f"\n📝 Login credentials:")
                print(f"   Email: {settings.SUPER_ADMIN_EMAIL}")
                print(f"   Password: {settings.SUPER_ADMIN_PASSWORD}")
                
                return created_admin
                
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
            return None
        finally:
            await db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("Super Admin User Creation/Verification Script")
    print("=" * 60)
    print()
    
    result = asyncio.run(create_or_verify_admin())
    
    if result:
        print()
        print("=" * 60)
        print("✅ Script completed successfully!")
        print("=" * 60)
    else:
        print()
        print("=" * 60)
        print("❌ Script failed. Please check the error messages above.")
        print("=" * 60)
        sys.exit(1)

