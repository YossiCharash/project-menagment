from fastapi import APIRouter, Depends, Query
from datetime import datetime
from typing import Optional

from backend.core.deps import DBSessionDep
from backend.iam.decorators import require_permission
from backend.schemas.audit_log import AuditLogOut
from backend.services.audit_service import AuditService


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
    user=Depends(require_permission("read", "audit_log", project_id_param=None))
):
    """List audit logs. Supports filtering by user, entity, action, and date range."""
    return await AuditService(db).list_logs(
        limit=limit,
        offset=offset,
        user_id=user_id,
        entity=entity,
        action=action,
        start_date=start_date,
        end_date=end_date,
        exclude_action=exclude_action,
    )


@router.get("/count")
async def count_audit_logs(
    db: DBSessionDep,
    user_id: Optional[int] = Query(None),
    entity: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    exclude_action: Optional[str] = Query(None),
    user=Depends(require_permission("read", "audit_log", project_id_param=None))
):
    """Count audit logs with filters."""
    return await AuditService(db).count_logs(
        user_id=user_id,
        entity=entity,
        action=action,
        start_date=start_date,
        end_date=end_date,
        exclude_action=exclude_action,
    )


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
    user=Depends(require_permission("read", "audit_log", project_id_param=None))
):
    """List audit logs with user information (name, email) for display."""
    return await AuditService(db).list_logs_with_users(
        limit=limit,
        offset=offset,
        user_id=user_id,
        entity=entity,
        action=action,
        start_date=start_date,
        end_date=end_date,
        exclude_action=exclude_action,
    )
