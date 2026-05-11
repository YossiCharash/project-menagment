from fastapi import APIRouter, Depends, Query
from datetime import datetime
from typing import Optional

from backend.core.deps import DBSessionDep
from backend.iam.decorators import require_permission
from backend.schemas.audit_log import (
    AuditLogCountResult,
    AuditLogFilter,
    AuditLogOut,
    AuditLogWithUserOut,
)
from backend.services.audit_service import AuditService


router = APIRouter()


def _build_filter(
    limit: int,
    offset: int,
    user_id: Optional[int],
    entity: Optional[str],
    action: Optional[str],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
    exclude_action: Optional[str],
) -> AuditLogFilter:
    return AuditLogFilter(
        limit=limit,
        offset=offset,
        user_id=user_id,
        entity=entity,
        action=action,
        start_date=start_date,
        end_date=end_date,
        exclude_action=exclude_action,
    )


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
    user=Depends(require_permission("read", "audit_log", project_id_param=None)),
):
    """List audit logs. Supports filtering by user, entity, action, and date range."""
    filters = _build_filter(
        limit, offset, user_id, entity, action, start_date, end_date, exclude_action
    )
    return await AuditService(db).list_logs(filters)


@router.get("/count", response_model=AuditLogCountResult)
async def count_audit_logs(
    db: DBSessionDep,
    user_id: Optional[int] = Query(None),
    entity: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    exclude_action: Optional[str] = Query(None),
    user=Depends(require_permission("read", "audit_log", project_id_param=None)),
):
    """Count audit logs with filters."""
    filters = _build_filter(
        limit=1, offset=0,
        user_id=user_id, entity=entity, action=action,
        start_date=start_date, end_date=end_date, exclude_action=exclude_action,
    )
    return await AuditService(db).count_logs(filters)


@router.get("/with-users", response_model=list[AuditLogWithUserOut])
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
    user=Depends(require_permission("read", "audit_log", project_id_param=None)),
):
    """List audit logs with user information (name, email) for display."""
    filters = _build_filter(
        limit, offset, user_id, entity, action, start_date, end_date, exclude_action
    )
    return await AuditService(db).list_logs_with_users(filters)
