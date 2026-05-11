from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from backend.repositories.admin_invite_repository import AdminInviteRepository
from backend.repositories.user_repository import UserRepository
from backend.models.invite import Invite
from backend.models.user import User, UserRole
from backend.core.security import hash_password
from backend.schemas.admin_invite import (
    AdminInviteCreate,
    AdminInviteUse,
    AdminInviteUseResult,
    AdminInviteList,
    AdminInviteDeleteRequest,
)


# Error messages -- centralized so routes/tests can reference the same constants.
ERR_USER_EMAIL_TAKEN = "User with this email already exists"
ERR_PENDING_INVITE_EXISTS = "Pending invite already exists for this email"
ERR_INVITE_NOT_FOUND = "Invite not found"
ERR_INVITE_CODE_INVALID = "Invalid invite code"
ERR_INVITE_USED = "Invite code has already been used"
ERR_INVITE_EXPIRED = "Invite code has expired"
ERR_INVITE_DELETE_FORBIDDEN = "You can only delete your own invites"


class AdminInviteService:
    """Orchestrates admin-invite use-cases. All DB access is delegated to repositories."""

    def __init__(self, db: AsyncSession):
        self.invite_repo = AdminInviteRepository(db)
        self.user_repo = UserRepository(db)

    # ---------- creation ----------

    async def create_invite(self, invite_data: AdminInviteCreate, creator_id: int) -> Invite:
        """Create a new admin invite after validating no conflicting user or invite exists."""
        await self._assert_email_not_registered(invite_data.email)
        await self._assert_no_pending_invite(invite_data.email)

        invite = Invite.create_admin_invite(
            email=invite_data.email,
            full_name=invite_data.full_name,
            created_by=creator_id,
            expires_days=invite_data.expires_days,
        )
        return await self.invite_repo.create(invite)

    # ---------- consumption ----------

    async def use_invite(self, invite_data: AdminInviteUse) -> AdminInviteUseResult:
        """Consume an admin-invite code and provision a new admin user."""
        invite = await self._load_valid_invite(invite_data.invite_code)
        await self._assert_email_not_registered(invite.email)

        created_user = await self._create_admin_user(invite, invite_data.password)
        await self._mark_invite_consumed(invite)

        return AdminInviteUseResult(user_id=created_user.id, email=created_user.email)

    # ---------- listing / lookup ----------

    async def list_invites(self, creator_id: int | None = None) -> list[Invite]:
        if creator_id:
            return await self.invite_repo.list_by_creator(creator_id)
        return await self.invite_repo.list_all()

    async def list_invites_with_status(self, creator_id: int | None = None) -> list[AdminInviteList]:
        """List invites mapped to AdminInviteList DTOs with is_expired computed."""
        invites = await self.list_invites(creator_id)
        return [self._to_list_dto(invite) for invite in invites]

    async def get_invite_by_code(self, invite_code: str) -> Invite:
        invite = await self.invite_repo.get_by_code(invite_code)
        if not invite:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ERR_INVITE_NOT_FOUND)
        return invite

    # ---------- deletion ----------

    async def delete_invite(self, request: AdminInviteDeleteRequest) -> None:
        """Delete an invite owned by the given creator."""
        invite = await self._load_invite_by_id(request.invite_id)
        self._assert_invite_owned_by(invite, request.creator_id)
        await self.invite_repo.delete(invite)

    # ---------- private helpers (each does ONE thing) ----------

    async def _assert_email_not_registered(self, email: str) -> None:
        if await self.user_repo.get_by_email(email):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ERR_USER_EMAIL_TAKEN)

    async def _assert_no_pending_invite(self, email: str) -> None:
        existing = await self.invite_repo.get_by_email(email)
        if existing and not existing.is_used and not existing.is_expired():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ERR_PENDING_INVITE_EXISTS)

    async def _load_valid_invite(self, invite_code: str) -> Invite:
        invite = await self.invite_repo.get_by_code(invite_code)
        if not invite:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ERR_INVITE_CODE_INVALID)
        if not invite.is_valid():
            detail = ERR_INVITE_USED if invite.is_used else ERR_INVITE_EXPIRED
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
        return invite

    async def _load_invite_by_id(self, invite_id: int) -> Invite:
        invite = await self.invite_repo.get_by_id(invite_id)
        if not invite:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ERR_INVITE_NOT_FOUND)
        return invite

    @staticmethod
    def _assert_invite_owned_by(invite: Invite, creator_id: int) -> None:
        if invite.created_by != creator_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ERR_INVITE_DELETE_FORBIDDEN)

    async def _create_admin_user(self, invite: Invite, plaintext_password: str) -> User:
        admin_user = User(
            email=invite.email,
            full_name=invite.full_name,
            password_hash=hash_password(plaintext_password),
            role=UserRole.ADMIN.value,
            is_active=True,
            group_id=None,
        )
        return await self.user_repo.create(admin_user)

    async def _mark_invite_consumed(self, invite: Invite) -> Invite:
        invite.is_used = True
        invite.used_at = datetime.now(timezone.utc)
        return await self.invite_repo.update(invite)

    @staticmethod
    def _to_list_dto(invite: Invite) -> AdminInviteList:
        return AdminInviteList(
            id=invite.id,
            invite_code=invite.invite_token,
            email=invite.email,
            full_name=invite.full_name,
            is_used=invite.is_used,
            used_at=invite.used_at,
            expires_at=invite.expires_at,
            created_at=invite.created_at,
            is_expired=invite.is_expired(),
        )
