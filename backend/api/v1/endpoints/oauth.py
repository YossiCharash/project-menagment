from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import DBSessionDep
from backend.services.oauth_service import OAuthService
from backend.core.config import settings

router = APIRouter()


@router.get("/google")
async def google_login(request: Request, db: DBSessionDep):
    """Initiate Google OAuth login"""
    oauth_service = OAuthService(db)
    
    # Get redirect URL from query params or use default
    redirect_url = request.query_params.get("redirect_url", settings.FRONTEND_URL)
    
    # Generate state to include redirect URL
    import secrets
    state = secrets.token_urlsafe(32)
    # Store state in session/cookie (simplified - in production use proper session management)
    # For now, we'll encode redirect_url in state
    
    authorization_url = await oauth_service.get_google_authorization_url(state=state)
    
    # Store redirect URL in response cookies (simple approach)
    response = RedirectResponse(url=authorization_url)
    response.set_cookie("oauth_redirect", redirect_url, httponly=True, samesite="lax", max_age=600)
    response.set_cookie("oauth_state", state, httponly=True, samesite="lax", max_age=600)
    return response


@router.get("/google/callback")
async def google_callback(
    code: str,
    request: Request,
    state: str | None = None,
    db: DBSessionDep = None
):
    """Handle Google OAuth callback"""
    oauth_service = OAuthService(db)
    
    try:
        result = await oauth_service.handle_google_callback(code, state)
        
        # Get redirect URL from cookie
        redirect_url = request.cookies.get("oauth_redirect", settings.FRONTEND_URL) + "/auth/callback"
        
        # Create redirect with token
        redirect_with_token = f"{redirect_url}?token={result['access_token']}&type=bearer"
        
        response = RedirectResponse(url=redirect_with_token)
        # Clear cookies
        response.delete_cookie("oauth_redirect")
        response.delete_cookie("oauth_state")
        return response
        
    except HTTPException as e:
        # Redirect to frontend with error
        redirect_url = request.cookies.get("oauth_redirect", settings.FRONTEND_URL) + "/auth/callback"
        error_url = f"{redirect_url}?error={e.detail}"
        response = RedirectResponse(url=error_url)
        response.delete_cookie("oauth_redirect")
        response.delete_cookie("oauth_state")
        return response
