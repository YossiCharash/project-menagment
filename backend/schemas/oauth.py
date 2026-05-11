"""DTOs for OAuth flows. Keeps services HTTP-framework-free.

The route layer turns these DTOs into framework-specific responses
(e.g. fastapi.responses.RedirectResponse) so services don't import
FastAPI primitives.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict


class OAuthCookieDTO(BaseModel):
    """A cookie the route layer should set on its response."""
    name: str
    value: str
    max_age: int = 600
    http_only: bool = True
    samesite: str = "lax"


class OAuthRedirectDTO(BaseModel):
    """A redirect plus the cookies the route should set/clear.

    Services return this; routes translate it into a RedirectResponse.
    """
    url: str
    cookies_to_set: list[OAuthCookieDTO] = []
    cookies_to_clear: list[str] = []


class OAuthUserInfoDTO(BaseModel):
    """Normalized user profile from any OAuth provider."""
    email: str
    provider_user_id: str
    full_name: str = ""
    avatar_url: Optional[str] = None
    email_verified: bool = False


class OAuthTokenBundleDTO(BaseModel):
    """Tokens returned after a successful OAuth login/registration."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: int
