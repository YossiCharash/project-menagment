"""API for user notifications (הודעות, הוראות, תזכורות)."""
from fastapi import APIRouter, Depends, Query

from backend.core.deps import DBSessionDep, get_current_user
from backend.schemas.notification import NotificationOut, NotificationCreate
from backend.services.notification_service import NotificationApiService

router = APIRouter()


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
    return await NotificationApiService(db).list_for_user(
        user.id, unread_only=unread_only, type_filter=type_filter, limit=limit, offset=offset
    )


@router.get("/unread-count")
async def get_unread_count(db: DBSessionDep, user=Depends(get_current_user)):
    """מספר ההודעות שלא נקראו (להצגת badge)."""
    return await NotificationApiService(db).unread_count(user.id)


@router.get("/{notification_id}", response_model=NotificationOut)
async def get_notification(
    notification_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """פרטי הודעה אחת (רק של המשתמש המחובר)."""
    return await NotificationApiService(db).get_one(notification_id, user.id)


@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
    read: bool = True,
):
    """סמן הודעה כנקראה או כלא נקראה."""
    return await NotificationApiService(db).set_read_state(notification_id, user.id, read)


@router.post("/send", response_model=list[NotificationOut])
async def send_notifications(
    data: NotificationCreate,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """שליחת הודעה למשתמשים (מנהל בלבד)."""
    return await NotificationApiService(db).send_to_users(user, data)
