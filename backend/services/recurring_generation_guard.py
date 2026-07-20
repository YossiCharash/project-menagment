"""
RecurringGenerationGuard
========================

Single-responsibility module ensuring the recurring-transaction generation
pass for a given project runs **at most once per calendar day per process**,
no matter how many entry points (project page load, refresh, polling, ...)
trigger it.

Why this exists
---------------
``RecurringTransactionService.ensure_project_transactions_generated`` walks
every month from the earliest template start date up to today and issues
many queries per month. Running it on *every* ``GET /projects/{id}/full``
request costs hundreds of sequential round trips to a remote database while
almost always creating zero rows. This guard collapses that to one run per
project per day.

Design notes
------------
- SRP: this module ONLY decides "should generation run now for this
  project?". The actual generation logic lives in
  ``RecurringTransactionService.ensure_project_transactions_generated``
  and is reused as-is.
- Unlike ``ContractRenewalGuard`` (one global daily pass), this guard is
  keyed **per project**: project A having run today must not suppress the
  first run for project B.
- The guard is *fail-safe*: it never raises to the caller. A user request
  must never break because of a background side-effect.
- Concurrency: an ``asyncio.Lock`` plus double-checked locking guarantees
  exactly one execution per project per day even when many callers race in.
- No new dependencies; lazy imports mirror the existing pattern in
  ``backend.services.contract_renewal_guard`` to prevent circular imports.

Hebrew error messages are used in logs where they describe user-visible
domain concepts (פרויקט / עסקאות מחזוריות), per project convention.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession


logger = logging.getLogger(__name__)


class RecurringGenerationPassError(Exception):
    """נזרק כאשר מעבר יצירת העסקאות המחזוריות עבור פרויקט מסוים נכשל
    (לדוגמה, שאילתת התבניות או שמירת העסקאות במסד הנתונים נכשלה),
    ולכן לא ניתן לסמן את הפרויקט כמעובד להיום."""


class RecurringGenerationGuard:
    """Daily, per-project idempotency guard for recurring-transaction generation.

    Class-level state means ``RecurringGenerationGuard()`` instances share the
    same "last run" memory across the process — callers don't need to share
    a singleton instance explicitly.
    """

    _last_run_by_project: dict[int, date] = {}
    _lock: asyncio.Lock = asyncio.Lock()

    async def ensure_project_generation_ran(
        self, db: AsyncSession, project_id: int
    ) -> None:
        """Run recurring generation for ``project_id`` if it hasn't run today.

        Idempotent and safe to call from any number of entry points. Never
        raises — errors are logged and swallowed so a user request can
        complete normally even if the background side-effect fails.
        """
        today = date.today()

        # Fast path — no lock acquisition needed if this project already ran.
        if RecurringGenerationGuard._last_run_by_project.get(project_id) == today:
            return

        async with RecurringGenerationGuard._lock:
            # Double-checked locking: another coroutine may have completed
            # the pass for this project while we were waiting for the lock.
            if RecurringGenerationGuard._last_run_by_project.get(project_id) == today:
                return

            pass_completed = await self._safely_run_pass(db, project_id)
            if pass_completed:
                RecurringGenerationGuard._last_run_by_project[project_id] = today

    async def _safely_run_pass(self, db: AsyncSession, project_id: int) -> bool:
        """Execute the generation pass once for one project; never raises.

        Returns True if the pass completed, in which case the day is recorded
        and later calls short-circuit. Returns False if it failed — the day is
        NOT recorded, so the next invocation retries.
        """
        try:
            await self._run_pass(db, project_id)
            return True
        except RecurringGenerationPassError:
            logger.exception(
                "יצירת העסקאות המחזוריות לפרויקט %s נכשלה — "
                "ינסה שוב בקריאה הבאה",
                project_id,
            )
            await self._restore_session(db, project_id)
            return False
        except Exception:
            logger.exception(
                "שגיאה לא צפויה בשומר יצירת העסקאות המחזוריות לפרויקט %s — "
                "ינסה שוב בקריאה הבאה",
                project_id,
            )
            await self._restore_session(db, project_id)
            return False

    async def _restore_session(self, db: AsyncSession, project_id: int) -> None:
        """Roll back after a failed pass so the caller's session stays usable.

        A failed statement leaves the session needing a rollback; without this
        every later query in the same request would fail with PendingRollbackError
        instead of the request completing normally. Never raises.
        """
        try:
            await db.rollback()
        except Exception:
            logger.exception(
                "ביטול הטרנזקציה אחרי כשל ביצירת עסקאות מחזוריות לפרויקט %s נכשל",
                project_id,
            )

    async def _run_pass(self, db: AsyncSession, project_id: int) -> None:
        """Generate any missing recurring transactions for a single project.

        Raises ``RecurringGenerationPassError`` if the underlying service call
        fails, so the caller knows not to record today as done.
        """
        # Lazy import — mirrors the pattern in contract_renewal_guard and
        # avoids any potential circular import at module load time.
        from backend.services.recurring_transaction_service import (
            RecurringTransactionService,
        )

        try:
            await RecurringTransactionService(db).ensure_project_transactions_generated(
                project_id
            )
        except Exception as generation_error:
            raise RecurringGenerationPassError(
                f"יצירת העסקאות המחזוריות עבור פרויקט {project_id} נכשלה"
            ) from generation_error

    @classmethod
    def was_run_today(cls, project_id: int) -> bool:
        """Public sync helper for testability / monitoring."""
        return cls._last_run_by_project.get(project_id) == date.today()

    @classmethod
    def reset_for_testing(cls) -> None:
        """Reset class-level state. Intended only for tests."""
        cls._last_run_by_project = {}
