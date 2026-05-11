"""Abstract OAuth provider interface (Strategy pattern).

A provider knows the provider-specific bits: authorize URL, token URL,
userinfo URL, scopes, and how to parse a userinfo payload into our
normalized DTO. The OAuthService orchestrates the flow but stays
provider-agnostic.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from backend.schemas.oauth import OAuthUserInfoDTO


class OAuthProvider(ABC):
    """Strategy interface for an OAuth identity provider."""

    name: str  # e.g. "google"

    @abstractmethod
    def is_configured(self) -> bool:
        """Whether the provider has the required credentials in config."""

    @abstractmethod
    async def build_authorization_url(self, state: Optional[str]) -> str:
        """Return the URL where the user is redirected to consent."""

    @abstractmethod
    async def fetch_user_info(self, code: str) -> OAuthUserInfoDTO:
        """Exchange the auth code for tokens, then fetch normalized user info."""
