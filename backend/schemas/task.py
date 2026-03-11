"""Task schemas for Task Management Calendar."""
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict

from backend.schemas.task_label import TaskLabelOut


TASK_STATUS_VALUES = ("pending", "in_progress", "completed", "pending_closure")

PARTICIPANT_RESPONSE_VALUES = ("pending", "accepted", "declined")

RECURRENCE_RULE_VALUES = ("", "weekly", "monthly")


class TaskParticipantOut(BaseModel):
    user_id: int
    full_name: str
    response_status: str  # pending, accepted, declined
    avatar_url: str | None = None


class TaskMessageOut(BaseModel):
    id: int
    task_id: int
    user_id: int
    full_name: str
    avatar_url: str | None = None
    message: str
    created_at: datetime


class TaskMessageCreate(BaseModel):
    message: str


class TaskAttachmentOut(BaseModel):
    id: int
    file_name: str
    """URL path to download the file (e.g. /uploads/task_attachments/...)"""
    file_url: str


class TaskChecklistItemCreate(BaseModel):
    text: str


class TaskChecklistItemUpdate(BaseModel):
    is_completed: bool | None = None
    text: str | None = None
    assigned_to_user_id: int | None = None
    clear_assignment: bool = False


class TaskChecklistItemOut(BaseModel):
    id: int
    task_id: int
    text: str
    is_completed: bool
    sort_order: int
    created_at: datetime
    assigned_to_user_id: int | None = None
    assigned_user_name: str | None = None
    assigned_user_avatar: str | None = None
    assigned_user_color: str | None = None
    handled_by_user_id: int | None = None
    handled_by_user_name: str | None = None
    handled_by_user_avatar: str | None = None
    handled_by_user_color: str | None = None
    handled_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class TaskChecklistSummary(BaseModel):
    total: int
    completed: int
    progress_pct: float


class TaskBase(BaseModel):
    title: str
    start_time: datetime | None = None
    end_time: datetime | None = None
    description: str | None = None
    status: str = "pending"
    event_type: str = "task"
    assigned_to_user_id: int
    recurrence_rule: str = ""
    recurrence_end_date: date | None = None
    requires_closure_approval: bool = False
    is_super_task: bool = False


class TaskCreate(TaskBase):
    label_ids: list[int] = []
    participant_ids: list[int] = []  # users to invite (like Outlook)


class TaskUpdate(BaseModel):
    title: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    description: str | None = None
    status: str | None = None
    event_type: str | None = None
    assigned_to_user_id: int | None = None
    label_ids: list[int] | None = None
    recurrence_rule: str | None = None
    recurrence_end_date: date | None = None
    participant_ids: list[int] | None = None
    requires_closure_approval: bool | None = None
    is_super_task: bool | None = None


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
    recurrence_rule: str = ""
    recurrence_end_date: date | None = None
    created_at: datetime
    updated_at: datetime
    assignee_acknowledged_at: datetime | None = None
    assignee_viewed_at: datetime | None = None
    is_archived: bool = False
    archived_at: datetime | None = None
    completed_at: datetime | None = None
    requires_closure_approval: bool = False
    is_super_task: bool = False
    assigned_user_name: str | None = None
    assigned_user_color: str | None = None
    assigned_user_avatar: str | None = None
    labels: list[TaskLabelOut] = []
    participants: list[TaskParticipantOut] = []
    attachments: list[TaskAttachmentOut] = []
    checklist_summary: TaskChecklistSummary | None = None

    model_config = ConfigDict(from_attributes=True)


ARCHIVED_PRESET_VALUES = ("last_week", "last_month", "last_3_months")


class ArchivedTasksFilter(BaseModel):
    date_from: datetime | None = None
    date_to: datetime | None = None
    preset: str | None = None
