"""
ContractRenewalGuard
====================

Single-responsibility module ensuring the daily contract-renewal pass
runs **at most once per calendar day per process**, no matter how many
entry points (scheduler, login, project list, lifespan startup, ...)
trigger it.

Design notes
------------
- SRP: this module ONLY decides "should the pass run now?" and orchestrates
  the per-project loop. The actual per-project renewal logic lives in
  ``ContractPeriodService.check_and_renew_contract`` and is reused as-is.
- DRY: the scheduler delegates to this guard; the pass is defined here once.
- The guard is *fail-safe*: it never raises to the caller. A user request
  must never break because of a background side-effect.
- Concurrency: an ``asyncio.Lock`` plus double-checked locking guarantees
  exactly one execution per day even when many callers race in.
- No new dependencies; lazy imports mirror the existing pattern in
  ``backend.core.schedulers`` to prevent circular imports.

Hebrew error messages are used in logs where they describe user-visible
domain concepts (פרויקט / חוזה / מסד נתונים), per project convention.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


logger = logging.getLogger(__name__)


class ContractRenewalPassError(Exception):
    """נזרק כאשר המעבר היומי על הפרויקטים נכשל בשלב האיטרציה (לדוגמה,
    שאילתת המסד נתונים עצמה נכשלה ולא ניתן לעבד אף פרויקט)."""


class ContractRenewalGuard:
    """Daily idempotency guard for the contract-renewal pass.

    Class-level state means ``ContractRenewalGuard()`` instances share the
    same "last run" memory across the process — callers don't need to share
    a singleton instance explicitly.
    """

    _last_run_date: Optional[date] = None
    _lock: asyncio.Lock = asyncio.Lock()

    async def ensure_daily_renewal_ran(self, db: AsyncSession) -> None:
        """Run the daily contract-renewal pass if it hasn't run yet today.

        Idempotent and safe to call from any number of entry points. Never
        raises — errors are logged and swallowed so a user request can
        complete normally even if the background side-effect fails.
        """
        today = date.today()

        # Fast path — no lock acquisition needed if we already ran today.
        if ContractRenewalGuard._last_run_date == today:
            return

        async with ContractRenewalGuard._lock:
            # Double-checked locking: another coroutine may have completed
            # the pass while we were waiting for the lock.
            if ContractRenewalGuard._last_run_date == today:
                return

            pass_completed = await self._safely_run_pass(db)
            if pass_completed:
                ContractRenewalGuard._last_run_date = today

    async def _safely_run_pass(self, db: AsyncSession) -> bool:
        """Execute the renewal pass once; never raises.

        Returns True if the pass iterated through projects successfully
        (even if individual projects failed); False if the iteration itself
        could not start (e.g. the DB query failed entirely) — in which case
        the caller will retry on the next invocation.
        """
        try:
            await self._run_pass(db)
            return True
        except ContractRenewalPassError:
            logger.exception(
                "המעבר היומי על חידוש חוזים נכשל בשלב האיטרציה — "
                "ינסה שוב בקריאה הבאה"
            )
            return False
        except Exception:
            logger.exception(
                "שגיאה לא צפויה בשומר חידוש החוזים היומי — "
                "ינסה שוב בקריאה הבאה"
            )
            return False

    async def _run_pass(self, db: AsyncSession) -> None:
        """Iterate every eligible project and run the per-project renewal.

        Raises ``ContractRenewalPassError`` only if the iteration itself
        cannot start (DB query failure). Per-project failures are logged
        and skipped so one bad project doesn't break the whole pass.
        """
        # Lazy imports — mirrors the pattern in backend.core.schedulers
        # and avoids any potential circular import at module load time.
        from backend.models.project import Project
        from backend.services.contract_period_service import ContractPeriodService
        from backend.services.recurring_transaction_service import (
            RecurringTransactionService,
        )

        projects = await self._load_eligible_projects(db, Project)
        contract_service = ContractPeriodService(db)
        recurring_service = RecurringTransactionService(db)

        for project in projects:
            await self._renew_single_project(
                project_id=project.id,
                contract_service=contract_service,
                recurring_service=recurring_service,
            )

    async def _load_eligible_projects(self, db: AsyncSession, project_model):
        """Fetch all active projects that have an ``end_date`` set."""
        try:
            result = await db.execute(
                select(project_model).where(
                    project_model.is_active == True,  # noqa: E712
                    project_model.end_date.isnot(None),
                )
            )
            return result.scalars().all()
        except Exception as query_error:
            raise ContractRenewalPassError(
                "שאילתת טעינת הפרויקטים הפעילים נכשלה"
            ) from query_error

    async def _renew_single_project(
        self,
        project_id: int,
        contract_service,
        recurring_service,
    ) -> None:
        """Renew one project; never raises (logs and continues)."""
        try:
            renewed_period = await contract_service.check_and_renew_contract(
                project_id
            )
            if renewed_period:
                await recurring_service.ensure_project_transactions_generated(
                    project_id
                )
        except Exception:
            logger.exception(
                "שגיאה בחידוש חוזה לפרויקט %s", project_id
            )

    @classmethod
    def was_run_today(cls) -> bool:
        """Public sync helper for testability / monitoring."""
        return cls._last_run_date == date.today()

    @classmethod
    def reset_for_testing(cls) -> None:
        """Reset class-level state. Intended only for tests."""
        cls._last_run_date = None
