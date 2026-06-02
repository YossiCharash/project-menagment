"""Tests for ContractRenewalGuard.

Verifies the daily idempotency contract:
  - The pass runs at most once per calendar day per process.
  - One bad project does not abort the pass.
  - Concurrent callers result in exactly one execution.
  - The "ran today" flag is updated even if some projects fail
    (as long as the pass itself completed iterating).
  - If the DB query for projects fails entirely, the flag is NOT
    updated, so the next caller will retry.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from backend.services.contract_renewal_guard import ContractRenewalGuard


@pytest.fixture(autouse=True)
def _reset_guard_state():
    """Reset class-level state between tests so each test starts fresh."""
    ContractRenewalGuard.reset_for_testing()
    yield
    ContractRenewalGuard.reset_for_testing()


def _make_projects(count: int) -> list:
    """Build lightweight stand-ins for Project ORM rows."""
    return [SimpleNamespace(id=project_id) for project_id in range(1, count + 1)]


class _FakeDB:
    """Drop-in replacement for AsyncSession; the guard never touches it
    directly in these tests because we patch _load_eligible_projects."""

    async def execute(self, *_args, **_kwargs):  # pragma: no cover - safety net
        raise AssertionError("execute should be patched out in these tests")


@pytest.mark.asyncio
async def test_pass_runs_only_once_when_called_twice():
    """Calling ensure_daily_renewal_ran twice in a row runs the pass once."""
    projects = _make_projects(3)
    check_mock = AsyncMock(return_value=None)

    with (
        patch.object(
            ContractRenewalGuard,
            "_load_eligible_projects",
            new=AsyncMock(return_value=projects),
        ),
        patch(
            "backend.services.contract_period_service.ContractPeriodService.check_and_renew_contract",
            new=check_mock,
        ),
    ):
        guard = ContractRenewalGuard()
        await guard.ensure_daily_renewal_ran(_FakeDB())
        await guard.ensure_daily_renewal_ran(_FakeDB())

    # First call processes 3 projects; second call short-circuits.
    assert check_mock.await_count == 3
    assert ContractRenewalGuard.was_run_today() is True


@pytest.mark.asyncio
async def test_one_project_failure_does_not_block_others_and_marks_day_done():
    """If one project's renewal raises, the others still process and the
    daily flag IS updated (so we don't retry the whole pass on every
    subsequent request)."""
    projects = _make_projects(3)

    async def flaky_renew(project_id):
        if project_id == 2:
            raise RuntimeError("simulated per-project failure")
        return None

    check_mock = AsyncMock(side_effect=flaky_renew)

    with (
        patch.object(
            ContractRenewalGuard,
            "_load_eligible_projects",
            new=AsyncMock(return_value=projects),
        ),
        patch(
            "backend.services.contract_period_service.ContractPeriodService.check_and_renew_contract",
            new=check_mock,
        ),
    ):
        await ContractRenewalGuard().ensure_daily_renewal_ran(_FakeDB())

    # All three projects were attempted, even though project 2 raised.
    assert check_mock.await_count == 3
    # The pass completed iterating, so today counts as "done".
    assert ContractRenewalGuard.was_run_today() is True


@pytest.mark.asyncio
async def test_query_failure_does_not_mark_day_done():
    """If the projects query itself fails, the flag is NOT updated so the
    next caller will retry."""
    load_mock = AsyncMock(
        side_effect=Exception("simulated DB outage")
    )

    with patch.object(
        ContractRenewalGuard, "_load_eligible_projects", new=load_mock
    ):
        # Should not raise to caller.
        await ContractRenewalGuard().ensure_daily_renewal_ran(_FakeDB())

    assert ContractRenewalGuard.was_run_today() is False


@pytest.mark.asyncio
async def test_concurrent_callers_result_in_single_execution():
    """Five coroutines firing ensure_daily_renewal_ran in parallel must
    cause exactly one pass."""
    projects = _make_projects(4)
    check_mock = AsyncMock(return_value=None)

    async def slow_load(_self, _db, _model):
        # Yield to the event loop so the other callers contend for the lock.
        await asyncio.sleep(0)
        return projects

    with (
        patch.object(
            ContractRenewalGuard, "_load_eligible_projects", new=slow_load
        ),
        patch(
            "backend.services.contract_period_service.ContractPeriodService.check_and_renew_contract",
            new=check_mock,
        ),
    ):
        await asyncio.gather(
            *(
                ContractRenewalGuard().ensure_daily_renewal_ran(_FakeDB())
                for _ in range(5)
            )
        )

    # 4 projects, exactly one pass — not 4 * 5 = 20.
    assert check_mock.await_count == 4
    assert ContractRenewalGuard.was_run_today() is True


@pytest.mark.asyncio
async def test_guard_never_raises_on_unexpected_error():
    """Any unexpected exception from inside the pass must be swallowed."""
    load_mock = AsyncMock(side_effect=Exception("boom"))

    with patch.object(
        ContractRenewalGuard, "_load_eligible_projects", new=load_mock
    ):
        # Must not raise.
        await ContractRenewalGuard().ensure_daily_renewal_ran(_FakeDB())
