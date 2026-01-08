from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from backend.repositories.member_invite_repository import MemberInviteRepository
from backend.repositories.user_repository import UserRepository
from backend.models.member_invite import MemberInvite
from backend.models.user import User, UserRole
from backend.core.security import hash_password
from backend.schemas.member_invite import MemberInviteCreate, MemberInviteUse
from backend.services.email_service import EmailService
from backend.core.config import settings


class MemberInviteService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.invite_repo = MemberInviteRepository(db)
        self.user_repo = UserRepository(db)
        self.email_service = EmailService()

    async def create_invite(self, invite_data: MemberInviteCreate, creator_id: int) -> MemberInvite:
        """Create a new member invite and send email"""
        # Check if user already exists
        existing_user = await self.user_repo.get_by_email(invite_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )

        # Check if there's already a pending invite for this email
        existing_invite = await self.invite_repo.get_by_email(invite_data.email)
        if existing_invite and not existing_invite.is_used and not existing_invite.is_expired():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pending invite already exists for this email"
            )

        # Create new invite
        invite = MemberInvite.create_invite(
            email=invite_data.email,
            full_name=invite_data.full_name,
            created_by=creator_id,
            group_id=invite_data.group_id,
            expires_days=invite_data.expires_days
        )

        created_invite = await self.invite_repo.create(invite)
        
        # Send invite email with registration link
        registration_link = f"{settings.FRONTEND_URL}/register?token={created_invite.invite_token}"
        await self.email_service.send_member_invite_email(
            email=invite_data.email,
            full_name=invite_data.full_name,
            registration_link=registration_link,
            expires_days=invite_data.expires_days
        )

        return created_invite

    async def use_invite(self, invite_data: MemberInviteUse) -> User:
        """Use an invite token to create member user"""
        # Get invite by token
        invite = await self.invite_repo.get_by_token(invite_data.invite_token)
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invalid invite token"
            )

        # Check if invite is valid
        if not invite.is_valid():
            if invite.is_used:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invite token has already been used"
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invite token has expired"
                )

        # Check if user already exists
        existing_user = await self.user_repo.get_by_email(invite.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )

        # Create member user
        member_user = User(
            email=invite.email,
            full_name=invite.full_name,
            password_hash=hash_password(invite_data.password),
            role=UserRole.MEMBER.value,
            is_active=True,
            group_id=invite.group_id,
            email_verified=True  # Invite is already email verification
        )

        created_user = await self.user_repo.create(member_user)

        # Mark invite as used
        invite.is_used = True
        invite.used_at = datetime.utcnow()
        await self.invite_repo.update(invite)

        return created_user

    async def list_invites(self, creator_id: int | None = None) -> list[MemberInvite]:
        """List all member invites, optionally filtered by creator"""
        if creator_id:
            return await self.invite_repo.list_by_creator(creator_id)
        return await self.invite_repo.list_all()

    async def get_invite_by_token(self, token: str) -> MemberInvite:
        """Get invite by token"""
        invite = await self.invite_repo.get_by_token(token)
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invite not found"
            )
        return invite

    async def delete_invite(self, invite_id: int) -> None:
        """Delete an invite"""
        invite = await self.invite_repo.get_by_id(invite_id)
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invite not found"
            )
        await self.invite_repo.delete(invite)
