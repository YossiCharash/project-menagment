from fastapi import APIRouter, Request

from backend.core.deps import DBSessionDep
from backend.services.oauth_service import OAuthService

router = APIRouter()


@router.get("/google")
async def google_login(request: Request, db: DBSessionDep):
    """Initiate Google OAuth login"""
    return await OAuthService(db).initiate_google_login(request)


@router.get("/google/callback")
async def google_callback(
    code: str,
    request: Request,
    db: DBSessionDep,
    state: str | None = None,
):
    """Handle Google OAuth callback"""
    return await OAuthService(db).complete_google_callback(code, state, request)
