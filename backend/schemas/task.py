"""Task schemas for Task Management Calendar."""
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class TaskBase(BaseModel):
    title: str
    start_time: datetime
    end_time: datetime
    description: str | None = None
    employee_id: int


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    description: str | None = None
    employee_id: int | None = None


class TaskOut(BaseModel):
    id: int
    title: str
    start_time: datetime
    end_time: datetime
    description: str | None = None
    employee_id: int
    unique_tag: str
    created_at: datetime
    updated_at: datetime
    # Populated when joined
    employee_name: str | None = None
    employee_color: str | None = None

    model_config = ConfigDict(from_attributes=True)
