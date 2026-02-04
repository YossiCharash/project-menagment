"""Task API endpoints for Task Management Calendar."""
from datetime import datetime, timezone
import os
from fastapi import APIRouter, Depends, HTTPException, Query

from backend.core.deps import DBSessionDep, get_current_user
from backend.repositories.task_repository import TaskRepository
from backend.repositories.user_repository import UserRepository
from backend.schemas.task import TaskCreate, TaskOut, TaskUpdate
from backend.models.task import Task, TaskStatus, EventType, generate_unique_tag

router = APIRouter()

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


def _to_naive_utc(dt: datetime | None) -> datetime | None:
    """Convert timezone-aware datetime to naive UTC for DB comparison."""
    if dt is None:
        return None
    if dt.tzinfo:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _task_to_out(task: Task) -> dict:
    idx = (task.assigned_to_user_id - 1) % len(EMPLOYEE_COLORS)
    color = EMPLOYEE_COLORS[idx]
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
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "assigned_user_name": task.assigned_user.full_name if task.assigned_user else None,
        "assigned_user_color": color,
    }


@router.get("/", response_model=list[TaskOut])
async def list_tasks(
    db: DBSessionDep,
    user=Depends(get_current_user),
    assigned_to_user_id: int | None = Query(None, description="Filter by assigned user ID"),
    start: datetime | None = Query(None, description="Start of date range (ISO)"),
    end: datetime | None = Query(None, description="End of date range (ISO)"),
):
    """Fetch tasks. Admin sees all; Member sees only tasks assigned to themselves."""
    repo = TaskRepository(db)
    start_naive = _to_naive_utc(start)
    end_naive = _to_naive_utc(end)
    # Only Admin can see all; Member sees only their own tasks
    if user.role != "Admin":
        assigned_to_user_id = user.id
    tasks = await repo.list(assigned_to_user_id=assigned_to_user_id, start=start_naive, end=end_naive)
    return [_task_to_out(t) for t in tasks]


@router.post("/", response_model=TaskOut)
async def create_task(
    data: TaskCreate, db: DBSessionDep, user=Depends(get_current_user)
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
    task = Task(
        title=data.title,
        start_time=start_val,
        end_time=end_val,
        description=data.description,
        status=(data.status if data.status in ("pending", "in_progress", "completed") else TaskStatus.PENDING),
        event_type=event_type,
        assigned_to_user_id=data.assigned_to_user_id,
    )
    task.unique_tag = generate_unique_tag()
    repo = TaskRepository(db)
    created = await repo.create(task)
    return _task_to_out(created)


@router.put("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int,
    data: TaskUpdate,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """Update task time/date (used by drag & drop), status, or other fields. Member can only update own tasks."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if user.role != "Admin" and task.assigned_to_user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied. You can only update your own tasks.")
    update_data = data.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] not in ("pending", "in_progress", "completed"):
        update_data.pop("status", None)
    if "event_type" in update_data and update_data["event_type"] not in (EventType.MEETING, EventType.TASK):
        update_data.pop("event_type", None)
    if "assigned_to_user_id" in update_data and update_data["assigned_to_user_id"]:
        if user.role != "Admin":
            update_data.pop("assigned_to_user_id", None)  # Only Admin can reassign
        else:
            user_repo = UserRepository(db)
            usr = await user_repo.get_by_id(update_data["assigned_to_user_id"])
            if not usr or not usr.is_active:
                raise HTTPException(status_code=404, detail="User not found")
    for k, v in update_data.items():
        if k in ("start_time", "end_time") and v is not None:
            v = _to_naive_utc(v) or v
        setattr(task, k, v)
    updated = await repo.update(task)
    return _task_to_out(updated)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """Delete a task or meeting. Member can only delete own tasks."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if user.role != "Admin" and task.assigned_to_user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied. You can only delete your own tasks.")
    await repo.delete(task)
    return None
