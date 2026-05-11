"""OAuth HTTP endpoints. Owns all RedirectResponse/cookie wiring so that
backend.services.oauth_service stays HTTP-framework-free.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from backend.core.config import settings
from backend.core.deps import DBSessionDep
from backend.schemas.oauth import OAuthRedirectDTO, OAuthTokenBundleDTO
from backend.services.oauth_service import (
    FRONTEND_CALLBACK_PATH,
    OAUTH_REDIRECT_COOKIE,
    OAUTH_STATE_COOKIE,
    OAuthService,
)

router = APIRouter()

REDIRECT_URL_QUERY_PARAM = "redirect_url"
TOKEN_QUERY_PARAM = "token"
REFRESH_TOKEN_QUERY_PARAM = "refresh_token"
TOKEN_TYPE_QUERY_PARAM = "type"
ERROR_QUERY_PARAM = "error"
BEARER_TOKEN_TYPE = "bearer"


def _apply_redirect_dto(dto: OAuthRedirectDTO) -> RedirectResponse:
    """Materialize an OAuthRedirectDTO as a FastAPI RedirectResponse."""
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
        # Cookie cleanup: state/redirect cookies are single-use for one consent
        # round-trip; remove them after the callback so a stale value can't be
        # replayed on a later login attempt.
        response.delete_cookie(name)
    return response


def _build_success_callback_url(base: str, tokens: OAuthTokenBundleDTO) -> str:
    url = (
        f"{base}?{TOKEN_QUERY_PARAM}={tokens.access_token}"
        f"&{TOKEN_TYPE_QUERY_PARAM}={BEARER_TOKEN_TYPE}"
    )
    if tokens.refresh_token:
        url += f"&{REFRESH_TOKEN_QUERY_PARAM}={tokens.refresh_token}"
    return url


def _build_error_callback_url(base: str, detail: str) -> str:
    return f"{base}?{ERROR_QUERY_PARAM}={detail}"


@router.get("/google")
async def google_login(request: Request, db: DBSessionDep):
    """Initiate Google OAuth login."""
    frontend_redirect = request.query_params.get(
        REDIRECT_URL_QUERY_PARAM, settings.FRONTEND_URL
    )
    dto = await OAuthService(db).build_login_redirect(frontend_redirect)
    return _apply_redirect_dto(dto)


@router.get("/google/callback")
async def google_callback(
    code: str,
    request: Request,
    db: DBSessionDep,
    state: str | None = None,
):
    """Handle Google OAuth callback."""
    base_callback = (
        request.cookies.get(OAUTH_REDIRECT_COOKIE, settings.FRONTEND_URL)
        + FRONTEND_CALLBACK_PATH
    )
    try:
        tokens = await OAuthService(db).authenticate_with_code(code)
        target_url = _build_success_callback_url(base_callback, tokens)
    except HTTPException as e:
        target_url = _build_error_callback_url(base_callback, str(e.detail))

    redirect_dto = OAuthRedirectDTO(
        url=target_url,
        # One-shot consent cookies: clear so they can't be replayed.
        cookies_to_clear=[OAUTH_REDIRECT_COOKIE, OAUTH_STATE_COOKIE],
    )
    return _apply_redirect_dto(redirect_dto)
