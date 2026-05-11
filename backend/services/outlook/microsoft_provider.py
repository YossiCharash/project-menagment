"""Microsoft Graph calendar provider.

Encapsulates Microsoft-specific URLs, scopes, OAuth token exchange,
and the Graph event JSON shape so the OutlookSyncService doesn't
need to know any of it.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from fastapi import HTTPException, status

from backend.core.config import settings
from backend.schemas.outlook import OutlookEventPayloadDTO, OutlookTokenBundleDTO
from backend.services.outlook.base import CalendarProvider

# Microsoft Graph defaults — kept here, NOT in the orchestration service.
DEFAULT_TOKEN_LIFETIME_SECONDS = 3600
FORM_URLENCODED_CONTENT_TYPE = "application/x-www-form-urlencoded"
JSON_CONTENT_TYPE = "application/json"
HTTP_OK = 200
HTTP_CREATED = 201
HTTP_NO_CONTENT = 204
GRAPH_EVENTS_PATH = "/me/calendar/events"


def _seconds_to_expiry(seconds: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=seconds)


def _build_event_body(payload: OutlookEventPayloadDTO) -> dict[str, Any]:
    body: dict[str, Any] = {
        "subject": payload.subject,
        "body": {"contentType": "text", "content": payload.description},
        "start": {"dateTime": payload.start.date_time, "timeZone": payload.start.time_zone},
        "end": {"dateTime": payload.end.date_time, "timeZone": payload.end.time_zone},
    }
    if payload.is_all_day:
        body["isAllDay"] = True
    return body


def _auth_header(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def _json_auth_headers(access_token: str) -> dict[str, str]:
    return {**_auth_header(access_token), "Content-Type": JSON_CONTENT_TYPE}


class MicrosoftCalendarProvider(CalendarProvider):
    """Concrete CalendarProvider for Microsoft Graph (Outlook)."""

    name = "microsoft"

    def is_configured(self) -> bool:
        return bool(settings.MICROSOFT_CLIENT_ID and settings.MICROSOFT_CLIENT_SECRET)

    def build_authorization_url(self, state: Optional[str]) -> str:
        self._require_configured()
        params: dict[str, str] = {
            "client_id": settings.MICROSOFT_CLIENT_ID,
            "response_type": "code",
            "redirect_uri": settings.MICROSOFT_REDIRECT_URI,
            "scope": settings.MICROSOFT_GRAPH_SCOPES,
            "response_mode": "query",
        }
        if state:
            params["state"] = state
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{settings.MICROSOFT_AUTHORIZE_URL}?{query}"

    async def exchange_code_for_tokens(self, code: str) -> OutlookTokenBundleDTO:
        self._require_configured()
        data = await self._post_token_endpoint(
            {
                "client_id": settings.MICROSOFT_CLIENT_ID,
                "client_secret": settings.MICROSOFT_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.MICROSOFT_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            failure_status=status.HTTP_400_BAD_REQUEST,
            failure_detail="Failed to exchange code for tokens",
        )
        return OutlookTokenBundleDTO(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            token_expires_at=_seconds_to_expiry(
                data.get("expires_in", DEFAULT_TOKEN_LIFETIME_SECONDS)
            ),
        )

    async def refresh_access_token(self, refresh_token: str) -> OutlookTokenBundleDTO:
        data = await self._post_token_endpoint(
            {
                "client_id": settings.MICROSOFT_CLIENT_ID,
                "client_secret": settings.MICROSOFT_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
            failure_status=status.HTTP_401_UNAUTHORIZED,
            failure_detail="Outlook token expired; please reconnect",
        )
        return OutlookTokenBundleDTO(
            access_token=data["access_token"],
            # Microsoft may or may not rotate the refresh token.
            refresh_token=data.get("refresh_token", refresh_token),
            token_expires_at=_seconds_to_expiry(
                data.get("expires_in", DEFAULT_TOKEN_LIFETIME_SECONDS)
            ),
        )

    async def create_event(
        self, access_token: str, payload: OutlookEventPayloadDTO
    ) -> Optional[str]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.MICROSOFT_GRAPH_BASE_URL}{GRAPH_EVENTS_PATH}",
                json=_build_event_body(payload),
                headers=_json_auth_headers(access_token),
            )
        if response.status_code not in (HTTP_OK, HTTP_CREATED):
            return None
        return response.json().get("id")

    async def update_event(
        self, access_token: str, event_id: str, payload: OutlookEventPayloadDTO
    ) -> bool:
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{settings.MICROSOFT_GRAPH_BASE_URL}{GRAPH_EVENTS_PATH}/{event_id}",
                json=_build_event_body(payload),
                headers=_json_auth_headers(access_token),
            )
        return response.status_code == HTTP_OK

    async def delete_event(self, access_token: str, event_id: str) -> bool:
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{settings.MICROSOFT_GRAPH_BASE_URL}{GRAPH_EVENTS_PATH}/{event_id}",
                headers=_auth_header(access_token),
            )
        return response.status_code in (HTTP_OK, HTTP_NO_CONTENT)

    # ── internals ────────────────────────────────────────────────────────────

    def _require_configured(self) -> None:
        if not self.is_configured():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Outlook sync is not configured",
            )

    async def _post_token_endpoint(
        self,
        form: dict[str, str],
        *,
        failure_status: int,
        failure_detail: str,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                settings.MICROSOFT_TOKEN_URL,
                data=form,
                headers={"Content-Type": FORM_URLENCODED_CONTENT_TYPE},
            )
        if response.status_code != HTTP_OK:
            raise HTTPException(status_code=failure_status, detail=failure_detail)
        return response.json()
