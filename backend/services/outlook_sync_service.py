"""Outlook calendar sync orchestration service.

HTTP-framework-free: returns DTOs; the route layer turns the redirect
DTO into a FastAPI RedirectResponse with cookies. Microsoft Graph
specifics live in backend.services.outlook.microsoft_provider; DB
work lives in backend.repositories.outlook_sync_repository.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.outlook_sync import OutlookSync
from backend.models.task import Task
from backend.repositories.outlook_sync_repository import OutlookSyncRepository
from backend.schemas.oauth import OAuthCookieDTO, OAuthRedirectDTO
from backend.schemas.outlook import (
    OutlookDisconnectResultDTO,
    OutlookEventPayloadDTO,
    OutlookEventTimeDTO,
    OutlookStatusDTO,
    OutlookTokenBundleDTO,
)
from backend.services.outlook.base import CalendarProvider
from backend.services.outlook.microsoft_provider import MicrosoftCalendarProvider

# Cookie names + lifetimes for the consent round-trip (no magic strings).
OUTLOOK_STATE_COOKIE = "outlook_state"
OUTLOOK_USER_ID_COOKIE = "outlook_user_id"
OUTLOOK_COOKIE_MAX_AGE_SECONDS = 600  # 10 minutes
OUTLOOK_STATE_TOKEN_BYTES = 32

# Refresh proactively when the token is about to expire.
TOKEN_REFRESH_LEEWAY = timedelta(minutes=5)

# All-day event boundary constants — keeps the "is all day" check meaningful.
ALL_DAY_START_HOUR = 0
ALL_DAY_START_MINUTE = 0
ALL_DAY_END_HOUR = 23
ALL_DAY_END_MINUTE = 59

# Graph wire format for timestamps.
GRAPH_DATETIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
GRAPH_ALL_DAY_START_FORMAT = "%Y-%m-%dT00:00:00"
GRAPH_ALL_DAY_END_FORMAT = "%Y-%m-%dT23:59:59"


# ── Pure helpers (SRP, no I/O) ───────────────────────────────────────────────


def _to_utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime(GRAPH_DATETIME_FORMAT)


def _is_all_day_range(start: datetime, end: datetime) -> bool:
    return (
        start.hour == ALL_DAY_START_HOUR
        and start.minute == ALL_DAY_START_MINUTE
        and end.hour == ALL_DAY_END_HOUR
        and end.minute == ALL_DAY_END_MINUTE
    )


def _build_event_payload(task: Task) -> OutlookEventPayloadDTO:
    """Translate a Task into a provider-neutral event payload."""
    all_day = _is_all_day_range(task.start_time, task.end_time)
    if all_day:
        start_iso = task.start_time.strftime(GRAPH_ALL_DAY_START_FORMAT)
        end_iso = task.end_time.strftime(GRAPH_ALL_DAY_END_FORMAT)
    else:
        start_iso = _to_utc_iso(task.start_time)
        end_iso = _to_utc_iso(task.end_time)
    return OutlookEventPayloadDTO(
        subject=task.title,
        description=task.description or "",
        start=OutlookEventTimeDTO(date_time=start_iso),
        end=OutlookEventTimeDTO(date_time=end_iso),
        is_all_day=all_day,
    )


def _token_needs_refresh(expires_at: Optional[datetime]) -> bool:
    if expires_at is None:
        return True
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at.astimezone(timezone.utc) <= datetime.now(timezone.utc) + TOKEN_REFRESH_LEEWAY


def _build_state_cookies(user_id: int, state: str) -> list[OAuthCookieDTO]:
    return [
        OAuthCookieDTO(
            name=OUTLOOK_STATE_COOKIE,
            value=state,
            max_age=OUTLOOK_COOKIE_MAX_AGE_SECONDS,
        ),
        OAuthCookieDTO(
            name=OUTLOOK_USER_ID_COOKIE,
            value=str(user_id),
            max_age=OUTLOOK_COOKIE_MAX_AGE_SECONDS,
        ),
    ]


# ── Service ──────────────────────────────────────────────────────────────────


class OutlookSyncService:
    """Orchestrates Outlook calendar sync: connect, callback, status, events."""

    def __init__(
        self,
        db: AsyncSession,
        provider: Optional[CalendarProvider] = None,
    ):
        # Dependency injection so tests can swap the provider.
        self.db = db
        self.repo = OutlookSyncRepository(db)
        self.provider: CalendarProvider = provider or MicrosoftCalendarProvider()

    # ── connect / callback ────────────────────────────────────────────────

    def build_connect_redirect(self, user_id: int) -> OAuthRedirectDTO:
        """Step 1: redirect the user to the provider's consent screen."""
        state = secrets.token_urlsafe(OUTLOOK_STATE_TOKEN_BYTES)
        return OAuthRedirectDTO(
            url=self.provider.build_authorization_url(state=state),
            cookies_to_set=_build_state_cookies(user_id, state),
        )

    async def complete_connection(self, code: str, user_id: int) -> None:
        """Step 2: exchange the auth code and persist tokens for the user.

        Raises HTTPException via provider on token exchange failures.
        """
        tokens = await self.provider.exchange_code_for_tokens(code)
        await self._persist_tokens(user_id, tokens)

    async def _persist_tokens(self, user_id: int, tokens: OutlookTokenBundleDTO) -> None:
        await self.repo.save_tokens(
            user_id=user_id,
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            token_expires_at=tokens.token_expires_at,
        )
        await self.db.commit()

    # ── status / disconnect ───────────────────────────────────────────────

    async def get_status(self, user_id: int) -> OutlookStatusDTO:
        if not self.provider.is_configured():
            return OutlookStatusDTO(configured=False, connected=False)
        conn = await self.repo.get_by_user_id(user_id)
        last_sync_iso = (
            conn.last_sync_at.isoformat() if conn and conn.last_sync_at else None
        )
        return OutlookStatusDTO(
            configured=True,
            connected=conn is not None,
            last_sync_at=last_sync_iso,
        )

    async def disconnect(self, user_id: int) -> OutlookDisconnectResultDTO:
        await self.repo.delete_by_user_id(user_id)
        await self.db.commit()
        return OutlookDisconnectResultDTO(ok=True)

    # ── event CRUD against the remote calendar ────────────────────────────

    async def create_event_for_task(self, task: Task) -> Optional[str]:
        token = await self._valid_access_token(task.assigned_to_user_id)
        if not self._is_schedulable(task) or token is None:
            return None
        return await self.provider.create_event(token, _build_event_payload(task))

    async def update_event_for_task(self, task: Task) -> bool:
        if not task.outlook_event_id or not self._is_schedulable(task):
            return False
        token = await self._valid_access_token(task.assigned_to_user_id)
        if token is None:
            return False
        return await self.provider.update_event(
            token, task.outlook_event_id, _build_event_payload(task)
        )

    async def delete_event(self, user_id: int, outlook_event_id: str) -> bool:
        token = await self._valid_access_token(user_id)
        if token is None:
            return False
        return await self.provider.delete_event(token, outlook_event_id)

    # ── internals ─────────────────────────────────────────────────────────

    @staticmethod
    def _is_schedulable(task: Task) -> bool:
        return bool(task.start_time and task.end_time)

    async def _valid_access_token(self, user_id: int) -> Optional[str]:
        conn = await self.repo.get_by_user_id(user_id)
        if conn is None:
            return None
        if _token_needs_refresh(conn.token_expires_at):
            refreshed = await self._try_refresh(conn)
            if refreshed is None:
                return None
            return refreshed
        return conn.access_token

    async def _try_refresh(self, conn: OutlookSync) -> Optional[str]:
        try:
            tokens = await self.provider.refresh_access_token(conn.refresh_token)
        except Exception:
            # Refresh failure means the user has to reconnect; surface as "no token".
            return None
        await self.repo.update_access_token(
            conn,
            access_token=tokens.access_token,
            expires_at=tokens.token_expires_at,
            refresh_token=tokens.refresh_token,
        )
        await self.db.commit()
        return tokens.access_token


# ── Module-level shims for existing callers (e.g. endpoints/tasks.py) ────────
# These preserve the function-based import surface while delegating to the
# class so we don't have to touch unrelated endpoints in this refactor.


async def create_outlook_event(db: AsyncSession, task: Task) -> Optional[str]:
    return await OutlookSyncService(db).create_event_for_task(task)


async def update_outlook_event(db: AsyncSession, task: Task) -> bool:
    return await OutlookSyncService(db).update_event_for_task(task)


async def delete_outlook_event(
    db: AsyncSession, user_id: int, outlook_event_id: str
) -> bool:
    return await OutlookSyncService(db).delete_event(user_id, outlook_event_id)
