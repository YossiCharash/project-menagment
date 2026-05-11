"""Abstract calendar-provider interface (Strategy pattern).

A provider encapsulates the vendor-specific bits: authorize URL,
token exchange, refresh, and event CRUD on the remote calendar.
The OutlookSyncService orchestrates the flow but stays provider-agnostic.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from backend.schemas.outlook import OutlookEventPayloadDTO, OutlookTokenBundleDTO


class CalendarProvider(ABC):
    """Strategy interface for an external calendar provider (e.g. Outlook)."""

    name: str  # e.g. "microsoft"

    @abstractmethod
    def is_configured(self) -> bool:
        """Whether the provider has the credentials it needs."""

    @abstractmethod
    def build_authorization_url(self, state: Optional[str]) -> str:
        """Return the consent URL where the user is redirected."""

    @abstractmethod
    async def exchange_code_for_tokens(self, code: str) -> OutlookTokenBundleDTO:
        """Exchange an auth code for access + refresh tokens."""

    @abstractmethod
    async def refresh_access_token(self, refresh_token: str) -> OutlookTokenBundleDTO:
        """Use a refresh token to obtain a fresh access token."""

    @abstractmethod
    async def create_event(self, access_token: str, payload: OutlookEventPayloadDTO) -> Optional[str]:
        """Create an event; return the provider's event id on success."""

    @abstractmethod
    async def update_event(
        self, access_token: str, event_id: str, payload: OutlookEventPayloadDTO
    ) -> bool:
        """Update an existing event by id; return True on success."""

    @abstractmethod
    async def delete_event(self, access_token: str, event_id: str) -> bool:
        """Delete an event by id; return True on success."""
