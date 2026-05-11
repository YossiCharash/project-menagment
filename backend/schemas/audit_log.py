from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None
    action: str
    entity: str
    entity_id: str
    details: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuditLogFilter(BaseModel):
    """Input DTO describing filters for querying audit logs."""
    limit: int = 100
    offset: int = 0
    user_id: Optional[int] = None
    entity: Optional[str] = None
    action: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    exclude_action: Optional[str] = None


class AuditLogUserInfo(BaseModel):
    id: int
    full_name: str | None = None
    email: str | None = None
    avatar_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AuditLogWithUserOut(BaseModel):
    """Output DTO for audit logs joined with user info."""
    id: int
    user_id: int | None
    user: AuditLogUserInfo | None = None
    action: str
    entity: str
    entity_id: str
    details: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuditLogCountResult(BaseModel):
    """Output DTO for the audit log count endpoint."""
    count: int


class AuditEvent(BaseModel):
    """Input DTO describing an audit event to record."""
    user_id: Optional[int]
    action: str
    entity: str
    entity_id: str
    details: Optional[dict] = None
