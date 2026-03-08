"""Service for creating user notifications (e.g. on task assignment)."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.user import User
from backend.models.user_notification import UserNotification, NotificationType
from backend.models.task import Task
from backend.repositories.notification_repository import NotificationRepository


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
    title = f"משימה חדשה: {task.title}"
    body = task.description or None
    if task.start_time:
        from datetime import datetime
        body = (body or "") + f"\nתאריך: {task.start_time.strftime('%d/%m/%Y %H:%M')}" if body else f"תאריך: {task.start_time.strftime('%d/%m/%Y %H:%M')}"

    notified = set()
    if for_new_assignee and task.assigned_to_user_id and task.assigned_to_user_id != from_user_id:
        notified.add(task.assigned_to_user_id)
        n = UserNotification(
            user_id=task.assigned_to_user_id,
            from_user_id=from_user_id,
            task_id=task.id,
            type=NotificationType.TASK_ASSIGNMENT,
            title=title,
            body=body,
        )
        await repo.create(n)
    if for_new_participants:
        participants = getattr(task, "participants", None) or []
        for p in participants:
            uid = getattr(p, "user_id", None)
            if uid and uid != from_user_id and uid not in notified:
                notified.add(uid)
                n = UserNotification(
                    user_id=uid,
                    from_user_id=from_user_id,
                    task_id=task.id,
                    type=NotificationType.TASK_ASSIGNMENT,
                    title=f"הזמנה למשימה: {task.title}",
                    body=body,
                )
                await repo.create(n)
    await db.flush()


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
    title = f"תזכורת: {task.title}"
    body = task.description or None
    if task.start_time:
        body = (body or "") + f"\nתאריך: {task.start_time.strftime('%d/%m/%Y %H:%M')}" if body else f"תאריך: {task.start_time.strftime('%d/%m/%Y %H:%M')}"

    n = UserNotification(
        user_id=task.assigned_to_user_id,
        from_user_id=from_user_id,
        task_id=task.id,
        type=NotificationType.TASK_REMINDER,
        title=title,
        body=body,
    )
    await repo.create(n)
    await db.flush()


async def create_closure_approval_notification(
    db: AsyncSession,
    task: Task,
    requesting_user_id: int,
) -> None:
    """
    Notify all active admin users that a non-admin requested closure of a task.
    Called when a non-admin tries to complete a task with requires_closure_approval=True.
    """
    result = await db.execute(
        select(User).where(User.role == "Admin", User.is_active == True)
    )
    admins = list(result.scalars().all())
    if not admins:
        return

    requester = await db.get(User, requesting_user_id)
    requester_name = requester.full_name if requester else f"משתמש #{requesting_user_id}"

    repo = NotificationRepository(db)
    for admin in admins:
        n = UserNotification(
            user_id=admin.id,
            from_user_id=requesting_user_id,
            task_id=task.id,
            type=NotificationType.TASK_ASSIGNMENT,
            title=f"בקשת סגירת משימה: {task.title}",
            body=f"העובד {requester_name} ביקש לסגור את המשימה. ממתין לאישורך.",
        )
        await repo.create(n)
    await db.flush()
