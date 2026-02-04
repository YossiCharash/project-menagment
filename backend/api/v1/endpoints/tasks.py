"""Task API endpoints for Task Management Calendar."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File

from backend.core.deps import DBSessionDep, get_current_user
from backend.repositories.task_repository import TaskRepository
from backend.repositories.employee_repository import EmployeeRepository
from backend.schemas.task import TaskCreate, TaskOut, TaskUpdate
from backend.models.task import Task, TaskAttachment, generate_unique_tag

router = APIRouter()

# Default colors for employees when none specified (for calendar display)
EMPLOYEE_COLORS = [
    "#3B82F6",  # blue
    "#10B981",  # emerald
    "#F59E0B",  # amber
    "#EF4444",  # red
    "#8B5CF6",  # violet
    "#EC4899",  # pink
    "#06B6D4",  # cyan
    "#84CC16",  # lime
]


def _task_to_out(task: Task) -> dict:
    """Convert Task model to TaskOut-compatible dict."""
    color = task.employee.color if task.employee else None
    if not color and task.employee_id:
        idx = (task.employee_id - 1) % len(EMPLOYEE_COLORS)
        color = EMPLOYEE_COLORS[idx]
    return {
        "id": task.id,
        "title": task.title,
        "start_time": task.start_time,
        "end_time": task.end_time,
        "description": task.description,
        "employee_id": task.employee_id,
        "unique_tag": task.unique_tag,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "employee_name": task.employee.name if task.employee else None,
        "employee_color": color,
    }


@router.get("/", response_model=list[TaskOut])
async def list_tasks(
    db: DBSessionDep,
    user=Depends(get_current_user),
    employee_id: int | None = Query(None, description="Filter by employee ID"),
    start: datetime | None = Query(None, description="Start of date range (ISO)"),
    end: datetime | None = Query(None, description="End of date range (ISO)"),
):
    """Fetch tasks with optional employee filtering."""
    repo = TaskRepository(db)
    tasks = await repo.list(employee_id=employee_id, start=start, end=end)
    return [_task_to_out(t) for t in tasks]


@router.post("/", response_model=TaskOut)
async def create_task(
    data: TaskCreate, db: DBSessionDep, user=Depends(get_current_user)
):
    """Create a new task and generate the unique tag."""
    emp_repo = EmployeeRepository(db)
    emp = await emp_repo.get(data.employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    task = Task(
        title=data.title,
        start_time=data.start_time,
        end_time=data.end_time,
        description=data.description,
        employee_id=data.employee_id,
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
    """Update task time/date (used by drag & drop) or other fields."""
    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    update_data = data.model_dump(exclude_unset=True)
    if "employee_id" in update_data and update_data["employee_id"]:
        emp_repo = EmployeeRepository(db)
        emp = await emp_repo.get(update_data["employee_id"])
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
    for k, v in update_data.items():
        setattr(task, k, v)
    updated = await repo.update(task)
    return _task_to_out(updated)


def _get_uploads_dir() -> str:
    """Get absolute path to uploads directory."""
    import os
    from backend.core.config import settings
    if os.path.isabs(settings.FILE_UPLOAD_DIR):
        return settings.FILE_UPLOAD_DIR
    current_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
    return os.path.abspath(os.path.join(backend_dir, settings.FILE_UPLOAD_DIR))


@router.post("/{task_id}/attach")
async def attach_file_to_task(
    task_id: int,
    db: DBSessionDep,
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    """Attach a file to a task. Generates a unique tag for the attachment."""
    import os

    repo = TaskRepository(db)
    task = await repo.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    uploads_dir = _get_uploads_dir()
    task_upload_dir = os.path.join(uploads_dir, "tasks", str(task_id))
    os.makedirs(task_upload_dir, exist_ok=True)

    filename = file.filename or "attachment"
    # Sanitize filename
    safe_name = "".join(c for c in filename if c.isalnum() or c in ".-_") or "file"
    file_path = os.path.join(task_upload_dir, safe_name)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    # Relative path for storage
    rel_path = f"tasks/{task_id}/{safe_name}"

    attachment = TaskAttachment(
        task_id=task_id,
        file_path=rel_path,
        file_name=filename,
    )
    attachment.unique_tag = generate_unique_tag()
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)

    return {
        "id": attachment.id,
        "task_id": task_id,
        "file_name": filename,
        "unique_tag": attachment.unique_tag,
    }
