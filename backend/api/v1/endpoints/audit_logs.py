from fastapi import APIRouter, Depends, Query, HTTPException
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import DBSessionDep, get_current_user, require_admin
from backend.repositories.audit_repository import AuditRepository
from backend.repositories.user_repository import UserRepository
from backend.schemas.audit_log import AuditLogOut
from backend.models.user import User


router = APIRouter()


@router.get("/", response_model=list[AuditLogOut])
async def list_audit_logs(
    db: DBSessionDep,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user_id: Optional[int] = Query(None),
    entity: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    exclude_action: Optional[str] = Query(None),
    user = Depends(require_admin())
):
    """
    List audit logs - Admin only
    Supports filtering by user, entity, action, and date range
    """
    repo = AuditRepository(db)
    logs = await repo.list(
        limit=limit,
        offset=offset,
        user_id=user_id,
        entity=entity,
        action=action,
        start_date=start_date,
        end_date=end_date,
        exclude_action=exclude_action
    )
    return logs


@router.get("/count")
async def count_audit_logs(
    db: DBSessionDep,
    user_id: Optional[int] = Query(None),
    entity: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    exclude_action: Optional[str] = Query(None),
    user = Depends(require_admin())
):
    """
    Count audit logs with filters - Admin only
    """
    repo = AuditRepository(db)
    count = await repo.count(
        user_id=user_id,
        entity=entity,
        action=action,
        start_date=start_date,
        end_date=end_date,
        exclude_action=exclude_action
    )
    return {"count": count}


@router.get("/with-users", response_model=list[dict])
async def list_audit_logs_with_users(
    db: DBSessionDep,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user_id: Optional[int] = Query(None),
    entity: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    exclude_action: Optional[str] = Query(None),
    user = Depends(require_admin())
):
    """
    List audit logs with user information - Admin only
    Returns logs with user details (name, email) for better display
    """
    repo = AuditRepository(db)
    user_repo = UserRepository(db)
    
    logs = await repo.list(
        limit=limit,
        offset=offset,
        user_id=user_id,
        entity=entity,
        action=action,
        start_date=start_date,
        end_date=end_date,
        exclude_action=exclude_action
    )
    
    # Get unique user IDs
    user_ids = {log.user_id for log in logs if log.user_id}
    
    # Fetch user details
    users_dict = {}
    for uid in user_ids:
        user_obj = await user_repo.get_by_id(uid)
        if user_obj:
            users_dict[uid] = {
                "id": user_obj.id,
                "full_name": user_obj.full_name,
                "email": user_obj.email
            }
    
    # Combine logs with user info
    result = []
    for log in logs:
        log_dict = {
            "id": log.id,
            "user_id": log.user_id,
            "user": users_dict.get(log.user_id) if log.user_id else None,
            "action": log.action,
            "entity": log.entity,
            "entity_id": log.entity_id,
            "details": log.details,
            "created_at": log.created_at
        }
        result.append(log_dict)
    
    return result

