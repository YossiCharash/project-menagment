"""Service for user notifications.

All notification logic is exposed as module-level async functions (one consistent
style — no mixed module/class API). Services orchestrate; all DB access is
delegated to ``NotificationRepository`` and ``UserRepository``.
"""
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.user import User
from backend.models.user_notification import NotificationType
from backend.models.task import Task
from backend.repositories.notification_repository import NotificationRepository
from backend.repositories.user_repository import UserRepository
from backend.schemas.notification import (
    ADMIN_ROLE,
    ERROR_AT_LEAST_ONE_RECIPIENT,
    ERROR_NOTIFICATION_NOT_FOUND,
    ERROR_ONLY_ADMIN_CAN_SEND,
    NOTIFICATION_TYPE_VALUES,
    NotificationCreate,
    NotificationListFilters,
    NotificationOut,
    NotificationReadStateUpdate,
    TASK_ASSIGNMENT_TITLE_TEMPLATE,
    TASK_CLOSURE_APPROVAL_BODY_TEMPLATE,
    TASK_CLOSURE_APPROVAL_TITLE_TEMPLATE,
    TASK_DATE_BODY_TEMPLATE,
    TASK_DATE_FORMAT,
    TASK_INVITATION_TITLE_TEMPLATE,
    TASK_REMINDER_TITLE_TEMPLATE,
    UNKNOWN_USER_NAME_TEMPLATE,
    UnreadCountResult,
)


# ---------------------------------------------------------------------------
# Internal helpers (single responsibility, easy to read).
# ---------------------------------------------------------------------------
def _build_task_body(task: Task) -> str | None:
    """Return the notification body for a task — description + formatted date."""
    description = task.description or None
    if not task.start_time:
        return description
    formatted_date = TASK_DATE_BODY_TEMPLATE.format(
        when=task.start_time.strftime(TASK_DATE_FORMAT)
    )
    if description:
        return f"{description}\n{formatted_date}"
    return formatted_date


def _resolve_requester_name(requester: User | None, requesting_user_id: int) -> str:
    if requester is not None:
        return requester.full_name
    return UNKNOWN_USER_NAME_TEMPLATE.format(user_id=requesting_user_id)


def _normalize_type_filter(type_filter: str | None) -> str | None:
    if type_filter and type_filter not in NOTIFICATION_TYPE_VALUES:
        return None
    return type_filter


def _coerce_notification_type(requested_type: str) -> str:
    if requested_type in NOTIFICATION_TYPE_VALUES:
        return requested_type
    return NotificationType.GENERAL


# ---------------------------------------------------------------------------
# System-generated notifications (called from tasks endpoints).
# ---------------------------------------------------------------------------
async def create_task_assignment_notifications(
    db: AsyncSession,
    task: Task,
    from_user_id: int,
    *,
    for_new_assignee: bool = True,
    for_new_participants: bool = True,
) -> None:
    """
    Create 'task_assignment' notifications for the assignee and participants.
    Call after creating a task or after updating assignee/participants.
    """
    repo = NotificationRepository(db)
    body = _build_task_body(task)
    notified_user_ids: set[int] = set()

    if (
        for_new_assignee
        and task.assigned_to_user_id
        and task.assigned_to_user_id != from_user_id
    ):
        notified_user_ids.add(task.assigned_to_user_id)
        await repo.create_for_user(
            user_id=task.assigned_to_user_id,
            from_user_id=from_user_id,
            task_id=task.id,
            notification_type=NotificationType.TASK_ASSIGNMENT,
            title=TASK_ASSIGNMENT_TITLE_TEMPLATE.format(task_title=task.title),
            body=body,
        )

    if for_new_participants:
        participants = getattr(task, "participants", None) or []
        for participant in participants:
            participant_user_id = getattr(participant, "user_id", None)
            if (
                participant_user_id
                and participant_user_id != from_user_id
                and participant_user_id not in notified_user_ids
            ):
                notified_user_ids.add(participant_user_id)
                await repo.create_for_user(
                    user_id=participant_user_id,
                    from_user_id=from_user_id,
                    task_id=task.id,
                    notification_type=NotificationType.TASK_ASSIGNMENT,
                    title=TASK_INVITATION_TITLE_TEMPLATE.format(task_title=task.title),
                    body=body,
                )

    await repo.flush()


async def create_task_reminder(
    db: AsyncSession,
    task: Task,
    from_user_id: int,
) -> None:
    """
    Create a 'task_reminder' notification for the task assignee.
    Used when someone clicks "הזכר" on a task – the assignee gets a message in הודעות.
    """
    if not task.assigned_to_user_id:
        return
    repo = NotificationRepository(db)
    await repo.create_for_user(
        user_id=task.assigned_to_user_id,
        from_user_id=from_user_id,
        task_id=task.id,
        notification_type=NotificationType.TASK_REMINDER,
        title=TASK_REMINDER_TITLE_TEMPLATE.format(task_title=task.title),
        body=_build_task_body(task),
    )
    await repo.flush()


async def create_closure_approval_notification(
    db: AsyncSession,
    task: Task,
    requesting_user_id: int,
) -> None:
    """
    Notify all active admin users that a non-admin requested closure of a task.
    Called when a non-admin tries to complete a task with requires_closure_approval=True.
    """
    user_repo = UserRepository(db)
    admins = await user_repo.list_active_admins()
    if not admins:
        return

    requester = await user_repo.get_by_id(requesting_user_id)
    requester_name = _resolve_requester_name(requester, requesting_user_id)

    repo = NotificationRepository(db)
    title = TASK_CLOSURE_APPROVAL_TITLE_TEMPLATE.format(task_title=task.title)
    body = TASK_CLOSURE_APPROVAL_BODY_TEMPLATE.format(requester_name=requester_name)
    for admin in admins:
        await repo.create_for_user(
            user_id=admin.id,
            from_user_id=requesting_user_id,
            task_id=task.id,
            notification_type=NotificationType.TASK_ASSIGNMENT,
            title=title,
            body=body,
        )
    await repo.flush()


# ---------------------------------------------------------------------------
# User-facing API operations (called from notifications endpoints).
# All take DTOs as input where applicable; all return DTOs.
# ---------------------------------------------------------------------------
async def list_notifications_for_user(
    db: AsyncSession,
    query: NotificationListFilters,
) -> list[NotificationOut]:
    """Return the user's notifications matching the given filter."""
    repo = NotificationRepository(db)
    notifications = await repo.list_for_user(
        query.user_id,
        unread_only=query.unread_only,
        type_filter=_normalize_type_filter(query.type_filter),
        limit=query.limit,
        offset=query.offset,
    )
    return [NotificationOut.from_model(notification) for notification in notifications]


async def get_unread_count(db: AsyncSession, user_id: int) -> UnreadCountResult:
    repo = NotificationRepository(db)
    return UnreadCountResult(count=await repo.count_unread(user_id))


async def get_notification_for_user(
    db: AsyncSession,
    notification_id: int,
    user_id: int,
) -> NotificationOut:
    repo = NotificationRepository(db)
    notification = await repo.get_by_id(notification_id, user_id)
    if not notification:
        raise HTTPException(status_code=404, detail=ERROR_NOTIFICATION_NOT_FOUND)
    return NotificationOut.from_model(notification)


async def update_notification_read_state(
    db: AsyncSession,
    update: NotificationReadStateUpdate,
) -> NotificationOut:
    repo = NotificationRepository(db)
    notification = await repo.get_by_id(update.notification_id, update.user_id)
    if not notification:
        raise HTTPException(status_code=404, detail=ERROR_NOTIFICATION_NOT_FOUND)
    updated = await (
        repo.mark_read(notification) if update.read else repo.mark_unread(notification)
    )
    return NotificationOut.from_model(updated)


async def send_admin_notifications(
    db: AsyncSession,
    sender: User,
    data: NotificationCreate,
) -> list[NotificationOut]:
    """Admin sends a notification to one or more active users."""
    _ensure_sender_is_admin(sender)
    _ensure_recipients_provided(data)

    notification_type = _coerce_notification_type(data.type)
    user_repo = UserRepository(db)
    notification_repo = NotificationRepository(db)

    created_notifications = []
    for recipient_id in data.user_ids:
        recipient = await user_repo.get_by_id(recipient_id)
        if not recipient or not recipient.is_active:
            continue
        created = await notification_repo.create_for_user(
            user_id=recipient_id,
            from_user_id=sender.id,
            task_id=None,
            notification_type=notification_type,
            title=data.title.strip(),
            body=(data.body or "").strip() or None,
        )
        created_notifications.append(created)

    return [
        NotificationOut.from_model(
            await notification_repo.get_by_id(created.id, created.user_id)
        )
        for created in created_notifications
    ]


def _ensure_sender_is_admin(sender: User) -> None:
    if sender.role != ADMIN_ROLE:
        raise HTTPException(status_code=403, detail=ERROR_ONLY_ADMIN_CAN_SEND)


def _ensure_recipients_provided(data: NotificationCreate) -> None:
    if not data.user_ids:
        raise HTTPException(status_code=400, detail=ERROR_AT_LEAST_ONE_RECIPIENT)
