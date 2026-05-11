"""Schemas for user notifications (הודעות, הוראות, תזכורות)."""
from __future__ import annotations
from datetime import datetime
from typing import TYPE_CHECKING
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from backend.models.user_notification import UserNotification

NOTIFICATION_TYPE_VALUES = ("instruction", "task_assignment", "task_reminder", "general")

# ---------------------------------------------------------------------------
# Hebrew title/body templates used when building system-generated notifications.
# Kept here (not buried in the service) so titles can be tweaked without
# touching business logic.
# ---------------------------------------------------------------------------
TASK_ASSIGNMENT_TITLE_TEMPLATE = "משימה חדשה: {task_title}"
TASK_INVITATION_TITLE_TEMPLATE = "הזמנה למשימה: {task_title}"
TASK_REMINDER_TITLE_TEMPLATE = "תזכורת: {task_title}"
TASK_CLOSURE_APPROVAL_TITLE_TEMPLATE = "בקשת סגירת משימה: {task_title}"
TASK_CLOSURE_APPROVAL_BODY_TEMPLATE = (
    "העובד {requester_name} ביקש לסגור את המשימה. ממתין לאישורך."
)
TASK_DATE_BODY_TEMPLATE = "תאריך: {when}"
TASK_DATE_FORMAT = "%d/%m/%Y %H:%M"
UNKNOWN_USER_NAME_TEMPLATE = "משתמש #{user_id}"

ADMIN_ROLE = "Admin"

# ---------------------------------------------------------------------------
# Error / status messages surfaced to API clients. Centralised so they can be
# reused by routes and translated/tweaked without hunting through services.
# ---------------------------------------------------------------------------
ERROR_NOTIFICATION_NOT_FOUND = "הודעה לא נמצאה"
ERROR_ONLY_ADMIN_CAN_SEND = "רק מנהל יכול לשלוח הודעות למשתמשים"
ERROR_AT_LEAST_ONE_RECIPIENT = "יש לבחור לפחות משתמש אחד"


class NotificationOut(BaseModel):
    id: int
    user_id: int
    from_user_id: int | None
    task_id: int | None
    type: str
    title: str
    body: str | None
    read_at: datetime | None
    created_at: datetime
    from_user_name: str | None = None
    task_title: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, notification: "UserNotification") -> "NotificationOut":
        """Build the output DTO from an ORM model (with optional joined relations)."""
        from_user = getattr(notification, "from_user", None)
        task = getattr(notification, "task", None)
        return cls(
            id=notification.id,
            user_id=notification.user_id,
            from_user_id=notification.from_user_id,
            task_id=notification.task_id,
            type=notification.type,
            title=notification.title,
            body=notification.body,
            read_at=notification.read_at,
            created_at=notification.created_at,
            from_user_name=from_user.full_name if from_user else None,
            task_title=task.title if task else None,
        )


class NotificationCreate(BaseModel):
    """Admin sends a message to one or more users."""
    user_ids: list[int]
    type: str = "general"
    title: str
    body: str | None = None


class NotificationMarkRead(BaseModel):
    read: bool = True


class NotificationListFilters(BaseModel):
    """Filters for listing a user's notifications.

    Built either by FastAPI Depends() from query parameters (then injected
    with the user_id at the route layer) or directly by other callers.
    """
    user_id: int = 0
    unread_only: bool = False
    type_filter: str | None = None
    limit: int = Field(default=100, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


class NotificationReadStateUpdate(BaseModel):
    """Input DTO for changing the read state of a notification."""
    notification_id: int
    user_id: int
    read: bool


class UnreadCountResult(BaseModel):
    """Output DTO for the unread notification count."""
    count: int
