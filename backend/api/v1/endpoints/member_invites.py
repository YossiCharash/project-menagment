from fastapi import APIRouter, Depends
from typing import List

from backend.api.v1.messages.member_invites import (
    MSG_INVITE_DELETED,
    MSG_REGISTRATION_COMPLETE,
)
from backend.core.deps import DBSessionDep
from backend.iam.decorators import require_permission
from backend.schemas.member_invite import (
    MemberInviteCreate,
    MemberInviteOut,
    MemberInviteUse,
    MemberInviteUseResponse,
    MemberInviteList,
)
from backend.services.member_invite_service import MemberInviteService
from backend.models.user import User


router = APIRouter()


@router.post("/", response_model=MemberInviteOut)
async def create_member_invite(
    db: DBSessionDep,
    invite_data: MemberInviteCreate,
    current_admin: User = Depends(require_permission("write", "member_invite", project_id_param=None)),
):
    """Create a new member invite and dispatch the registration email."""
    return await MemberInviteService(db).create_invite(invite_data, current_admin.id)


@router.get("/", response_model=List[MemberInviteList])
async def list_member_invites(
    db: DBSessionDep,
    current_admin: User = Depends(require_permission("read", "member_invite", project_id_param=None)),
):
    """List all member invites."""
    return await MemberInviteService(db).list_invites_with_status()


@router.get("/{invite_token}", response_model=MemberInviteOut)
async def get_member_invite(
    invite_token: str,
    db: DBSessionDep,
):
    """Fetch a member invite by token (public endpoint for registration)."""
    return await MemberInviteService(db).get_invite_by_token(invite_token)


@router.post("/use", response_model=MemberInviteUseResponse)
async def use_member_invite(
    db: DBSessionDep,
    invite_data: MemberInviteUse,
) -> MemberInviteUseResponse:
    """Consume an invite token to complete member registration."""
    result = await MemberInviteService(db).use_invite(invite_data)
    return MemberInviteUseResponse(
        message=MSG_REGISTRATION_COMPLETE,
        user_id=result.user_id,
        email=result.email,
    )


@router.delete("/{invite_id}")
async def delete_member_invite(
    invite_id: int,
    db: DBSessionDep,
    current_admin: User = Depends(require_permission("delete", "member_invite", resource_id_param="invite_id", project_id_param=None)),
):
    """Delete a member invite by id."""
    await MemberInviteService(db).delete_invite(invite_id)
    return {"message": MSG_INVITE_DELETED}
