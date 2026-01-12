from datetime import datetime
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
