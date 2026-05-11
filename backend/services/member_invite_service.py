from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from backend.repositories.member_invite_repository import MemberInviteRepository
from backend.repositories.user_repository import UserRepository
from backend.models.invite import Invite
from backend.models.user import User, UserRole
from backend.core.security import hash_password
from backend.schemas.member_invite import (
    MemberInviteCreate,
    MemberInviteUse,
    MemberInviteUseResult,
    MemberInviteList,
)
from backend.services.email_service import EmailService
from backend.core.config import settings


# Centralized error messages.
ERR_USER_EMAIL_TAKEN = "User with this email already exists"
ERR_PENDING_INVITE_EXISTS = "Pending invite already exists for this email"
ERR_INVITE_NOT_FOUND = "Invite not found"
ERR_INVITE_TOKEN_INVALID = "Invalid invite token"
ERR_INVITE_USED = "Invite token has already been used"
ERR_INVITE_EXPIRED = "Invite token has expired"

# Registration link template lives in config-derived constants, not magic strings.
_REGISTRATION_PATH = "/register"


class MemberInviteService:
    """Orchestrates member-invite use-cases. DB access is delegated to repositories."""

    def __init__(self, db: AsyncSession):
        self.invite_repo = MemberInviteRepository(db)
        self.user_repo = UserRepository(db)
        self.email_service = EmailService()

    # ---------- creation ----------

    async def create_invite(self, invite_data: MemberInviteCreate, creator_id: int) -> Invite:
        """Create a new member invite, persist it, and dispatch the invitation email."""
        await self._assert_email_not_registered(invite_data.email)
        await self._assert_no_pending_invite(invite_data.email)

        invite = Invite.create_member_invite(
            email=invite_data.email,
            full_name=invite_data.full_name,
            created_by=creator_id,
            group_id=invite_data.group_id,
            expires_days=invite_data.expires_days,
        )
        created_invite = await self.invite_repo.create(invite)
        await self._send_invitation_email(created_invite, invite_data.expires_days)
        return created_invite

    # ---------- consumption ----------

    async def use_invite(self, invite_data: MemberInviteUse) -> MemberInviteUseResult:
        """Consume a member-invite token and provision a new member user."""
        invite = await self._load_valid_invite(invite_data.invite_token)
        await self._assert_email_not_registered(invite.email)

        created_user = await self._create_member_user(invite, invite_data.password)
        await self._mark_invite_consumed(invite)

        return MemberInviteUseResult(user_id=created_user.id, email=created_user.email)

    # ---------- listing / lookup ----------

    async def list_invites(self, creator_id: int | None = None) -> list[Invite]:
        if creator_id:
            return await self.invite_repo.list_by_creator(creator_id)
        return await self.invite_repo.list_all()

    async def list_invites_with_status(self) -> list[MemberInviteList]:
        """List all invites mapped to MemberInviteList DTOs with is_expired computed."""
        invites = await self.list_invites()
        return [self._to_list_dto(invite) for invite in invites]

    async def get_invite_by_token(self, token: str) -> Invite:
        invite = await self.invite_repo.get_by_token(token)
        if not invite:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ERR_INVITE_NOT_FOUND)
        return invite

    # ---------- deletion ----------

    async def delete_invite(self, invite_id: int) -> None:
        """Delete an invite by id."""
        invite = await self._load_invite_by_id(invite_id)
        await self.invite_repo.delete(invite)

    # ---------- private helpers (each does ONE thing) ----------

    async def _assert_email_not_registered(self, email: str) -> None:
        if await self.user_repo.get_by_email(email):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ERR_USER_EMAIL_TAKEN)

    async def _assert_no_pending_invite(self, email: str) -> None:
        existing = await self.invite_repo.get_by_email(email)
        if existing and not existing.is_used and not existing.is_expired():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ERR_PENDING_INVITE_EXISTS)

    async def _load_valid_invite(self, token: str) -> Invite:
        invite = await self.invite_repo.get_by_token(token)
        if not invite:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ERR_INVITE_TOKEN_INVALID)
        if not invite.is_valid():
            detail = ERR_INVITE_USED if invite.is_used else ERR_INVITE_EXPIRED
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
        return invite

    async def _load_invite_by_id(self, invite_id: int) -> Invite:
        invite = await self.invite_repo.get_by_id(invite_id)
        if not invite:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ERR_INVITE_NOT_FOUND)
        return invite

    async def _create_member_user(self, invite: Invite, plaintext_password: str) -> User:
        member_user = User(
            email=invite.email,
            full_name=invite.full_name,
            password_hash=hash_password(plaintext_password),
            role=UserRole.MEMBER.value,
            is_active=True,
            group_id=invite.group_id,
            email_verified=True,
        )
        return await self.user_repo.create(member_user)

    async def _mark_invite_consumed(self, invite: Invite) -> Invite:
        invite.is_used = True
        invite.used_at = datetime.now(timezone.utc)
        return await self.invite_repo.update(invite)

    async def _send_invitation_email(self, invite: Invite, expires_days: int) -> None:
        registration_link = f"{settings.FRONTEND_URL}{_REGISTRATION_PATH}?token={invite.invite_token}"
        await self.email_service.send_member_invite_email(
            email=invite.email,
            full_name=invite.full_name,
            registration_link=registration_link,
            expires_days=expires_days,
        )

    @staticmethod
    def _to_list_dto(invite: Invite) -> MemberInviteList:
        return MemberInviteList(
            id=invite.id,
            email=invite.email,
            full_name=invite.full_name,
            group_id=invite.group_id,
            is_used=invite.is_used,
            is_expired=invite.is_expired(),
            expires_at=invite.expires_at,
            created_at=invite.created_at,
        )
