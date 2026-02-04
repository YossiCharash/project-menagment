"""Outlook calendar sync API: connect, disconnect, status."""
import secrets
from fastapi import APIRouter, Depends, Request, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.core.deps import DBSessionDep, get_current_user, get_outlook_connect_user_id
from backend.services.outlook_sync_service import (
    get_authorization_url,
    exchange_code_for_tokens,
    _is_configured,
)
from backend.repositories.outlook_sync_repository import OutlookSyncRepository
from backend.models.outlook_sync import OutlookSync

router = APIRouter()


@router.get("/connect")
async def outlook_connect(
    request: Request,
    db: DBSessionDep,
    user_id: int = Depends(get_outlook_connect_user_id),
):
    """Redirect to Microsoft login to connect Outlook calendar. Frontend uses ?token=JWT for redirect flow."""
    state = secrets.token_urlsafe(32)
    url = get_authorization_url(state=state)
    response = RedirectResponse(url=url)
    response.set_cookie("outlook_state", state, httponly=True, samesite="lax", max_age=600)
    response.set_cookie("outlook_user_id", str(user_id), httponly=True, samesite="lax", max_age=600)
    return response


@router.get("/callback")
async def outlook_callback(
    code: str,
    request: Request,
    db: DBSessionDep,
    state: str | None = None,
):
    """Handle Microsoft OAuth callback: save tokens and redirect to frontend."""
    user_id_cookie = request.cookies.get("outlook_user_id")
    if not user_id_cookie or not code:
        response = RedirectResponse(url=settings.FRONTEND_URL + "/task-calendar?outlook=error")
        response.delete_cookie("outlook_state")
        response.delete_cookie("outlook_user_id")
        return response
    try:
        user_id = int(user_id_cookie)
    except ValueError:
        response = RedirectResponse(url=settings.FRONTEND_URL + "/task-calendar?outlook=error")
        response.delete_cookie("outlook_state")
        response.delete_cookie("outlook_user_id")
        return response
    try:
        tokens = await exchange_code_for_tokens(code)
    except Exception:
        response = RedirectResponse(url=settings.FRONTEND_URL + "/task-calendar?outlook=error")
        response.delete_cookie("outlook_state")
        response.delete_cookie("outlook_user_id")
        return response
    repo = OutlookSyncRepository(db)
    existing = await repo.get_by_user_id(user_id)
    if existing:
        existing.access_token = tokens["access_token"]
        existing.refresh_token = tokens["refresh_token"]
        existing.token_expires_at = tokens["token_expires_at"]
        await repo.upsert(existing)
    else:
        row = OutlookSync(
            user_id=user_id,
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            token_expires_at=tokens["token_expires_at"],
        )
        await repo.upsert(row)
    await db.commit()
    response = RedirectResponse(url=settings.FRONTEND_URL + "/task-calendar?outlook=connected")
    response.delete_cookie("outlook_state")
    response.delete_cookie("outlook_user_id")
    return response


@router.get("/status")
async def outlook_status(db: DBSessionDep, user=Depends(get_current_user)):
    """Return whether current user has Outlook connected."""
    if not _is_configured():
        return {"configured": False, "connected": False}
    repo = OutlookSyncRepository(db)
    conn = await repo.get_by_user_id(user.id)
    return {
        "configured": True,
        "connected": conn is not None,
        "last_sync_at": conn.last_sync_at.isoformat() if conn and conn.last_sync_at else None,
    }


@router.delete("/disconnect")
async def outlook_disconnect(db: DBSessionDep, user=Depends(get_current_user)):
    """Remove Outlook connection for current user."""
    repo = OutlookSyncRepository(db)
    await repo.delete_by_user_id(user.id)
    await db.commit()
    return {"ok": True}
