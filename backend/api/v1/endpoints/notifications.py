"""API for user notifications (הודעות, הוראות, תזכורות)."""
from fastapi import APIRouter, Depends, Query

from backend.core.deps import DBSessionDep, get_current_user
from backend.schemas.notification import (
    NotificationCreate,
    NotificationListQuery,
    NotificationOut,
    NotificationReadStateUpdate,
    UnreadCountResult,
)
from backend.services.notification_service import (
    get_notification_for_user,
    get_unread_count,
    list_notifications_for_user,
    send_admin_notifications,
    update_notification_read_state,
)

router = APIRouter()


@router.get("/", response_model=list[NotificationOut])
async def list_my_notifications(
    db: DBSessionDep,
    user=Depends(get_current_user),
    unread_only: bool = Query(False, description="רק הודעות שלא נקראו"),
    type_filter: str | None = Query(None, description="סינון לפי סוג"),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[NotificationOut]:
    """רשימת ההודעות של המשתמש המחובר."""
    query = NotificationListQuery(
        user_id=user.id,
        unread_only=unread_only,
        type_filter=type_filter,
        limit=limit,
        offset=offset,
    )
    return await list_notifications_for_user(db, query)


@router.get("/unread-count", response_model=UnreadCountResult)
async def get_unread_count_endpoint(
    db: DBSessionDep, user=Depends(get_current_user)
) -> UnreadCountResult:
    """מספר ההודעות שלא נקראו (להצגת badge)."""
    return await get_unread_count(db, user.id)


@router.get("/{notification_id}", response_model=NotificationOut)
async def get_notification(
    notification_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
) -> NotificationOut:
    """פרטי הודעה אחת (רק של המשתמש המחובר)."""
    return await get_notification_for_user(db, notification_id, user.id)


@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
    read: bool = True,
) -> NotificationOut:
    """סמן הודעה כנקראה או כלא נקראה."""
    update = NotificationReadStateUpdate(
        notification_id=notification_id,
        user_id=user.id,
        read=read,
    )
    return await update_notification_read_state(db, update)


@router.post("/send", response_model=list[NotificationOut])
async def send_notifications(
    data: NotificationCreate,
    db: DBSessionDep,
    user=Depends(get_current_user),
) -> list[NotificationOut]:
    """שליחת הודעה למשתמשים (מנהל בלבד)."""
    return await send_admin_notifications(db, user, data)
