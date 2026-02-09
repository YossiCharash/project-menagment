"""Service for creating user notifications (e.g. on task assignment)."""
from sqlalchemy.ext.asyncio import AsyncSession

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
