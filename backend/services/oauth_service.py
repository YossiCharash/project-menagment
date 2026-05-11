"""OAuth orchestration service.

The service is HTTP-framework-free: it returns DTOs and the route layer
turns them into RedirectResponses / cookies. Provider-specific knowledge
(URLs, scopes, userinfo parsing) lives in concrete OAuthProvider classes
under backend/services/oauth/.
"""
from __future__ import annotations

import secrets
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.security import create_token_pair
from backend.models.user import User, UserRole
from backend.repositories.user_repository import UserRepository
from backend.schemas.oauth import (
    OAuthCookieDTO,
    OAuthRedirectDTO,
    OAuthTokenBundleDTO,
    OAuthUserInfoDTO,
)
from backend.services.oauth.base import OAuthProvider
from backend.services.oauth.google_provider import GoogleOAuthProvider

# Cookie names + lifetimes (no more magic strings/numbers in the service).
OAUTH_REDIRECT_COOKIE = "oauth_redirect"
OAUTH_STATE_COOKIE = "oauth_state"
OAUTH_COOKIE_MAX_AGE_SECONDS = 600  # 10 minutes: short-lived consent round-trip
OAUTH_STATE_TOKEN_BYTES = 32
FRONTEND_CALLBACK_PATH = "/auth/callback"


class OAuthService:
    """Orchestrates OAuth login: state, user lookup/creation, token issuance."""

    def __init__(self, db: AsyncSession, provider: Optional[OAuthProvider] = None):
        # Dependency injection: tests/other providers can supply their own.
        self.db = db
        self.users = UserRepository(db)
        self.provider: OAuthProvider = provider or GoogleOAuthProvider()

    # ── Public API ────────────────────────────────────────────────────────────

    async def build_login_redirect(self, frontend_redirect_url: str) -> OAuthRedirectDTO:
        """Step 1: build the redirect to the provider's consent screen."""
        state = secrets.token_urlsafe(OAUTH_STATE_TOKEN_BYTES)
        authorization_url = await self.provider.build_authorization_url(state=state)
        return OAuthRedirectDTO(
            url=authorization_url,
            cookies_to_set=[
                OAuthCookieDTO(
                    name=OAUTH_REDIRECT_COOKIE,
                    value=frontend_redirect_url,
                    max_age=OAUTH_COOKIE_MAX_AGE_SECONDS,
                ),
                OAuthCookieDTO(
                    name=OAUTH_STATE_COOKIE,
                    value=state,
                    max_age=OAUTH_COOKIE_MAX_AGE_SECONDS,
                ),
            ],
        )

    async def authenticate_with_code(self, code: str) -> OAuthTokenBundleDTO:
        """Step 2: exchange the code, find-or-create the user, issue tokens."""
        user_info = await self.provider.fetch_user_info(code)
        user = await self._resolve_user(user_info)
        return self._issue_tokens(user)

    # ── Internal helpers (each does one thing — SRP) ──────────────────────────

    async def _resolve_user(self, info: OAuthUserInfoDTO) -> User:
        existing = await self.users.get_by_email(info.email)
        if existing is None:
            return await self._create_user_from_oauth(info)
        return await self._link_or_login_existing_user(existing, info)

    async def _create_user_from_oauth(self, info: OAuthUserInfoDTO) -> User:
        new_user = User(
            email=info.email,
            full_name=info.full_name,
            password_hash=None,
            oauth_provider=self.provider.name,
            oauth_id=info.provider_user_id,
            email_verified=info.email_verified,
            avatar_url=info.avatar_url,
            role=UserRole.MEMBER.value,
            is_active=True,
        )
        return await self.users.create(new_user)

    async def _link_or_login_existing_user(self, user: User, info: OAuthUserInfoDTO) -> User:
        already_linked = (
            user.oauth_provider == self.provider.name and user.oauth_id == info.provider_user_id
        )
        if already_linked:
            self._ensure_active(user)
            self._refresh_profile_fields(user, info)
            await self.users.update(user)
            return user

        if user.password_hash:
            # Password account exists with this email — refuse silent linking.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "An account with this email already exists. "
                    "Please login with your password first, or use a different Google account."
                ),
            )

        # Passwordless existing account — safe to link this provider to it.
        user.oauth_provider = self.provider.name
        user.oauth_id = info.provider_user_id
        self._refresh_profile_fields(user, info)
        await self.users.update(user)
        return user

    @staticmethod
    def _ensure_active(user: User) -> None:
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is inactive",
            )

    @staticmethod
    def _refresh_profile_fields(user: User, info: OAuthUserInfoDTO) -> None:
        user.avatar_url = info.avatar_url
        user.email_verified = info.email_verified or user.email_verified

    @staticmethod
    def _issue_tokens(user: User) -> OAuthTokenBundleDTO:
        tokens = create_token_pair(user.id, remember_me=True)
        return OAuthTokenBundleDTO(
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            expires_in=tokens["expires_in"],
            user_id=user.id,
        )
