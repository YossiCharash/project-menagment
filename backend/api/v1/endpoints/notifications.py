"""API for user notifications (הודעות, הוראות, תזכורות)."""
from fastapi import APIRouter, Depends, HTTPException, Query

from backend.core.deps import DBSessionDep, get_current_user
from backend.repositories.notification_repository import NotificationRepository
from backend.repositories.user_repository import UserRepository
from backend.schemas.notification import (
    NotificationOut,
    NotificationCreate,
    NOTIFICATION_TYPE_VALUES,
)
from backend.models.user_notification import UserNotification, NotificationType

router = APIRouter()


def _to_out(n: UserNotification) -> dict:
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


@router.get("/", response_model=list[NotificationOut])
async def list_my_notifications(
    db: DBSessionDep,
    user=Depends(get_current_user),
    unread_only: bool = Query(False, description="רק הודעות שלא נקראו"),
    type_filter: str | None = Query(None, description="סינון לפי סוג"),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """רשימת ההודעות של המשתמש המחובר."""
    if type_filter and type_filter not in NOTIFICATION_TYPE_VALUES:
        type_filter = None
    repo = NotificationRepository(db)
    items = await repo.list_for_user(
        user.id, unread_only=unread_only, type_filter=type_filter, limit=limit, offset=offset
    )
    return [_to_out(n) for n in items]


@router.get("/unread-count")
async def get_unread_count(db: DBSessionDep, user=Depends(get_current_user)):
    """מספר ההודעות שלא נקראו (להצגת badge)."""
    repo = NotificationRepository(db)
    return {"count": await repo.count_unread(user.id)}


@router.get("/{notification_id}", response_model=NotificationOut)
async def get_notification(
    notification_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """פרטי הודעה אחת (רק של המשתמש המחובר)."""
    repo = NotificationRepository(db)
    n = await repo.get_by_id(notification_id, user.id)
    if not n:
        raise HTTPException(status_code=404, detail="הודעה לא נמצאה")
    return _to_out(n)


@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
    read: bool = True,
):
    """סמן הודעה כנקראה או כלא נקראה."""
    repo = NotificationRepository(db)
    n = await repo.get_by_id(notification_id, user.id)
    if not n:
        raise HTTPException(status_code=404, detail="הודעה לא נמצאה")
    if read:
        n = await repo.mark_read(n)
    else:
        n = await repo.mark_unread(n)
    return _to_out(n)


@router.post("/send", response_model=list[NotificationOut])
async def send_notifications(
    data: NotificationCreate,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """שליחת הודעה למשתמשים (מנהל בלבד)."""
    if user.role != "Admin":
        raise HTTPException(status_code=403, detail="רק מנהל יכול לשלוח הודעות למשתמשים")
    if not data.user_ids:
        raise HTTPException(status_code=400, detail="יש לבחור לפחות משתמש אחד")
    ntype = data.type if data.type in NOTIFICATION_TYPE_VALUES else NotificationType.GENERAL
    user_repo = UserRepository(db)
    repo = NotificationRepository(db)
    created_list = []
    for uid in data.user_ids:
        u = await user_repo.get_by_id(uid)
        if not u or not u.is_active:
            continue
        n = UserNotification(
            user_id=uid,
            from_user_id=user.id,
            task_id=None,
            type=ntype,
            title=data.title.strip(),
            body=(data.body or "").strip() or None,
        )
        n = await repo.create(n)
        created_list.append(n)
    # Reload with relations for output
    out = []
    for n in created_list:
        nn = await repo.get_by_id(n.id, n.user_id)
        out.append(_to_out(nn))
    return out
