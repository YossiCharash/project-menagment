"""Task schemas for Task Management Calendar."""
from datetime import datetime
from pydantic import BaseModel, ConfigDict


TASK_STATUS_VALUES = ("pending", "in_progress", "completed")


class TaskBase(BaseModel):
    title: str
    start_time: datetime | None = None
    end_time: datetime | None = None
    description: str | None = None
    status: str = "pending"
    event_type: str = "task"
    assigned_to_user_id: int


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    description: str | None = None
    status: str | None = None
    event_type: str | None = None
    assigned_to_user_id: int | None = None


class TaskOut(BaseModel):
    id: int
    title: str
    start_time: datetime | None = None
    end_time: datetime | None = None
    description: str | None = None
    status: str
    event_type: str
    assigned_to_user_id: int
    unique_tag: str
    created_at: datetime
    updated_at: datetime
    assigned_user_name: str | None = None
    assigned_user_color: str | None = None

    model_config = ConfigDict(from_attributes=True)
