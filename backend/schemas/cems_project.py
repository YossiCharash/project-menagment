import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CemsProjectBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    is_active: bool = True


class CemsProjectCreate(CemsProjectBase):
    pass


class CemsProjectUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class CemsProjectRead(CemsProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
