from fastapi import APIRouter, Depends
from typing import List

from backend.core.deps import DBSessionDep
from backend.iam.decorators import require_permission
from backend.schemas.admin_invite import AdminInviteCreate, AdminInviteOut, AdminInviteUse, AdminInviteList
from backend.services.admin_invite_service import AdminInviteService
from backend.models.user import User


router = APIRouter()


@router.post("/", response_model=AdminInviteOut)
async def create_admin_invite(
    db: DBSessionDep,
    invite_data: AdminInviteCreate,
    current_admin: User = Depends(require_permission("write", "admin_invite", project_id_param=None))
):
    """Create a new admin invite"""
    return await AdminInviteService(db).create_invite(invite_data, current_admin.id)


@router.get("/", response_model=List[AdminInviteList])
async def list_admin_invites(
    db: DBSessionDep,
    current_admin: User = Depends(require_permission("read", "admin_invite", project_id_param=None))
):
    """List all admin invites"""
    return await AdminInviteService(db).list_invites_with_status(current_admin.id)


@router.get("/{invite_code}", response_model=AdminInviteOut)
async def get_admin_invite(
    invite_code: str,
    db: DBSessionDep,
    current_admin: User = Depends(require_permission("read", "admin_invite", project_id_param=None))
):
    """Get admin invite by code"""
    return await AdminInviteService(db).get_invite_by_code(invite_code)


@router.delete("/{invite_id}")
async def delete_admin_invite(
    invite_id: int,
    db: DBSessionDep,
    current_admin: User = Depends(require_permission("delete", "admin_invite", resource_id_param="invite_id", project_id_param=None))
):
    """Delete admin invite"""
    return await AdminInviteService(db).delete_invite_with_message(invite_id, current_admin.id)


@router.post("/use", response_model=dict)
async def use_admin_invite(
    db: DBSessionDep,
    invite_data: AdminInviteUse
):
    """Use admin invite code to create admin account - Public endpoint"""
    return await AdminInviteService(db).use_invite_and_format(invite_data)
