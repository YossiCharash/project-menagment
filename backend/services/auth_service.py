from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from backend.core.security import verify_password, hash_password, create_access_token, create_password_reset_token
from backend.repositories.user_repository import UserRepository
from backend.models.user import User, UserRole


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository(db)

    async def authenticate(self, email: str, password: str) -> str:
        user = await self.users.get_by_email(email)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if not user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="This account uses OAuth login. Please use Google to sign in."
            )
        if not verify_password(password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive")
        
        await self.update_last_login(user.id)
        return create_access_token(user.id)

    async def authenticate_user(self, email: str, password: str) -> User | None:
        """Authenticate user and return user object if valid"""
        user = await self.users.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):       
            return None
        if not user.is_active:
            return None
        
        await self.update_last_login(user.id)
        return user

    async def register(self, email: str, full_name: str, password: str, role: str = UserRole.MEMBER.value, group_id: int | None = None, email_verified: bool = False) -> User:                                                                  
        existing = await self.users.get_by_email(email)
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")                                                     
        user = User(
            email=email,
            full_name=full_name, 
            password_hash=hash_password(password),
            role=role,
            group_id=group_id,
            email_verified=email_verified
        )
        return await self.users.create(user)

    async def register_admin(self, email: str, full_name: str, password: str, email_verified: bool = False) -> User:
        """Register a new admin user - only accessible by existing admin or secret key"""                                                                       
        return await self.register(email, full_name, password, UserRole.ADMIN.value, email_verified=email_verified)

    async def register_member(self, email: str, full_name: str, password: str, group_id: int, email_verified: bool = False) -> User:                            
        """Register a new member user - only accessible by admin"""
        return await self.register(email, full_name, password, UserRole.MEMBER.value, group_id, email_verified=email_verified)

    async def get_user_profile(self, user_id: int) -> User:
        """Get user profile by ID"""
        user = await self.users.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user

    async def check_admin_exists(self) -> bool:
        """Check if any admin user exists in the system"""
        return await self.users.has_admin_user()

    async def get_user_by_email(self, email: str) -> User | None:
        """Get user by email"""
        return await self.users.get_by_email(email)

    async def get_user_by_id(self, user_id: int) -> User | None:
        """Get user by ID"""
        return await self.users.get_by_id(user_id)

    async def update_last_login(self, user_id: int) -> None:
        """Update user's last login timestamp"""
        user = await self.users.get_by_id(user_id)
        if user:
            user.last_login = datetime.now(timezone.utc).replace(tzinfo=None)  # Use naive UTC for DB
            await self.users.update(user)

    async def update_password(self, user_id: int, new_password: str) -> None:
        """Update user's password"""
        user = await self.users.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
        user.password_hash = hash_password(new_password)
        await self.users.update(user)

    async def create_password_reset_token(self, email: str) -> str:
        """Create password reset token for user"""
        return create_password_reset_token(email)

    def verify_password(self, password: str, hashed: str) -> bool:
        """Verify password against hash"""
        return verify_password(password, hashed)
