"""Outlook calendar sync API: connect, disconnect, status."""
from fastapi import APIRouter, Depends, Request

from backend.core.deps import DBSessionDep, get_current_user, get_outlook_connect_user_id
from backend.services.outlook_sync_service import (
    build_outlook_connect_redirect,
    complete_outlook_connection,
    disconnect_outlook,
    get_outlook_status,
)

router = APIRouter()


@router.get("/connect")
async def outlook_connect(
    db: DBSessionDep,
    user_id: int = Depends(get_outlook_connect_user_id),
):
    """Redirect to Microsoft login to connect Outlook calendar. Frontend uses ?token=JWT for redirect flow."""
    return build_outlook_connect_redirect(user_id)


@router.get("/callback")
async def outlook_callback(
    request: Request,
    db: DBSessionDep,
    code: str,
    state: str | None = None,
):
    """Handle Microsoft OAuth callback: save tokens and redirect to frontend."""
    return await complete_outlook_connection(db, code, request)


@router.get("/status")
async def outlook_status(db: DBSessionDep, user=Depends(get_current_user)):
    """Return whether current user has Outlook connected."""
    return await get_outlook_status(db, user.id)


@router.delete("/disconnect")
async def outlook_disconnect(db: DBSessionDep, user=Depends(get_current_user)):
    """Remove Outlook connection for current user."""
    return await disconnect_outlook(db, user.id)
