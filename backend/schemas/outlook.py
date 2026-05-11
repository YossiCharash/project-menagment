"""DTOs for the Outlook calendar sync flow.

Mirrors backend.schemas.oauth: services return DTOs and the route
layer materializes them into FastAPI responses. No HTTP-framework
imports here.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from backend.schemas.oauth import OAuthRedirectDTO  # re-exported for routes


class OutlookTokenBundleDTO(BaseModel):
    """Tokens received from Microsoft's token endpoint."""
    access_token: str
    refresh_token: str
    token_expires_at: datetime


class OutlookStatusDTO(BaseModel):
    """Whether the current user has an Outlook connection wired up."""
    configured: bool
    connected: bool
    last_sync_at: Optional[str] = None


class OutlookDisconnectResultDTO(BaseModel):
    """Result of disconnecting Outlook for a user."""
    ok: bool = True


class OutlookEventTimeDTO(BaseModel):
    """One side (start/end) of an Outlook calendar event time."""
    date_time: str
    time_zone: str = "UTC"


class OutlookEventPayloadDTO(BaseModel):
    """Normalized payload for creating/updating an Outlook event.

    Provider classes serialize this into the Microsoft Graph JSON shape.
    """
    subject: str
    description: str = ""
    start: OutlookEventTimeDTO
    end: OutlookEventTimeDTO
    is_all_day: bool = False


# Re-export so route imports stay focused on the outlook schemas module.
__all__ = [
    "OAuthRedirectDTO",
    "OutlookTokenBundleDTO",
    "OutlookStatusDTO",
    "OutlookDisconnectResultDTO",
    "OutlookEventTimeDTO",
    "OutlookEventPayloadDTO",
]
