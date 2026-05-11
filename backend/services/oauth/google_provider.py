"""Google-specific OAuth provider.

Encapsulates Google's URLs, scopes, and the userinfo -> DTO mapping so
that the OAuthService doesn't need to know any of it.
"""
from __future__ import annotations

from typing import Optional

from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import HTTPException, status

from backend.core.config import settings
from backend.schemas.oauth import OAuthUserInfoDTO
from backend.services.oauth.base import OAuthProvider

# Google OAuth endpoints (previously hard-coded inside OAuthService — line 129/144 in old file)
GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_OAUTH_SCOPES = "openid email profile"


class GoogleOAuthProvider(OAuthProvider):
    """Concrete OAuthProvider for Google."""

    name = "google"

    def __init__(self) -> None:
        self._client = AsyncOAuth2Client(
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
            scope=GOOGLE_OAUTH_SCOPES,
        )

    def is_configured(self) -> bool:
        return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)

    async def build_authorization_url(self, state: Optional[str]) -> str:
        if not self.is_configured():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Google OAuth is not configured",
            )
        url, _ = await self._client.create_authorization_url(
            url=GOOGLE_AUTHORIZE_URL,
            redirect_uri=settings.GOOGLE_REDIRECT_URI,
            state=state,
        )
        return url

    async def fetch_user_info(self, code: str) -> OAuthUserInfoDTO:
        token = await self._client.fetch_token(
            url=GOOGLE_TOKEN_URL,
            grant_type="authorization_code",
            code=code,
            redirect_uri=settings.GOOGLE_REDIRECT_URI,
        )
        response = await self._client.get(GOOGLE_USERINFO_URL, token=token)
        payload = response.json()

        email = payload.get("email")
        provider_user_id = payload.get("id")
        if not email or not provider_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get user information from Google",
            )
        return OAuthUserInfoDTO(
            email=email,
            provider_user_id=provider_user_id,
            full_name=payload.get("name", "") or "",
            avatar_url=payload.get("picture"),
            email_verified=bool(payload.get("verified_email", False)),
        )
