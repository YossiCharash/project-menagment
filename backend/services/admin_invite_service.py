from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from backend.repositories.admin_invite_repository import AdminInviteRepository
from backend.repositories.user_repository import UserRepository
from backend.models.invite import Invite
from backend.models.user import User, UserRole
from backend.core.security import hash_password
from backend.schemas.admin_invite import AdminInviteCreate, AdminInviteUse


class AdminInviteService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.invite_repo = AdminInviteRepository(db)
        self.user_repo = UserRepository(db)

    async def create_invite(self, invite_data: AdminInviteCreate, creator_id: int) -> Invite:
        """Create a new admin invite"""
        existing_user = await self.user_repo.get_by_email(invite_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )

        existing_invite = await self.invite_repo.get_by_email(invite_data.email)
        if existing_invite and not existing_invite.is_used and not existing_invite.is_expired():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pending invite already exists for this email"
            )

        invite = Invite.create_admin_invite(
            email=invite_data.email,
            full_name=invite_data.full_name,
            created_by=creator_id,
            expires_days=invite_data.expires_days
        )
        return await self.invite_repo.create(invite)

    async def use_invite(self, invite_data: AdminInviteUse) -> User:
        """Use an invite code to create admin user"""
        invite = await self.invite_repo.get_by_code(invite_data.invite_code)
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invalid invite code"
            )

        if not invite.is_valid():
            if invite.is_used:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invite code has already been used"
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invite code has expired"
                )

        existing_user = await self.user_repo.get_by_email(invite.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )

        admin_user = User(
            email=invite.email,
            full_name=invite.full_name,
            password_hash=hash_password(invite_data.password),
            role=UserRole.ADMIN.value,
            is_active=True,
            group_id=None
        )
        created_user = await self.user_repo.create(admin_user)

        invite.is_used = True
        invite.used_at = datetime.now(timezone.utc)
        await self.invite_repo.update(invite)

        return created_user

    async def list_invites(self, creator_id: int | None = None) -> list[Invite]:
        if creator_id:
            return await self.invite_repo.list_by_creator(creator_id)
        return await self.invite_repo.list_all()

    async def get_invite_by_code(self, invite_code: str) -> Invite:
        invite = await self.invite_repo.get_by_code(invite_code)
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invite not found"
            )
        return invite

    async def delete_invite(self, invite_id: int, creator_id: int) -> None:
        from sqlalchemy import select
        from backend.models.invite import Invite as InviteModel
        result = await self.db.execute(
            select(InviteModel).where(InviteModel.id == invite_id, InviteModel.invite_type == "admin")
        )
        invite = result.scalar_one_or_none()
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invite not found"
            )
        if invite.created_by != creator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete your own invites"
            )
        await self.invite_repo.delete(invite)
