"""Task label schemas for calendar task labels."""
from pydantic import BaseModel, ConfigDict


class TaskLabelBase(BaseModel):
    name: str
    color: str = "#3B82F6"


class TaskLabelCreate(TaskLabelBase):
    pass


class TaskLabelUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class TaskLabelOut(BaseModel):
    id: int
    name: str
    color: str

    model_config = ConfigDict(from_attributes=True)
