"""Outlook calendar sync HTTP endpoints.

Owns all RedirectResponse / cookie wiring so backend.services.outlook_sync_service
stays HTTP-framework-free. User-facing query-string messages live here.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse

from backend.core.config import settings
from backend.core.deps import DBSessionDep, get_current_user, get_outlook_connect_user_id
from backend.schemas.oauth import OAuthRedirectDTO
from backend.services.outlook_sync_service import (
    OUTLOOK_STATE_COOKIE,
    OUTLOOK_USER_ID_COOKIE,
    OutlookSyncService,
)

router = APIRouter()

# Frontend feedback paths — user-facing strings stay in the route layer.
OUTLOOK_SUCCESS_REDIRECT_PATH = "/task-calendar?outlook=connected"
OUTLOOK_ERROR_REDIRECT_PATH = "/task-calendar?outlook=error"


def _materialize_redirect(dto: OAuthRedirectDTO) -> RedirectResponse:
    """Turn an OAuthRedirectDTO into a FastAPI RedirectResponse."""
    response = RedirectResponse(url=dto.url)
    for cookie in dto.cookies_to_set:
        response.set_cookie(
            cookie.name,
            cookie.value,
            httponly=cookie.http_only,
            samesite=cookie.samesite,
            max_age=cookie.max_age,
        )
    for name in dto.cookies_to_clear:
        # Consent-flow cookies are single-use — clear them after callback so a
        # stale value can't be replayed on a later connect attempt.
        response.delete_cookie(name)
    return response


def _frontend_redirect_dto(path: str) -> OAuthRedirectDTO:
    """Build a redirect to the frontend that also clears the consent cookies."""
    return OAuthRedirectDTO(
        url=settings.FRONTEND_URL + path,
        cookies_to_clear=[OUTLOOK_STATE_COOKIE, OUTLOOK_USER_ID_COOKIE],
    )


def _parse_user_id_cookie(raw: str | None) -> int | None:
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


@router.get("/connect")
async def outlook_connect(
    db: DBSessionDep,
    user_id: int = Depends(get_outlook_connect_user_id),
):
    """Redirect to Microsoft login to connect Outlook calendar."""
    dto = OutlookSyncService(db).build_connect_redirect(user_id)
    return _materialize_redirect(dto)


@router.get("/callback")
async def outlook_callback(
    request: Request,
    db: DBSessionDep,
    code: str | None = None,
    state: str | None = None,
):
    """Handle Microsoft OAuth callback: save tokens, redirect to frontend."""
    user_id = _parse_user_id_cookie(request.cookies.get(OUTLOOK_USER_ID_COOKIE))
    if user_id is None or not code:
        return _materialize_redirect(_frontend_redirect_dto(OUTLOOK_ERROR_REDIRECT_PATH))
    try:
        await OutlookSyncService(db).complete_connection(code, user_id)
    except Exception:
        return _materialize_redirect(_frontend_redirect_dto(OUTLOOK_ERROR_REDIRECT_PATH))
    return _materialize_redirect(_frontend_redirect_dto(OUTLOOK_SUCCESS_REDIRECT_PATH))


@router.get("/status")
async def outlook_status(db: DBSessionDep, user=Depends(get_current_user)):
    """Return whether the current user has Outlook connected."""
    return await OutlookSyncService(db).get_status(user.id)


@router.delete("/disconnect")
async def outlook_disconnect(db: DBSessionDep, user=Depends(get_current_user)):
    """Remove the current user's Outlook connection."""
    return await OutlookSyncService(db).disconnect(user.id)
