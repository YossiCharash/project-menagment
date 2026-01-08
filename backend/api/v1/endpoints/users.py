from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import update, delete

from backend.core.deps import DBSessionDep, get_current_user, require_roles, require_admin
from backend.repositories.user_repository import UserRepository
from backend.schemas.user import UserOut, UserUpdate
from backend.models.user import UserRole
from backend.core.security import hash_password
from backend.services.audit_service import AuditService
from backend.models.project import Project
from backend.models.transaction import Transaction
from backend.models.recurring_transaction import RecurringTransactionTemplate
from backend.models.archived_contract import ArchivedContract
from backend.models.audit_log import AuditLog
from backend.models.member_invite import MemberInvite
from backend.models.admin_invite import AdminInvite

router = APIRouter()


@router.get("/me", response_model=UserOut)
async def get_me(current = Depends(get_current_user)):
    return current


@router.get("/", response_model=list[UserOut])
async def list_users(db: DBSessionDep, user = Depends(require_admin())):
    """List all users - Admin only"""
    return await UserRepository(db).list()


@router.get("/profile", response_model=UserOut)
async def get_user_profile(db: DBSessionDep, current_user = Depends(get_current_user)):
    """Get current user profile"""
    return current_user


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int, 
    user_data: UserUpdate, 
    db: DBSessionDep, 
    current_admin = Depends(require_admin())
):
    """Update user - Admin only"""
    user_repo = UserRepository(db)
    
    # Check if user exists
    user = await user_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Store old values for audit log
    old_values = {
        'full_name': user.full_name,
        'role': user.role,
        'is_active': str(user.is_active)
    }
    
    # Update user fields
    if user_data.full_name is not None:
        user.full_name = user_data.full_name
    if user_data.role is not None:
        user.role = user_data.role
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    if user_data.group_id is not None:
        user.group_id = user_data.group_id
    if user_data.password is not None:
        user.password_hash = hash_password(user_data.password)
    
    updated_user = await user_repo.update(user)
    
    # Log update action
    new_values = {k: str(v) for k, v in user_data.model_dump(exclude_unset=True).items() if k != 'password'}
    await AuditService(db).log_user_action(
        user_id=current_admin.id,
        action='update',
        target_user_id=user_id,
        details={'old_values': old_values, 'new_values': new_values}
    )
    
    return updated_user


@router.delete("/{user_id}")
async def delete_user(user_id: int, db: DBSessionDep, current_admin = Depends(require_admin())):
    """Delete user - Admin only"""
    user_repo = UserRepository(db)
    
    # Check if user exists
    user = await user_repo.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent admin from deleting themselves
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete yourself"
        )
    
    # Store user details for audit log
    user_details = {'email': user.email, 'full_name': user.full_name}
    
    # Cleanup dependencies
    # 1. Nullify Project manager
    await db.execute(
        update(Project)
        .where(Project.manager_id == user_id)
        .values(manager_id=None)
    )

    # 2. Nullify Transaction creator
    await db.execute(
        update(Transaction)
        .where(Transaction.created_by_user_id == user_id)
        .values(created_by_user_id=None)
    )

    # 3. Nullify RecurringTransactionTemplate creator
    await db.execute(
        update(RecurringTransactionTemplate)
        .where(RecurringTransactionTemplate.created_by_user_id == user_id)
        .values(created_by_user_id=None)
    )

    # 4. Nullify ArchivedContract archiver
    await db.execute(
        update(ArchivedContract)
        .where(ArchivedContract.archived_by_user_id == user_id)
        .values(archived_by_user_id=None)
    )

    # 5. Nullify AuditLog user
    await db.execute(
        update(AuditLog)
        .where(AuditLog.user_id == user_id)
        .values(user_id=None)
    )

    # 6. Delete MemberInvite
    await db.execute(
        delete(MemberInvite)
        .where(MemberInvite.created_by == user_id)
    )

    # 7. Delete AdminInvite
    await db.execute(
        delete(AdminInvite)
        .where(AdminInvite.created_by == user_id)
    )

    await user_repo.delete(user)
    
    # Log delete action
    await AuditService(db).log_user_action(
        user_id=current_admin.id,
        action='delete',
        target_user_id=user_id,
        details=user_details
    )
    
    return {"message": "User deleted successfully"}
