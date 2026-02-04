"""Employee schemas for Task Management Calendar."""
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class EmployeeBase(BaseModel):
    name: str
    email: str | None = None
    color: str | None = None


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    color: str | None = None
    is_active: bool | None = None


class EmployeeOut(EmployeeBase):
    id: int
    is_active: bool = True
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
