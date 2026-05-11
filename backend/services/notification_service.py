"""Service for creating user notifications (e.g. on task assignment)."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.user import User
from backend.models.user_notification import UserNotification, NotificationType
from backend.models.task import Task
from backend.repositories.notification_repository import NotificationRepository
from backend.repositories.user_repository import UserRepository
from backend.schemas.notification import NotificationCreate, NOTIFICATION_TYPE_VALUES


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


def _notification_to_out(n: UserNotification) -> dict:
    """Serialize UserNotification to API output dict (with optional joined relations)."""
    from_user = getattr(n, "from_user", None)
    task = getattr(n, "task", None)
    return {
        "id": n.id,
        "user_id": n.user_id,
        "from_user_id": n.from_user_id,
        "task_id": n.task_id,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "read_at": n.read_at,
        "created_at": n.created_at,
        "from_user_name": from_user.full_name if from_user else None,
        "task_title": task.title if task else None,
    }


class NotificationApiService:
    """Service for the user-facing notifications HTTP API."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = NotificationRepository(db)

    async def list_for_user(
        self,
        user_id: int,
        *,
        unread_only: bool,
        type_filter: str | None,
        limit: int,
        offset: int,
    ) -> list[dict]:
        if type_filter and type_filter not in NOTIFICATION_TYPE_VALUES:
            type_filter = None
        items = await self.repo.list_for_user(
            user_id, unread_only=unread_only, type_filter=type_filter, limit=limit, offset=offset
        )
        return [_notification_to_out(n) for n in items]

    async def unread_count(self, user_id: int) -> dict:
        return {"count": await self.repo.count_unread(user_id)}

    async def get_one(self, notification_id: int, user_id: int) -> dict:
        n = await self.repo.get_by_id(notification_id, user_id)
        if not n:
            raise HTTPException(status_code=404, detail="הודעה לא נמצאה")
        return _notification_to_out(n)

    async def set_read_state(self, notification_id: int, user_id: int, read: bool) -> dict:
        n = await self.repo.get_by_id(notification_id, user_id)
        if not n:
            raise HTTPException(status_code=404, detail="הודעה לא נמצאה")
        n = await (self.repo.mark_read(n) if read else self.repo.mark_unread(n))
        return _notification_to_out(n)

    async def send_to_users(self, sender: User, data: NotificationCreate) -> list[dict]:
        if sender.role != "Admin":
            raise HTTPException(status_code=403, detail="רק מנהל יכול לשלוח הודעות למשתמשים")
        if not data.user_ids:
            raise HTTPException(status_code=400, detail="יש לבחור לפחות משתמש אחד")
        ntype = data.type if data.type in NOTIFICATION_TYPE_VALUES else NotificationType.GENERAL
        user_repo = UserRepository(self.db)
        created_list: list[UserNotification] = []
        for uid in data.user_ids:
            u = await user_repo.get_by_id(uid)
            if not u or not u.is_active:
                continue
            n = UserNotification(
                user_id=uid,
                from_user_id=sender.id,
                task_id=None,
                type=ntype,
                title=data.title.strip(),
                body=(data.body or "").strip() or None,
            )
            created_list.append(await self.repo.create(n))
        out: list[dict] = []
        for n in created_list:
            reloaded = await self.repo.get_by_id(n.id, n.user_id)
            out.append(_notification_to_out(reloaded))
        return out
