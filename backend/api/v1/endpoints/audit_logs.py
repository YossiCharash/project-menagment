from typing import Annotated

from fastapi import APIRouter, Depends

from backend.core.deps import DBSessionDep
from backend.iam.decorators import require_permission
from backend.schemas.audit_log import (
    AuditLogCountQuery,
    AuditLogCountResult,
    AuditLogFilterQuery,
    AuditLogOut,
    AuditLogWithUserOut,
)
from backend.services.audit_service import AuditService


router = APIRouter()


@router.get("/", response_model=list[AuditLogOut])
async def list_audit_logs(
    db: DBSessionDep,
    filters: Annotated[AuditLogFilterQuery, Depends()],
    user=Depends(require_permission("read", "audit_log", project_id_param=None)),
):
    """List audit logs. Supports filtering by user, entity, action, and date range."""
    return await AuditService(db).list_logs(filters.to_filter())


@router.get("/count", response_model=AuditLogCountResult)
async def count_audit_logs(
    db: DBSessionDep,
    filters: Annotated[AuditLogCountQuery, Depends()],
    user=Depends(require_permission("read", "audit_log", project_id_param=None)),
):
    """Count audit logs with filters."""
    return await AuditService(db).count_logs(filters.to_filter())


@router.get("/with-users", response_model=list[AuditLogWithUserOut])
async def list_audit_logs_with_users(
    db: DBSessionDep,
    filters: Annotated[AuditLogFilterQuery, Depends()],
    user=Depends(require_permission("read", "audit_log", project_id_param=None)),
):
    """List audit logs with user information (name, email) for display."""
    return await AuditService(db).list_logs_with_users(filters.to_filter())
