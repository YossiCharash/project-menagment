"""OAuth HTTP endpoints. Owns all RedirectResponse/cookie wiring so that
backend.services.oauth_service stays HTTP-framework-free.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from backend.core.config import settings
from backend.core.constants.oauth import (
    BEARER_TOKEN_TYPE,
    ERROR_QUERY_PARAM,
    REDIRECT_URL_QUERY_PARAM,
    REFRESH_TOKEN_QUERY_PARAM,
    TOKEN_QUERY_PARAM,
    TOKEN_TYPE_QUERY_PARAM,
)
from backend.core.deps import DBSessionDep
from backend.schemas.oauth import OAuthRedirectDTO, OAuthTokenBundleDTO
from backend.services.oauth_service import (
    FRONTEND_CALLBACK_PATH,
    OAUTH_REDIRECT_COOKIE,
    OAuthService,
)

router = APIRouter()


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

    return _apply_redirect_dto(OAuthService.build_callback_redirect(target_url))
