from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


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
    """Input DTO describing filters for querying audit logs (service layer)."""
    limit: int = 100
    offset: int = 0
    user_id: Optional[int] = None
    entity: Optional[str] = None
    action: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    exclude_action: Optional[str] = None


class AuditLogFilterQuery(BaseModel):
    """Query-parameter DTO assembled by FastAPI Depends() at the route layer.

    Mirrors AuditLogFilter but with validation bounds appropriate for HTTP
    query parameters. Use `.to_filter()` to convert to the service-layer DTO.
    """
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)
    user_id: Optional[int] = None
    entity: Optional[str] = None
    action: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    exclude_action: Optional[str] = None

    def to_filter(self) -> "AuditLogFilter":
        return AuditLogFilter(**self.model_dump())


class AuditLogCountQuery(BaseModel):
    """Query-parameter DTO for the count endpoint (no limit/offset)."""
    user_id: Optional[int] = None
    entity: Optional[str] = None
    action: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    exclude_action: Optional[str] = None

    def to_filter(self) -> "AuditLogFilter":
        return AuditLogFilter(limit=1, offset=0, **self.model_dump())


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
