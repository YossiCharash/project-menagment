from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from backend.core.deps import DBSessionDep, get_current_user
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
    service = MemberInviteService(db)
    invite = await service.create_invite(invite_data, current_admin.id)
    return invite


@router.get("/", response_model=List[MemberInviteList])
async def list_member_invites(
    db: DBSessionDep, 
    current_admin: User = Depends(require_permission("read", "member_invite", project_id_param=None))
):
    """List all member invites"""
    service = MemberInviteService(db)
    invites = await service.list_invites()
    
    # Convert to list format with expired status
    result = []
    for invite in invites:
        result.append(MemberInviteList(
            id=invite.id,
            email=invite.email,
            full_name=invite.full_name,
            group_id=invite.group_id,
            is_used=invite.is_used,
            is_expired=invite.is_expired(),
            expires_at=invite.expires_at,
            created_at=invite.created_at
        ))
    return result


@router.get("/{invite_token}", response_model=MemberInviteOut)
async def get_member_invite(
    invite_token: str,
    db: DBSessionDep
):
    """Get member invite details by token (public endpoint for registration)"""
    service = MemberInviteService(db)
    invite = await service.get_invite_by_token(invite_token)
    return invite


@router.post("/use", response_model=dict)
async def use_member_invite(
    db: DBSessionDep,
    invite_data: MemberInviteUse
):
    """Use an invite token to complete member registration"""
    service = MemberInviteService(db)
    user = await service.use_invite(invite_data)
    
    return {
        "message": "Registration completed successfully",
        "user_id": user.id,
        "email": user.email
    }


@router.delete("/{invite_id}")
async def delete_member_invite(
    invite_id: int,
    db: DBSessionDep,
    current_admin: User = Depends(require_permission("delete", "member_invite", resource_id_param="invite_id", project_id_param=None))
):
    """Delete a member invite"""
    service = MemberInviteService(db)
    await service.delete_invite(invite_id)
    return {"message": "Invite deleted successfully"}
