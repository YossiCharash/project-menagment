from fastapi import APIRouter, Depends
from typing import List

from backend.core.deps import DBSessionDep
from backend.iam.decorators import require_permission
from backend.schemas.member_invite import MemberInviteCreate, MemberInviteOut, MemberInviteUse, MemberInviteList
from backend.services.member_invite_service import MemberInviteService
from backend.models.user import User


router = APIRouter()


@router.post("/", response_model=MemberInviteOut)
async def create_member_invite(
    db: DBSessionDep,
    invite_data: MemberInviteCreate,
    current_admin: User = Depends(require_permission("write", "member_invite", project_id_param=None))
):
    """Create a new member invite and send registration email"""
    return await MemberInviteService(db).create_invite(invite_data, current_admin.id)


@router.get("/", response_model=List[MemberInviteList])
async def list_member_invites(
    db: DBSessionDep,
    current_admin: User = Depends(require_permission("read", "member_invite", project_id_param=None))
):
    """List all member invites"""
    return await MemberInviteService(db).list_invites_with_status()


@router.get("/{invite_token}", response_model=MemberInviteOut)
async def get_member_invite(
    invite_token: str,
    db: DBSessionDep
):
    """Get member invite details by token (public endpoint for registration)"""
    return await MemberInviteService(db).get_invite_by_token(invite_token)


@router.post("/use", response_model=dict)
async def use_member_invite(
    db: DBSessionDep,
    invite_data: MemberInviteUse
):
    """Use an invite token to complete member registration"""
    return await MemberInviteService(db).use_invite_and_format(invite_data)


@router.delete("/{invite_id}")
async def delete_member_invite(
    invite_id: int,
    db: DBSessionDep,
    current_admin: User = Depends(require_permission("delete", "member_invite", resource_id_param="invite_id", project_id_param=None))
):
    """Delete a member invite"""
    return await MemberInviteService(db).delete_invite_with_message(invite_id)
