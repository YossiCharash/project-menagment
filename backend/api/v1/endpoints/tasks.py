"""Task API endpoints for Task Management Calendar."""
import logging
from datetime import datetime, timezone, timedelta
import os
import uuid
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from fastapi import APIRouter, Depends, HTTPException, Query, Body, File, UploadFile

from backend.core.deps import DBSessionDep, get_current_user
from backend.iam.decorators import require_permission
from backend.repositories.task_repository import TaskRepository
from backend.repositories.task_label_repository import TaskLabelRepository
from backend.repositories.task_checklist_repository import TaskChecklistRepository
from backend.repositories.user_repository import UserRepository
from backend.schemas.task import (
    TaskCreate,
    TaskOut,
    TaskUpdate,
    RECURRENCE_RULE_VALUES,
    TASK_STATUS_VALUES,
    TaskParticipantOut,
    TaskAttachmentOut,
    TaskMessageOut,
    TaskMessageCreate,
    ArchivedTasksFilter,
    TaskChecklistItemCreate,
    TaskChecklistItemUpdate,
    TaskChecklistItemOut,
    TaskChecklistSummary,
)
from backend.schemas.task_label import TaskLabelOut, TaskLabelCreate, TaskLabelUpdate
from backend.models.task import (
    Task,
    TaskLabel,
    TaskParticipant,
    TaskAttachment,
    TaskMessage,
    TaskChecklistItem,
    TaskStatus,
    EventType,
    ParticipantResponse,
    generate_unique_tag,
)
from backend.services.outlook_sync_service import (
    create_outlook_event,
    update_outlook_event,
    delete_outlook_event,
)
from backend.services.notification_service import (
    create_task_assignment_notifications,
    create_task_reminder,
    create_closure_approval_notification,
)

router = APIRouter()
logger = logging.getLogger(__name__)

EMPLOYEE_COLORS = [
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
    "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
]


def _get_uploads_dir() -> str:
    from backend.core.config import settings
    if os.path.isabs(settings.FILE_UPLOAD_DIR):
        return settings.FILE_UPLOAD_DIR
    current_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
    return os.path.abspath(os.path.join(backend_dir, settings.FILE_UPLOAD_DIR))


def _get_task_attachments_dir() -> str:
    d = os.path.join(_get_uploads_dir(), "task_attachments")
    os.makedirs(d, exist_ok=True)
    return d


# Allowed extensions for task attachments (images + common docs)
ALLOWED_ATTACHMENT_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv", ".zip",
}
MAX_ATTACHMENT_SIZE_MB = 15


def _to_naive_utc(dt: datetime | None) -> datetime | None:
    """Convert timezone-aware datetime to naive UTC for DB comparison."""
    if dt is None:
        return None
    if dt.tzinfo:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _task_to_out(task: Task) -> dict:
    idx = ((task.assigned_to_user_id or 1) - 1) % len(EMPLOYEE_COLORS)
    color = (
        getattr(task.assigned_user, "calendar_color", None)
        if task.assigned_user and getattr(task.assigned_user, "calendar_color", None)
        else EMPLOYEE_COLORS[idx]
    )
    labels = getattr(task, "labels", None) or []
    participants_data = []
    for p in getattr(task, "participants", None) or []:
        usr = getattr(p, "user", None)
        participants_data.append(
            TaskParticipantOut(
                user_id=p.user_id,
                full_name=usr.full_name if usr else "",
                response_status=getattr(p, "response_status",
                                        ParticipantResponse.PENDING) or ParticipantResponse.PENDING,
                avatar_url=getattr(usr, "avatar_url", None) if usr else None,
            )
        )
    recurrence_rule = getattr(task, "recurrence_rule", None) or ""
    recurrence_end_date = getattr(task, "recurrence_end_date", None)
    attachments_raw = getattr(task, "attachments", None) or []
    attachments_data = []
    for att in attachments_raw:
        path = getattr(att, "file_path", None) or ""
        if path.startswith("/"):
            file_url = path
        else:
            file_url = f"/uploads/{path}" if path else ""
        attachments_data.append(
            TaskAttachmentOut(
                id=att.id,
                file_name=getattr(att, "file_name", "") or "",
                file_url=file_url,
            )
        )
    return {
        "id": task.id,
        "title": task.title,
        "start_time": task.start_time,
        "end_time": task.end_time,
        "description": task.description,
        "status": getattr(task, "status", "pending") or "pending",
        "event_type": getattr(task, "event_type", EventType.TASK) or EventType.TASK,
        "assigned_to_user_id": task.assigned_to_user_id,
        "unique_tag": task.unique_tag,
        "recurrence_rule": recurrence_rule if recurrence_rule in RECURRENCE_RULE_VALUES else "",
        "recurrence_end_date": recurrence_end_date,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "assignee_acknowledged_at": getattr(task, "assignee_acknowledged_at", None),
        "assignee_viewed_at": getattr(task, "assignee_viewed_at", None),
        "is_archived": getattr(task, "is_archived", False),
        "archived_at": getattr(task, "archived_at", None),
        "completed_at": getattr(task, "completed_at", None),
        "requires_closure_approval": getattr(task, "requires_closure_approval", False),
        "is_super_task": getattr(task, "is_super_task", False),
        "assigned_user_name": task.assigned_user.full_name if task.assigned_user else None,
        "assigned_user_color": color,
        "assigned_user_avatar": getattr(task.assigned_user, "avatar_url", None) if task.assigned_user else None,
        "labels": [TaskLabelOut.model_validate(l) for l in labels],
        "participants": participants_data,
        "attachments": attachments_data,
    }


@router.get("/", response_model=list[TaskOut])
async def list_tasks(
        db: DBSessionDep,
        user=Depends(get_current_user),
        assigned_to_user_id: int | None = Query(None, description="Filter by assigned user ID"),
        start: datetime | None = Query(None, description="Start of date range (ISO)"),
        end: datetime | None = Query(None, description="End of date range (ISO)"),
        include_archived: bool = Query(False, description="Include archived tasks"),
):
    """Fetch tasks. Admin sees all; Member sees tasks they own or are invited to."""
    repo = TaskRepository(db)
    start_naive = _to_naive_utc(start)
    end_naive = _to_naive_utc(end)
    if user.role != "Admin":
        tasks = await repo.list(for_user_id=user.id, start=start_naive, end=end_naive, include_archived=include_archived)
    else:
        tasks = await repo.list(assigned_to_user_id=assigned_to_user_id, start=start_naive, end=end_naive, include_archived=include_archived)
    return [_task_to_out(t) for t in tasks]


@router.get("/labels", response_model=list[TaskLabelOut])
async def list_task_labels(db: DBSessionDep, user=Depends(get_current_user)):
    """List all task labels (for calendar)."""
    repo = TaskLabelRepository(db)
    labels = await repo.list_all()
    return [TaskLabelOut.model_validate(l) for l in labels]


@router.post("/labels", response_model=TaskLabelOut)
async def create_task_label(
        data: TaskLabelCreate, db: DBSessionDep, user=Depends(require_permission("write", "task", project_id_param=None))
):
    """Create a new task label."""
    color = (data.color or "#3B82F6").strip()
    if color and not color.startswith("#"):
        color = "#" + color
    label = TaskLabel(name=data.name.strip(), color=color or "#3B82F6")
    repo = TaskLabelRepository(db)
    created = await repo.create(label)
    return TaskLabelOut.model_validate(created)


@router.put("/labels/{label_id}", response_model=TaskLabelOut)
async def update_task_label(
        label_id: int,
        data: TaskLabelUpdate,
        db: DBSessionDep,
        user=Depends(require_permission("update", "task", project_id_param=None)),
):
    """Update a task label."""
    repo = TaskLabelRepository(db)
    label = await repo.get_by_id(label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    if data.name is not None:
        label.name = data.name.strip()
    if data.color is not None:
        color = data.color.strip()
        if color and not color.startswith("#"):
            color = "#" + color
        label.color = color or label.color
    updated = await repo.update(label)
    return TaskLabelOut.model_validate(updated)


@router.delete("/labels/{label_id}", status_code=204)
async def delete_task_label(
        label_id: int, db: DBSessionDep, user=Depends(require_permission("delete", "task", project_id_param=None))
):
    """Delete a task label (removes it from all tasks)."""
    repo = TaskLabelRepository(db)
    label = await repo.get_by_id(label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    await repo.delete(label)
    return None


@router.get("/archived", response_model=list[TaskOut])
async def list_archived_tasks(
        db: DBSessionDep,
        user=Depends(get_current_user),
        date_from: datetime | None = Query(None, description="Start of date range (ISO)"),
        date_to: datetime | None = Query(None, description="End of date range (ISO)"),
        preset: str | None = Query(None, description="Preset: last_week, last_month, last_3_months"),
        assigned_to_user_id: int | None = Query(None, description="Filter by assigned user ID (admin only)"),
):
    """List archived tasks with date filters. Admin sees all; Member sees own."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if preset and not date_from:
        if preset == "last_week":
            date_from = now - timedelta(days=7)
        elif preset == "last_month":
            date_from = now - timedelta(days=30)
        elif preset == "last_3_months":
            date_from = now - timedelta(days=90)
    if date_from and not date_to:
        date_to = now
    date_from_naive = _to_naive_utc(date_from)
    date_to_naive = _to_naive_utc(date_to)
    repo = TaskRepository(db)
    if user.role != "Admin":
        tasks = await repo.list_archived(
            date_from=date_from_naive, date_to=date_to_naive, for_user_id=user.id
        )
    else:
        tasks = await repo.list_archived(
            date_from=date_from_naive, date_to=date_to_naive, assigned_to_user_id=assigned_to_user_id
        )
    return [_task_to_out(t) for t in tasks]


@router.get("/super", response_model=list[TaskOut])
async def list_super_tasks(db: DBSessionDep, user=Depends(get_current_user)):
    """Return all active super tasks (not completed, not archived). All authenticated users can see."""
    repo = TaskRepository(db)
    tasks = await repo.list_super_tasks()
    return [_task_to_out(t) for t in tasks]


@router.post("/{task_id}/restore", response_model=TaskOut)
async def restore_task(
        task_id: int,
        db: DBSessionDep,
        user=Depends(require_permission("update", "task", resource_id_param="task_id", project_id_param=None)),
):
    """Restore an archived task back to active. Admin only."""
    if user.role != "Admin":
        raise HTTPException(status_code=403, detail="Only admins can restore archived tasks")
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.is_archived:
        raise HTTPException(status_code=400, detail="Task is not archived")
    task.is_archived = False
    task.archived_at = None
    await repo.update(task)
    updated = await repo.get(task.id)
    return _task_to_out(updated)


def _can_access_task(task: Task, user) -> bool:
    """True if user can view/edit this task (Admin, assignee, or participant)."""
    if user.role == "Admin":
        return True
    if task.assigned_to_user_id == user.id:
        return True
    participants = getattr(task, "participants", None) or []
    return any(getattr(p, "user_id", None) == user.id for p in participants)


@router.get("/{task_id}/messages", response_model=list[TaskMessageOut])
async def list_task_messages(
        task_id: int,
        db: DBSessionDep,
        user=Depends(get_current_user),
):
    """List chat messages for a task. Only assignee, participants, or Admin can see."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _can_access_task(task, user):
        raise HTTPException(status_code=403, detail="Access denied")
    result = await db.execute(
        select(TaskMessage)
        .options(selectinload(TaskMessage.user))
        .where(TaskMessage.task_id == task_id)
        .order_by(TaskMessage.created_at)
    )
    messages_sorted = list(result.scalars().unique().all())
    out = []
    for m in messages_sorted:
        author = getattr(m, "user", None)
        out.append(
            TaskMessageOut(
                id=m.id,
                task_id=m.task_id,
                user_id=m.user_id,
                full_name=author.full_name if author else "",
                avatar_url=getattr(author, "avatar_url", None) if author else None,
                message=m.message,
                created_at=m.created_at,
            )
        )
    return out


@router.post("/{task_id}/messages", response_model=TaskMessageOut)
async def create_task_message(
        task_id: int,
        data: TaskMessageCreate,
        db: DBSessionDep,
        user=Depends(get_current_user),
):
    """Add a chat message to a task. Only assignee, participants, or Admin can post."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _can_access_task(task, user):
        raise HTTPException(status_code=403, detail="Access denied")
    msg_text = (data.message or "").strip()
    if not msg_text:
        raise HTTPException(status_code=400, detail="הודעה לא יכולה להיות ריקה")
    msg = TaskMessage(task_id=task_id, user_id=user.id, message=msg_text)
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    author = getattr(msg, "user", None) or user
    return TaskMessageOut(
        id=msg.id,
        task_id=msg.task_id,
        user_id=msg.user_id,
        full_name=getattr(author, "full_name", "") or user.full_name,
        avatar_url=getattr(author, "avatar_url", None),
        message=msg.message,
        created_at=msg.created_at,
    )


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
        task_id: int,
        db: DBSessionDep,
        user=Depends(get_current_user),
):
    """Get a single task by ID. Member can only get own or invited tasks."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _can_access_task(task, user):
        raise HTTPException(status_code=403, detail="Access denied")
    # Auto-mark as viewed when assignee opens the task for the first time
    if task.assigned_to_user_id == user.id and task.assignee_viewed_at is None:
        task.assignee_viewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.flush()
    out = _task_to_out(task)
    checklist_repo = TaskChecklistRepository(db)
    summary = await checklist_repo.get_summary(task_id)
    total = summary["total"]
    completed = summary["completed"]
    pct = round(completed / total * 100, 1) if total else 0.0
    out["checklist_summary"] = TaskChecklistSummary(total=total, completed=completed, progress_pct=pct)
    return out


@router.post("/", response_model=TaskOut)
async def create_task(
        data: TaskCreate, db: DBSessionDep, user=Depends(require_permission("write", "task", project_id_param=None))
):
    """Create a new task and generate the unique tag."""
    if not data.start_time and not data.end_time:
        pass  # no-date task is valid
    elif not data.start_time or not data.end_time:
        raise HTTPException(status_code=400, detail="Both start_time and end_time required for dated tasks")
    user_repo = UserRepository(db)
    usr = await user_repo.get_by_id(data.assigned_to_user_id)
    if not usr or not usr.is_active:
        raise HTTPException(status_code=404, detail="User not found")
    start_val = _to_naive_utc(data.start_time) if data.start_time else data.start_time
    end_val = _to_naive_utc(data.end_time) if data.end_time else data.end_time
    event_type = (data.event_type if data.event_type in (EventType.MEETING, EventType.TASK) else EventType.TASK)
    recurrence_rule = (data.recurrence_rule or "").strip().lower() if getattr(data, "recurrence_rule", None) else ""
    if recurrence_rule and recurrence_rule not in ("weekly", "monthly"):
        recurrence_rule = ""
    recurrence_end_date = getattr(data, "recurrence_end_date", None)
    initial_status = data.status if data.status in TASK_STATUS_VALUES else TaskStatus.PENDING
    task = Task(
        title=data.title,
        start_time=start_val,
        end_time=end_val,
        description=data.description,
        status=initial_status,
        event_type=event_type,
        assigned_to_user_id=data.assigned_to_user_id,
        recurrence_rule=recurrence_rule,
        recurrence_end_date=recurrence_end_date,
        requires_closure_approval=getattr(data, "requires_closure_approval", False),
        is_super_task=getattr(data, "is_super_task", False),
    )
    if initial_status == TaskStatus.COMPLETED:
        task.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    task.unique_tag = generate_unique_tag()
    label_ids = getattr(data, "label_ids", None) or []
    if label_ids:
        label_repo = TaskLabelRepository(db)
        task.labels = await label_repo.get_by_ids(label_ids)
    repo = TaskRepository(db)
    created = await repo.create(task)
    participant_ids = getattr(data, "participant_ids", None) or []
    for uid in participant_ids:
        if uid != created.assigned_to_user_id:
            db.add(TaskParticipant(task_id=created.id, user_id=uid, response_status=ParticipantResponse.PENDING))
    await db.flush()
    try:
        outlook_id = await create_outlook_event(db, created)
        if outlook_id:
            created.outlook_event_id = outlook_id
            await repo.update(created)
    except Exception:
        logger.warning(f"Failed to create Outlook event for task {created.id}", exc_info=True)
    created = await repo.get(created.id)
    try:
        await create_task_assignment_notifications(db, created, user.id)
    except Exception:
        logger.warning(f"Failed to create notifications for task {created.id}", exc_info=True)
    return _task_to_out(created)


@router.put("/{task_id}", response_model=TaskOut)
async def update_task(
        task_id: int,
        data: TaskUpdate,
        db: DBSessionDep,
        user=Depends(require_permission("update", "task", resource_id_param="task_id", project_id_param=None)),
):
    """Update task time/date (used by drag & drop), status, or other fields. Member can only update own tasks."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if user.role != "Admin" and task.assigned_to_user_id != user.id:
        raise HTTPException(status_code=403,
                            detail="Access denied. Only the organizer can edit. Use respond to accept/decline.")
    update_data = data.model_dump(exclude_unset=True)
    # Only admins can toggle super task flag
    if "is_super_task" in update_data and user.role != "Admin":
        update_data.pop("is_super_task", None)
    if "status" in update_data and update_data["status"] not in TASK_STATUS_VALUES:
        update_data.pop("status", None)
    # Intercept: non-admin trying to complete a task that requires closure approval
    if (
        update_data.get("status") == TaskStatus.COMPLETED
        and getattr(task, "requires_closure_approval", False)
        and user.role != "Admin"
    ):
        update_data["status"] = TaskStatus.PENDING_CLOSURE
        try:
            await create_closure_approval_notification(db, task, user.id)
        except Exception:
            logger.warning(f"Failed to create closure approval notification for task {task.id}", exc_info=True)
    if "event_type" in update_data and update_data["event_type"] not in (EventType.MEETING, EventType.TASK):
        update_data.pop("event_type", None)
    if "recurrence_rule" in update_data:
        r = (update_data["recurrence_rule"] or "").strip().lower()
        update_data["recurrence_rule"] = r if r in ("", "weekly", "monthly") else (
                    getattr(task, "recurrence_rule", None) or "")
    if "assigned_to_user_id" in update_data and update_data["assigned_to_user_id"]:
        if user.role != "Admin":
            update_data.pop("assigned_to_user_id", None)  # Only Admin can reassign
        else:
            user_repo = UserRepository(db)
            usr = await user_repo.get_by_id(update_data["assigned_to_user_id"])
            if not usr or not usr.is_active:
                raise HTTPException(status_code=404, detail="User not found")
    if "status" in update_data and update_data["status"] == TaskStatus.COMPLETED and task.completed_at is None:
        task.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    label_ids = update_data.pop("label_ids", None)
    participant_ids = update_data.pop("participant_ids", None)
    for k, v in update_data.items():
        if k in ("start_time", "end_time") and v is not None:
            v = _to_naive_utc(v) or v
        setattr(task, k, v)
    if label_ids is not None:
        label_repo = TaskLabelRepository(db)
        task.labels = await label_repo.get_by_ids(label_ids)
    if participant_ids is not None:
        new_set = set(participant_ids) - {task.assigned_to_user_id}
        existing_by_user = {p.user_id: p for p in (getattr(task, "participants", None) or [])}
        for p in list(task.participants):
            if p.user_id not in new_set:
                task.participants.remove(p)
        for uid in new_set:
            if uid not in existing_by_user:
                task.participants.append(
                    TaskParticipant(task_id=task.id, user_id=uid, response_status=ParticipantResponse.PENDING)
                )
    # Persist to DB (e.g. drag & drop new date/time)
    await repo.update(task)
    try:
        if task.outlook_event_id:
            await update_outlook_event(db, task)
        else:
            outlook_id = await create_outlook_event(db, task)
            if outlook_id:
                task.outlook_event_id = outlook_id
                await repo.update(task)
    except Exception:
        logger.warning(f"Failed to sync Outlook event for task {task.id}", exc_info=True)
    # Re-fetch with eager loading so _task_to_out can access all relationships
    # (refresh() doesn't reload selectinload relations → MissingGreenlet in async)
    updated = await repo.get(task.id)
    return _task_to_out(updated)


@router.post("/{task_id}/acknowledge", response_model=TaskOut)
async def acknowledge_task(
        task_id: int,
        db: DBSessionDep,
        user=Depends(get_current_user),
):
    """לקוח/משתמש מוקצה מאשר קבלת המשימה. רק המשתמש המוקצה יכול לאשר."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.assigned_to_user_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="רק המשתמש המוקצה למשימה יכול לאשר קבלתה",
        )
    task.assignee_acknowledged_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()
    updated = await repo.get(task_id)
    return _task_to_out(updated)


@router.post("/{task_id}/remind")
async def remind_task(
        task_id: int,
        db: DBSessionDep,
        user=Depends(get_current_user),
):
    """Send a reminder for this task to the assignee. Notification appears in הודעות. Only for users who can see the task (Admin, assignee, or participant)."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if user.role != "Admin":
        if task.assigned_to_user_id != user.id:
            participants = getattr(task, "participants", None) or []
            if not any(getattr(p, "user_id", None) == user.id for p in participants):
                raise HTTPException(status_code=403, detail="Access denied")
    if not task.assigned_to_user_id:
        raise HTTPException(status_code=400, detail="למשימה אין משתמש מוקצה")
    await create_task_reminder(db, task, user.id)
    return {"message": "תזכורת נשלחה לעובד בהודעות"}


@router.post("/{task_id}/respond", response_model=TaskOut)
async def respond_to_invitation(
        task_id: int,
        db: DBSessionDep,
        response: str = Body(..., embed=True),
        user=Depends(get_current_user),
):
    """Accept or decline an event invitation (like Outlook). Only invitees can respond."""
    if response not in ("accepted", "declined"):
        raise HTTPException(status_code=400, detail="response must be 'accepted' or 'declined'")
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    participants = getattr(task, "participants", None) or []
    my_part = next((p for p in participants if getattr(p, "user_id", None) == user.id), None)
    if not my_part:
        raise HTTPException(status_code=403, detail="You are not invited to this event.")
    my_part.response_status = response
    await db.flush()
    await db.refresh(my_part)
    updated = await repo.get(task_id)
    return _task_to_out(updated)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
        task_id: int,
        db: DBSessionDep,
        user=Depends(require_permission("delete", "task", resource_id_param="task_id", project_id_param=None)),
):
    """Delete a task or meeting. Member can only delete own tasks."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if user.role != "Admin" and task.assigned_to_user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied. You can only delete your own tasks.")
    outlook_id = task.outlook_event_id
    user_id = task.assigned_to_user_id
    await repo.delete(task)
    try:
        if outlook_id:
            await delete_outlook_event(db, user_id, outlook_id)
    except Exception:
        logger.warning(f"Failed to delete Outlook event {outlook_id} for task {task_id}", exc_info=True)
    return None


@router.post("/{task_id}/attachments", response_model=TaskAttachmentOut)
async def upload_task_attachment(
        task_id: int,
        db: DBSessionDep,
        user=Depends(require_permission("update", "task", resource_id_param="task_id", project_id_param=None)),
        file: UploadFile = File(...),
):
    """Upload a file or image attachment to a task. Only task owner or Admin can add attachments."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if user.role != "Admin" and task.assigned_to_user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    ext = (os.path.splitext(file.filename or "")[1] or "").lower()
    if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"סוג קובץ לא נתמך. מותרים: {', '.join(sorted(ALLOWED_ATTACHMENT_EXTENSIONS))}",
        )
    content = await file.read()
    if len(content) > MAX_ATTACHMENT_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"גודל קובץ מקסימלי: {MAX_ATTACHMENT_SIZE_MB} MB",
        )
    attach_dir = _get_task_attachments_dir()
    safe_name = (file.filename or "file").strip() or "file"
    for c in ['/', '\\', '\0', '..']:
        safe_name = safe_name.replace(c, "_")
    unique = uuid.uuid4().hex[:12]
    stored_name = f"{unique}_{safe_name}"
    file_path = os.path.join(attach_dir, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)
    relative_path = f"task_attachments/{stored_name}"
    attachment = TaskAttachment(
        task_id=task_id,
        file_path=relative_path,
        file_name=file.filename or stored_name,
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)
    return TaskAttachmentOut(
        id=attachment.id,
        file_name=attachment.file_name,
        file_url=f"/uploads/{relative_path}",
    )


def _checklist_item_to_out(item: TaskChecklistItem) -> TaskChecklistItemOut:
    """Build a TaskChecklistItemOut from a TaskChecklistItem with loaded user relationships."""
    assigned_user = getattr(item, "assigned_user", None)
    handled_by_user = getattr(item, "handled_by_user", None)

    # Compute a color for the assigned user (same palette logic as _task_to_out)
    assigned_user_color = None
    if assigned_user:
        idx = ((assigned_user.id or 1) - 1) % len(EMPLOYEE_COLORS)
        assigned_user_color = getattr(assigned_user, "calendar_color", None) or EMPLOYEE_COLORS[idx]

    handled_by_user_color = None
    if handled_by_user:
        idx = ((handled_by_user.id or 1) - 1) % len(EMPLOYEE_COLORS)
        handled_by_user_color = getattr(handled_by_user, "calendar_color", None) or EMPLOYEE_COLORS[idx]

    return TaskChecklistItemOut(
        id=item.id,
        task_id=item.task_id,
        text=item.text,
        is_completed=item.is_completed,
        sort_order=item.sort_order,
        created_at=item.created_at,
        assigned_to_user_id=item.assigned_to_user_id,
        assigned_user_name=assigned_user.full_name if assigned_user else None,
        assigned_user_avatar=getattr(assigned_user, "avatar_url", None) if assigned_user else None,
        assigned_user_color=assigned_user_color,
        handled_by_user_id=item.handled_by_user_id,
        handled_by_user_name=handled_by_user.full_name if handled_by_user else None,
        handled_by_user_avatar=getattr(handled_by_user, "avatar_url", None) if handled_by_user else None,
        handled_by_user_color=handled_by_user_color,
        handled_at=item.handled_at,
    )


@router.get("/{task_id}/checklist", response_model=list[TaskChecklistItemOut])
async def list_checklist_items(
        task_id: int,
        db: DBSessionDep,
        user=Depends(get_current_user),
):
    """List checklist items for a task, ordered by sort_order."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _can_access_task(task, user):
        raise HTTPException(status_code=403, detail="Access denied")
    checklist_repo = TaskChecklistRepository(db)
    items = await checklist_repo.list_for_task(task_id)
    return [_checklist_item_to_out(item) for item in items]


@router.post("/{task_id}/checklist", response_model=TaskChecklistItemOut, status_code=201)
async def create_checklist_item(
        task_id: int,
        body: TaskChecklistItemCreate,
        db: DBSessionDep,
        user=Depends(get_current_user),
):
    """Add a checklist item to a task."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _can_access_task(task, user):
        raise HTTPException(status_code=403, detail="Access denied")
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="הפריט לא יכול להיות ריק")
    checklist_repo = TaskChecklistRepository(db)
    sort_order = await checklist_repo.get_next_sort_order(task_id)
    item = TaskChecklistItem(task_id=task_id, text=text, sort_order=sort_order)
    created = await checklist_repo.create(item)
    return _checklist_item_to_out(created)


@router.patch("/{task_id}/checklist/{item_id}", response_model=TaskChecklistItemOut)
async def update_checklist_item(
        task_id: int,
        item_id: int,
        body: TaskChecklistItemUpdate,
        db: DBSessionDep,
        user=Depends(get_current_user),
):
    """Toggle is_completed, update text, or assign a user to a checklist item."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _can_access_task(task, user):
        raise HTTPException(status_code=403, detail="Access denied")
    checklist_repo = TaskChecklistRepository(db)
    item = await checklist_repo.get_by_id(item_id)
    if not item or item.task_id != task_id:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    if body.is_completed is not None:
        item.is_completed = body.is_completed
        if body.is_completed:
            item.handled_by_user_id = user.id
            item.handled_at = datetime.now(timezone.utc).replace(tzinfo=None)
        else:
            item.handled_by_user_id = None
            item.handled_at = None
    if body.text is not None:
        text = body.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="הפריט לא יכול להיות ריק")
        item.text = text
    if body.clear_assignment:
        item.assigned_to_user_id = None
    elif body.assigned_to_user_id is not None:
        user_repo = UserRepository(db)
        target_user = await user_repo.get_by_id(body.assigned_to_user_id)
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        item.assigned_to_user_id = body.assigned_to_user_id
    updated = await checklist_repo.update(item)
    # Re-fetch to ensure relationships are loaded after update
    refreshed = await checklist_repo.get_by_id(updated.id)
    return _checklist_item_to_out(refreshed)


@router.delete("/{task_id}/checklist/{item_id}", status_code=204)
async def delete_checklist_item(
        task_id: int,
        item_id: int,
        db: DBSessionDep,
        user=Depends(get_current_user),
):
    """Delete a checklist item from a task."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _can_access_task(task, user):
        raise HTTPException(status_code=403, detail="Access denied")
    checklist_repo = TaskChecklistRepository(db)
    item = await checklist_repo.get_by_id(item_id)
    if not item or item.task_id != task_id:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    await checklist_repo.delete(item)
    return None


@router.delete("/{task_id}/attachments/{attachment_id}", status_code=204)
async def delete_task_attachment(
        task_id: int,
        attachment_id: int,
        db: DBSessionDep,
        user=Depends(require_permission("update", "task", resource_id_param="task_id", project_id_param=None)),
):
    """Remove an attachment from a task. Only task owner or Admin."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if user.role != "Admin" and task.assigned_to_user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    att = next((a for a in (task.attachments or []) if a.id == attachment_id), None)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    full_path = os.path.join(_get_uploads_dir(), att.file_path)
    if os.path.isfile(full_path):
        try:
            os.remove(full_path)
        except OSError:
            pass
    await db.delete(att)
    await db.flush()
    return None
