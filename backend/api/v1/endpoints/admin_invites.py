from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from backend.core.deps import DBSessionDep, require_admin, get_current_user
from backend.schemas.admin_invite import AdminInviteCreate, AdminInviteOut, AdminInviteUse, AdminInviteList
from backend.services.admin_invite_service import AdminInviteService
from backend.models.user import User


router = APIRouter()


@router.post("/", response_model=AdminInviteOut)
async def create_admin_invite(
    db: DBSessionDep, 
    invite_data: AdminInviteCreate, 
    current_admin: User = Depends(require_admin())
):
    """Create a new admin invite - Admin only"""
    service = AdminInviteService(db)
    invite = await service.create_invite(invite_data, current_admin.id)
    return invite


@router.get("/", response_model=List[AdminInviteList])
async def list_admin_invites(
    db: DBSessionDep, 
    current_admin: User = Depends(require_admin())
):
    """List all admin invites - Admin only"""
    service = AdminInviteService(db)
    invites = await service.list_invites(current_admin.id)
    
    # Add is_expired field
    result = []
    for invite in invites:
        invite_dict = {
            "id": invite.id,
            "invite_code": invite.invite_code,
            "email": invite.email,
            "full_name": invite.full_name,
            "is_used": invite.is_used,
            "used_at": invite.used_at,
            "expires_at": invite.expires_at,
            "created_at": invite.created_at,
            "is_expired": invite.is_expired()
        }
        result.append(invite_dict)
    
    return result


@router.get("/{invite_code}", response_model=AdminInviteOut)
async def get_admin_invite(
    invite_code: str,
    db: DBSessionDep,
    current_admin: User = Depends(require_admin())
):
    """Get admin invite by code - Admin only"""
    service = AdminInviteService(db)
    invite = await service.get_invite_by_code(invite_code)
    return invite


@router.delete("/{invite_id}")
async def delete_admin_invite(
    invite_id: int,
    db: DBSessionDep,
    current_admin: User = Depends(require_admin())
):
    """Delete admin invite - Admin only"""
    service = AdminInviteService(db)
    await service.delete_invite(invite_id, current_admin.id)
    return {"message": "Invite deleted successfully"}


@router.post("/use", response_model=dict)
async def use_admin_invite(
    db: DBSessionDep,
    invite_data: AdminInviteUse
):
    """Use admin invite code to create admin account - Public endpoint"""
    service = AdminInviteService(db)
    user = await service.use_invite(invite_data)
    return {
        "message": "Admin account created successfully",
        "user_id": user.id,
        "email": user.email
    }
