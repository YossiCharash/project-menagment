import os
from io import BytesIO
from sqlalchemy import update, delete
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile

from backend.core.deps import DBSessionDep, get_current_user, require_roles
from backend.iam.decorators import require_permission
from backend.core.config import settings
from backend.repositories.user_repository import UserRepository
from backend.schemas.user import UserOut, UserUpdate, CalendarSettingsUpdate, ProfileUpdate
from backend.models.user import UserRole
from backend.core.security import hash_password
from backend.services.audit_service import AuditService
from backend.models.project import Project
from backend.models.transaction import Transaction
from backend.models.recurring_transaction import RecurringTransactionTemplate
from backend.models.contract_period import ContractPeriod
from backend.models.audit_log import AuditLog
from backend.models.invite import Invite
from backend.models.task import Task
from backend.models.user_notification import UserNotification

router = APIRouter()


@router.get("/me", response_model=UserOut)
async def get_me(current = Depends(get_current_user)):
    return current


@router.get("/for-tasks")
async def list_users_for_tasks(db: DBSessionDep, user=Depends(get_current_user)):
    """List users for task assignment: Admin sees all; Member sees only themselves. Includes calendar_color and avatar_url."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from backend.models.user import User
    if user.role == "Admin":
        res = await db.execute(
            select(User).where(User.is_active == True).order_by(User.full_name)
            .options(selectinload(User.preferences))
        )
        rows = res.scalars().all()
        return [{"id": r.id, "full_name": r.full_name, "calendar_color": r.preferences.calendar_color if r.preferences else None, "avatar_url": r.avatar_url} for r in rows]
    pref_color = user.preferences.calendar_color if user.preferences else None
    return [{"id": user.id, "full_name": user.full_name, "calendar_color": pref_color, "avatar_url": user.avatar_url}]


@router.get("/for-invite")
async def list_users_for_invite(db: DBSessionDep, user=Depends(get_current_user)):
    """List users that can be invited to calendar events (like Outlook). All active users for both Admin and Member."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from backend.models.user import User
    res = await db.execute(
        select(User).where(User.is_active == True).order_by(User.full_name)
        .options(selectinload(User.preferences))
    )
    rows = res.scalars().all()
    return [{"id": r.id, "full_name": r.full_name, "calendar_color": r.preferences.calendar_color if r.preferences else None, "avatar_url": r.avatar_url} for r in rows]


def _get_uploads_dir() -> str:
    if os.path.isabs(settings.FILE_UPLOAD_DIR):
        return settings.FILE_UPLOAD_DIR
    current_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
    return os.path.abspath(os.path.join(backend_dir, settings.FILE_UPLOAD_DIR))


@router.post("/me/avatar", response_model=UserOut)
async def upload_my_avatar(
    db: DBSessionDep,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """Upload profile picture for the current user."""
    return await _upload_user_avatar_impl(db, current_user.id, current_user.id, file, is_self=True)


@router.post("/{user_id}/avatar", response_model=UserOut)
async def upload_user_avatar(
    user_id: int,
    db: DBSessionDep,
    file: UploadFile = File(...),
    current_user=Depends(require_permission("delete", "user", resource_id_param="user_id", project_id_param=None)),
):
    """Upload profile picture for a user."""
    return await _upload_user_avatar_impl(db, user_id, current_user.id, file, is_self=False)


async def _upload_user_avatar_impl(db, target_user_id: int, actor_user_id: int, file: UploadFile, *, is_self: bool):
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(target_user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    allowed = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(sorted(allowed))}",
        )

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 5MB)")

    file_obj = BytesIO(content)
    avatar_url = None

    if settings.AWS_S3_BUCKET:
        try:
            from backend.services.s3_service import S3Service
            s3 = S3Service()
            avatar_url = s3.upload_file(
                prefix="avatars",
                file_obj=file_obj,
                filename=file.filename or "avatar",
                content_type=file.content_type,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception("Avatar upload to S3 failed")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="העלאת תמונה נכשלה. נסה שוב.")

    if not avatar_url:
        import uuid
        uploads_dir = _get_uploads_dir()
        avatars_dir = os.path.join(uploads_dir, "avatars")
        os.makedirs(avatars_dir, exist_ok=True)
        filename = f"{uuid.uuid4().hex}{ext}"
        path = os.path.join(avatars_dir, filename)
        with open(path, "wb") as f:
            f.write(content)
        avatar_url = f"/uploads/avatars/{filename}"

    user.avatar_url = avatar_url
    updated = await user_repo.update(user)

    if not is_self:
        await AuditService(db).log_user_action(
            user_id=actor_user_id,
            action="update",
            target_user_id=target_user_id,
            details={"avatar_uploaded": True},
        )

    return updated


@router.get("/", response_model=list[UserOut])
async def list_users(db: DBSessionDep, user = Depends(require_permission("read", "user", project_id_param=None))):
    """List all users"""
    return await UserRepository(db).list()


@router.get("/profile", response_model=UserOut)
async def get_user_profile(db: DBSessionDep, current_user = Depends(get_current_user)):
    """Get current user profile"""
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_my_calendar_settings(
    data: CalendarSettingsUpdate,
    db: DBSessionDep,
    current_user=Depends(get_current_user),
):
    """Update current user's calendar settings only. Any authenticated user can update their own."""
    from backend.models.user_preference import UserPreference
    from sqlalchemy import select as _select
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(current_user.id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    # Upsert into user_preferences
    pref_result = await db.execute(_select(UserPreference).where(UserPreference.user_id == current_user.id))
    pref = pref_result.scalar_one_or_none()
    if pref is None:
        pref = UserPreference(user_id=current_user.id)
        db.add(pref)
    if data.calendar_color is not None:
        pref.calendar_color = (data.calendar_color.strip() or None) if isinstance(data.calendar_color, str) else data.calendar_color
    if data.calendar_date_display is not None:
        pref.calendar_date_display = data.calendar_date_display
    if data.show_jewish_holidays is not None:
        pref.show_jewish_holidays = data.show_jewish_holidays
    if data.show_islamic_holidays is not None:
        pref.show_islamic_holidays = data.show_islamic_holidays
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/me/profile", response_model=UserOut)
async def update_my_profile(
    data: ProfileUpdate,
    db: DBSessionDep,
    current_user=Depends(get_current_user),
):
    """Update current user's profile: name, email, phone. Any authenticated user can update their own."""
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(current_user.id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if data.full_name is not None:
        user.full_name = data.full_name.strip()
    if data.email is not None:
        existing = await user_repo.get_by_email(data.email)
        if existing and existing.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="כתובת המייל כבר בשימוש על ידי משתמש אחר",
            )
        user.email = data.email
    if data.phone is not None:
        user.phone = data.phone.strip() or None
    return await user_repo.update(user)


@router.get("/{user_id}", response_model=UserOut)
async def get_user_by_id(
    user_id: int,
    db: DBSessionDep,
    _=Depends(require_permission("read", "user", project_id_param=None)),
):
    """Get a single user by ID. Admin only."""
    user = await UserRepository(db).get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int, 
    user_data: UserUpdate, 
    db: DBSessionDep, 
    current_admin = Depends(require_permission("delete", "user", resource_id_param="user_id", project_id_param=None))
):
    """Update user"""
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
    # Delegate calendar fields to user_preferences
    calendar_fields = {k: v for k, v in {
        "calendar_color": user_data.calendar_color,
        "calendar_date_display": user_data.calendar_date_display,
        "show_jewish_holidays": user_data.show_jewish_holidays,
        "show_islamic_holidays": user_data.show_islamic_holidays,
    }.items() if v is not None}
    if calendar_fields:
        from backend.models.user_preference import UserPreference
        from sqlalchemy import select as _select
        pref_result = await db.execute(_select(UserPreference).where(UserPreference.user_id == user_id))
        pref = pref_result.scalar_one_or_none()
        if pref is None:
            pref = UserPreference(user_id=user_id)
            db.add(pref)
        for field, value in calendar_fields.items():
            if field == "calendar_color" and isinstance(value, str):
                value = value.strip() or None
            setattr(pref, field, value)
        await db.commit()

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
async def delete_user(user_id: int, db: DBSessionDep, current_admin = Depends(require_permission("delete", "user", resource_id_param="user_id", project_id_param=None))):
    """Delete user"""
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

    # 4. Nullify ContractPeriod archiver
    await db.execute(
        update(ContractPeriod)
        .where(ContractPeriod.archived_by_user_id == user_id)
        .values(archived_by_user_id=None)
    )

    # 5. Nullify AuditLog user
    await db.execute(
        update(AuditLog)
        .where(AuditLog.user_id == user_id)
        .values(user_id=None)
    )

    # 6. Delete invites created by this user (unified table)
    await db.execute(
        delete(Invite)
        .where(Invite.created_by == user_id)
    )

    # 8. Delete tasks assigned to this user
    await db.execute(
        delete(Task)
        .where(Task.assigned_to_user_id == user_id)
    )

    # 9. Delete user notifications (user_id is NOT NULL)
    await db.execute(
        delete(UserNotification)
        .where(UserNotification.user_id == user_id)
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
