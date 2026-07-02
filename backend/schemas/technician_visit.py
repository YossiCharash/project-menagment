from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class TechnicianVisitBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    role: str | None = None
    phone: str | None = None
    note: str | None = None


class TechnicianVisitCreate(TechnicianVisitBase):
    apartment_id: int


class TechnicianVisitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    role: str | None = None
    phone: str | None = None
    note: str | None = None
    status: str | None = Field(default=None, pattern="^(inside|left)$")


class TechnicianVisitOut(TechnicianVisitBase):
    id: int
    apartment_id: int
    status: str  # inside | left
    entered_at: datetime
    left_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
