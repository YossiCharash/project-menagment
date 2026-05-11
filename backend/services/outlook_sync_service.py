"""Outlook calendar sync via Microsoft Graph API."""
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
from fastapi import HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.models.outlook_sync import OutlookSync
from backend.models.task import Task
from backend.repositories.outlook_sync_repository import OutlookSyncRepository
from backend.repositories.task_repository import TaskRepository

MICROSOFT_AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"
SCOPES = "Calendars.ReadWrite offline_access"


def _is_configured() -> bool:
    return bool(settings.MICROSOFT_CLIENT_ID and settings.MICROSOFT_CLIENT_SECRET)


def get_authorization_url(state: str | None = None) -> str:
    """Return Microsoft OAuth URL for calendar sync."""
    if not _is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Outlook sync is not configured (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET)",
        )
    params = {
        "client_id": settings.MICROSOFT_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": settings.MICROSOFT_REDIRECT_URI,
        "scope": SCOPES,
        "response_mode": "query",
    }
    if state:
        params["state"] = state
    q = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{MICROSOFT_AUTHORIZE_URL}?{q}"


async def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    """Exchange authorization code for access and refresh tokens."""
    if not _is_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Outlook sync not configured")
    async with httpx.AsyncClient() as client:
        r = await client.post(
            MICROSOFT_TOKEN_URL,
            data={
                "client_id": settings.MICROSOFT_CLIENT_ID,
                "client_secret": settings.MICROSOFT_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.MICROSOFT_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if r.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to exchange code for tokens",
        )
    data = r.json()
    expires_in = data.get("expires_in", 3600)
    # token_expires_at: we store UTC; Microsoft returns seconds until expiry
    token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    return {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "token_expires_at": token_expires_at,
    }


async def refresh_access_token(conn: OutlookSync) -> str:
    """Refresh Microsoft token; returns new access_token and updates conn."""
    async with httpx.AsyncClient() as client:
        r = await client.post(
            MICROSOFT_TOKEN_URL,
            data={
                "client_id": settings.MICROSOFT_CLIENT_ID,
                "client_secret": settings.MICROSOFT_CLIENT_SECRET,
                "refresh_token": conn.refresh_token,
                "grant_type": "refresh_token",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if r.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Outlook token expired; please reconnect",
        )
    data = r.json()
    expires_in = data.get("expires_in", 3600)
    conn.access_token = data["access_token"]
    conn.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    if "refresh_token" in data:
        conn.refresh_token = data["refresh_token"]
    return conn.access_token


def _ensure_utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def _get_valid_token(db: AsyncSession, user_id: int) -> str | None:
    repo = OutlookSyncRepository(db)
    conn = await repo.get_by_user_id(user_id)
    if not conn:
        return None
    # Refresh if expires in less than 5 minutes
    now = datetime.now(timezone.utc)
    if conn.token_expires_at and (conn.token_expires_at.tzinfo is None or conn.token_expires_at.astimezone(timezone.utc) <= now + timedelta(minutes=5)):
        try:
            await refresh_access_token(conn)
            await repo.upsert(conn)
            await db.commit()
        except HTTPException:
            return None
    return conn.access_token


async def create_outlook_event(db: AsyncSession, task: Task) -> str | None:
    """Create event in Outlook for the task's assignee. Returns Outlook event id or None."""
    if not task.start_time or not task.end_time:
        return None
    token = await _get_valid_token(db, task.assigned_to_user_id)
    if not token:
        return None
    start_iso = _ensure_utc_iso(task.start_time)
    end_iso = _ensure_utc_iso(task.end_time)
    is_all_day = (
        task.start_time.hour == 0 and task.start_time.minute == 0
        and task.end_time.hour == 23 and task.end_time.minute == 59
    )
    body: dict[str, Any] = {
        "subject": task.title,
        "body": {"contentType": "text", "content": task.description or ""},
        "start": {"dateTime": start_iso, "timeZone": "UTC"},
        "end": {"dateTime": end_iso, "timeZone": "UTC"},
    }
    if is_all_day:
        body["isAllDay"] = True
        body["start"] = {"dateTime": task.start_time.strftime("%Y-%m-%dT00:00:00"), "timeZone": "UTC"}
        body["end"] = {"dateTime": task.end_time.strftime("%Y-%m-%dT23:59:59"), "timeZone": "UTC"}
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{GRAPH_BASE}/me/calendar/events",
            json=body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
    if r.status_code not in (200, 201):
        return None
    data = r.json()
    return data.get("id")


async def update_outlook_event(db: AsyncSession, task: Task) -> bool:
    """Update event in Outlook. Returns True if updated."""
    if not task.outlook_event_id or not task.start_time or not task.end_time:
        return False
    token = await _get_valid_token(db, task.assigned_to_user_id)
    if not token:
        return False
    start_iso = _ensure_utc_iso(task.start_time)
    end_iso = _ensure_utc_iso(task.end_time)
    is_all_day = (
        task.start_time.hour == 0 and task.start_time.minute == 0
        and task.end_time.hour == 23 and task.end_time.minute == 59
    )
    body: dict[str, Any] = {
        "subject": task.title,
        "body": {"contentType": "text", "content": task.description or ""},
        "start": {"dateTime": start_iso, "timeZone": "UTC"},
        "end": {"dateTime": end_iso, "timeZone": "UTC"},
    }
    if is_all_day:
        body["isAllDay"] = True
    async with httpx.AsyncClient() as client:
        r = await client.patch(
            f"{GRAPH_BASE}/me/calendar/events/{task.outlook_event_id}",
            json=body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
    return r.status_code == 200


async def delete_outlook_event(db: AsyncSession, user_id: int, outlook_event_id: str) -> bool:
    """Delete event in Outlook. Returns True if deleted."""
    token = await _get_valid_token(db, user_id)
    if not token:
        return False
    async with httpx.AsyncClient() as client:
        r = await client.delete(
            f"{GRAPH_BASE}/me/calendar/events/{outlook_event_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    return r.status_code in (200, 204)


# --- High-level orchestration helpers (called from the routes layer) ---

_OUTLOOK_ERROR_REDIRECT = "/task-calendar?outlook=error"
_OUTLOOK_SUCCESS_REDIRECT = "/task-calendar?outlook=connected"


def _outlook_redirect(path: str) -> RedirectResponse:
    response = RedirectResponse(url=settings.FRONTEND_URL + path)
    response.delete_cookie("outlook_state")
    response.delete_cookie("outlook_user_id")
    return response


def build_outlook_connect_redirect(user_id: int) -> RedirectResponse:
    """Build redirect to Microsoft consent screen with state/user cookies set."""
    state = secrets.token_urlsafe(32)
    url = get_authorization_url(state=state)
    response = RedirectResponse(url=url)
    response.set_cookie("outlook_state", state, httponly=True, samesite="lax", max_age=600)
    response.set_cookie("outlook_user_id", str(user_id), httponly=True, samesite="lax", max_age=600)
    return response


async def complete_outlook_connection(
    db: AsyncSession, code: str | None, request: Request
) -> RedirectResponse:
    """Handle the OAuth callback: persist tokens for the user and return the final redirect."""
    user_id_cookie = request.cookies.get("outlook_user_id")
    if not user_id_cookie or not code:
        return _outlook_redirect(_OUTLOOK_ERROR_REDIRECT)
    try:
        user_id = int(user_id_cookie)
    except ValueError:
        return _outlook_redirect(_OUTLOOK_ERROR_REDIRECT)
    try:
        tokens = await exchange_code_for_tokens(code)
    except Exception:
        return _outlook_redirect(_OUTLOOK_ERROR_REDIRECT)
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
    return _outlook_redirect(_OUTLOOK_SUCCESS_REDIRECT)


async def get_outlook_status(db: AsyncSession, user_id: int) -> dict:
    """Return Outlook connection status for the given user."""
    if not _is_configured():
        return {"configured": False, "connected": False}
    repo = OutlookSyncRepository(db)
    conn = await repo.get_by_user_id(user_id)
    return {
        "configured": True,
        "connected": conn is not None,
        "last_sync_at": conn.last_sync_at.isoformat() if conn and conn.last_sync_at else None,
    }


async def disconnect_outlook(db: AsyncSession, user_id: int) -> dict:
    """Remove Outlook connection for a user."""
    repo = OutlookSyncRepository(db)
    await repo.delete_by_user_id(user_id)
    await db.commit()
    return {"ok": True}
