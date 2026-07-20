"""Tests for RecurringGenerationGuard.

Verifies the per-project daily idempotency contract:
  - The generation pass runs at most once per project per calendar day.
  - Projects are isolated: project A running does not suppress project B.
  - Failures are swallowed AND the day is not recorded, so a later call retries.
  - Concurrent callers for the same project result in exactly one execution.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from backend.services.recurring_generation_guard import RecurringGenerationGuard


ENSURE_TARGET = (
    "backend.services.recurring_transaction_service."
    "RecurringTransactionService.ensure_project_transactions_generated"
)


@pytest.fixture(autouse=True)
def _reset_guard_state():
    """Reset class-level state between tests so each test starts fresh."""
    RecurringGenerationGuard.reset_for_testing()
    yield
    RecurringGenerationGuard.reset_for_testing()


class _FakeDB:
    """Drop-in replacement for AsyncSession; the guard hands it straight to the
    service, which is patched out in these tests."""

    def __init__(self):
        self.rollback_count = 0

    async def execute(self, *_args, **_kwargs):  # pragma: no cover - safety net
        raise AssertionError("execute should be patched out in these tests")

    async def rollback(self):
        self.rollback_count += 1


@pytest.mark.asyncio
async def test_generation_runs_only_once_per_project_per_day():
    """A second call for the same project on the same day is a no-op."""
    ensure_mock = AsyncMock(return_value=0)

    with patch(ENSURE_TARGET, new=ensure_mock):
        guard = RecurringGenerationGuard()
        await guard.ensure_project_generation_ran(_FakeDB(), 42)
        await guard.ensure_project_generation_ran(_FakeDB(), 42)

    assert ensure_mock.await_count == 1
    assert RecurringGenerationGuard.was_run_today(42) is True


@pytest.mark.asyncio
async def test_projects_are_isolated_from_each_other():
    """Running project A must not suppress the first run for project B."""
    ensure_mock = AsyncMock(return_value=0)

    with patch(ENSURE_TARGET, new=ensure_mock):
        guard = RecurringGenerationGuard()
        await guard.ensure_project_generation_ran(_FakeDB(), 1)
        await guard.ensure_project_generation_ran(_FakeDB(), 2)
        # Repeat calls for both: still no extra runs.
        await guard.ensure_project_generation_ran(_FakeDB(), 1)
        await guard.ensure_project_generation_ran(_FakeDB(), 2)

    assert ensure_mock.await_count == 2
    assert RecurringGenerationGuard.was_run_today(1) is True
    assert RecurringGenerationGuard.was_run_today(2) is True
    assert RecurringGenerationGuard.was_run_today(3) is False


@pytest.mark.asyncio
async def test_service_failure_is_swallowed_and_day_not_recorded():
    """A failing generation pass must not raise to the caller, and must not
    mark the day as done — so the next call retries."""
    ensure_mock = AsyncMock(side_effect=Exception("simulated DB outage"))

    with patch(ENSURE_TARGET, new=ensure_mock):
        guard = RecurringGenerationGuard()
        # Must not raise.
        await guard.ensure_project_generation_ran(_FakeDB(), 7)
        assert RecurringGenerationGuard.was_run_today(7) is False

        # A later call retries because the day was never recorded.
        await guard.ensure_project_generation_ran(_FakeDB(), 7)

    assert ensure_mock.await_count == 2
    assert RecurringGenerationGuard.was_run_today(7) is False


@pytest.mark.asyncio
async def test_retry_succeeds_after_earlier_failure():
    """Once a retry succeeds, the day is recorded and further calls short-circuit."""
    ensure_mock = AsyncMock(side_effect=[Exception("transient"), 0])

    with patch(ENSURE_TARGET, new=ensure_mock):
        guard = RecurringGenerationGuard()
        await guard.ensure_project_generation_ran(_FakeDB(), 9)
        await guard.ensure_project_generation_ran(_FakeDB(), 9)
        await guard.ensure_project_generation_ran(_FakeDB(), 9)

    assert ensure_mock.await_count == 2
    assert RecurringGenerationGuard.was_run_today(9) is True


@pytest.mark.asyncio
async def test_concurrent_callers_result_in_single_execution():
    """Five coroutines racing for the same project must cause exactly one pass."""
    async def slow_ensure(_project_id):
        # Yield to the event loop so the other callers contend for the lock.
        await asyncio.sleep(0)
        return 0

    ensure_mock = AsyncMock(side_effect=slow_ensure)

    with patch(ENSURE_TARGET, new=ensure_mock):
        await asyncio.gather(
            *(
                RecurringGenerationGuard().ensure_project_generation_ran(
                    _FakeDB(), 100
                )
                for _ in range(5)
            )
        )

    assert ensure_mock.await_count == 1
    assert RecurringGenerationGuard.was_run_today(100) is True


@pytest.mark.asyncio
async def test_failed_pass_rolls_back_so_session_stays_usable():
    """A failed pass must roll the session back; otherwise every later query in
    the same request would fail with PendingRollbackError."""
    ensure_mock = AsyncMock(side_effect=Exception("simulated DB outage"))
    db = _FakeDB()

    with patch(ENSURE_TARGET, new=ensure_mock):
        await RecurringGenerationGuard().ensure_project_generation_ran(db, 55)

    assert db.rollback_count == 1


@pytest.mark.asyncio
async def test_successful_pass_does_not_roll_back():
    """The happy path must leave the caller's transaction alone."""
    ensure_mock = AsyncMock(return_value=0)
    db = _FakeDB()

    with patch(ENSURE_TARGET, new=ensure_mock):
        await RecurringGenerationGuard().ensure_project_generation_ran(db, 56)

    assert db.rollback_count == 0


@pytest.mark.asyncio
async def test_reset_for_testing_clears_all_projects():
    """reset_for_testing wipes the whole per-project map."""
    ensure_mock = AsyncMock(return_value=0)

    with patch(ENSURE_TARGET, new=ensure_mock):
        guard = RecurringGenerationGuard()
        await guard.ensure_project_generation_ran(_FakeDB(), 1)
        assert RecurringGenerationGuard.was_run_today(1) is True

        RecurringGenerationGuard.reset_for_testing()
        assert RecurringGenerationGuard.was_run_today(1) is False

        await guard.ensure_project_generation_ran(_FakeDB(), 1)

    assert ensure_mock.await_count == 2
