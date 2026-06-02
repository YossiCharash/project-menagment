"""
Tests for ContractPeriodService.check_and_renew_contract.

Targets the duration-based renewal path that previously failed to create
the next active period when the prior one had ended (project 11
"אלול 12 מודיעין" failure case).

Strategy: monkeypatch ``date.today`` inside the service module so we can
deterministically place "now" at any point relative to seeded periods.
"""
from __future__ import annotations

from datetime import date
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

# Importing these modules registers their mappers on backend.db.base.Base.
# We need Project and ContractPeriod tables and their direct FK targets
# (users, categories, suppliers, etc.) to exist before create_all.
from backend.db.base import Base
from backend.models.contract_period import ContractPeriod
from backend.models.project import Project
from backend.services import contract_period_service as cps_module
from backend.services.contract_period_service import ContractPeriodService

# ---------------------------------------------------------------------------
# SQLite-friendly engine override
# ---------------------------------------------------------------------------
# The shared conftest.test_engine fixture calls Base.metadata.create_all(),
# which fails because users.cems_warehouse_id references the cems_warehouses
# table defined under a *different* DeclarativeBase (CEMSBase). For these
# unit tests we only need the Project + ContractPeriod tables, so we create
# them directly without invoking the full metadata.


# SQLite type-compiler shim for any JSONB columns on related models.
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler as _SQLiteTC

if not hasattr(_SQLiteTC, "visit_JSONB"):
    _SQLiteTC.visit_JSONB = lambda self, type_, **kw: "TEXT"


# Strip the cross-DeclarativeBase FK from users.cems_warehouse_id so that
# Base.metadata.sorted_tables can resolve. We don't need that column for
# any of these renewal tests. After dropping the FK we must also assign
# a concrete column type, because the original column relied on FK type
# inference (its target lives in CEMSBase, not Base).
from sqlalchemy import String as _SAString  # noqa: E402

_users_table = Base.metadata.tables.get("users")
if _users_table is not None and "cems_warehouse_id" in _users_table.c:
    _broken_fks = [
        fk for fk in list(_users_table.foreign_keys)
        if "cems_warehouses" in str(fk.target_fullname)
    ]
    for _fk in _broken_fks:
        _fk.parent.foreign_keys.discard(_fk)
        _users_table.foreign_keys.discard(_fk)
        for _constraint in list(_users_table.constraints):
            if _fk in getattr(_constraint, "elements", ()):
                _users_table.constraints.discard(_constraint)
    _users_table.c.cems_warehouse_id.type = _SAString(36)


_REQUIRED_TABLE_NAMES = {
    # Direct ORM models we touch.
    "projects",
    "contract_periods",
    # FK targets reachable via Project / ContractPeriod / their cascades.
    "users",
    "categories",
    "suppliers",
    "transactions",
    "budgets",
    "subprojects",
    "recurring_transaction_templates",
    "funds",
    "unforeseen_transactions",
}


def _safe_subset_metadata():
    """Return a list of tables we can safely create on SQLite.

    Excludes tables with FKs pointing into other DeclarativeBases (CEMS).
    """
    keep = []
    for table in Base.metadata.sorted_tables:
        if table.name not in _REQUIRED_TABLE_NAMES:
            continue
        keep.append(table)
    return keep


@pytest_asyncio.fixture
async def test_engine():
    """In-memory SQLite engine with only the tables this module needs."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    tables = _safe_subset_metadata()
    async with engine.begin() as conn:
        # Drop any FKs referencing tables we don't create. We avoid this by
        # only creating the subset and not enforcing FK pragmas in SQLite.
        await conn.exec_driver_sql("PRAGMA foreign_keys = OFF")
        for table in tables:
            await conn.run_sync(lambda sync_conn, tbl=table: tbl.create(sync_conn, checkfirst=True))
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def test_db(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Override the shared conftest test_db so it uses our isolated engine."""
    session_factory = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session
        await session.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _FrozenDate(date):
    """A ``date`` subclass with a frozen ``today()`` classmethod."""


def _freeze_today(monkeypatch: pytest.MonkeyPatch, frozen: date) -> None:
    """Replace ``date`` inside the service module so ``date.today()`` is fixed.

    The service does ``from datetime import date`` at import time, so we
    patch the rebound name in the service module rather than ``datetime.date``
    itself (which would break SQLAlchemy's type system).
    """

    class FrozenDate(date):
        @classmethod
        def today(cls) -> date:  # type: ignore[override]
            return frozen

    monkeypatch.setattr(cps_module, "date", FrozenDate)


async def _seed_project_with_period(
    test_db,
    *,
    project_start: date,
    project_end: date,
    duration_months: int,
    period_start: date,
    period_end: date,
) -> tuple[Project, ContractPeriod]:
    """Create one project and one initial ContractPeriod row."""
    project = Project(
        name=f"Test Project {period_start.isoformat()}",
        start_date=project_start,
        end_date=project_end,
        contract_duration_months=duration_months,
        is_active=True,
    )
    test_db.add(project)
    await test_db.commit()
    await test_db.refresh(project)

    period = ContractPeriod(
        project_id=project.id,
        start_date=period_start,
        end_date=period_end,
        contract_year=period_start.year,
        year_index=1,
        is_archived=False,
    )
    test_db.add(period)
    await test_db.commit()
    await test_db.refresh(period)

    return project, period


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_project_11_scenario_renews_when_period_has_ended(
    test_db, monkeypatch: pytest.MonkeyPatch
):
    """The exact project-11 failure case.

    Seed a project whose one and only period ended ~2 months ago and
    confirm that ``check_and_renew_contract`` archives it and creates
    the next active period.
    """
    project, original_period = await _seed_project_with_period(
        test_db,
        project_start=date(2025, 4, 10),
        project_end=date(2026, 4, 9),
        duration_months=12,
        period_start=date(2025, 4, 10),
        period_end=date(2026, 4, 9),
    )
    _freeze_today(monkeypatch, date(2026, 6, 2))

    service = ContractPeriodService(test_db)
    await service.check_and_renew_contract(project.id)

    await test_db.refresh(original_period)
    assert original_period.is_archived is True, (
        "The original (ended) period should have been archived."
    )

    all_periods = await service.contract_periods.get_by_project(project.id)
    new_periods = [
        period for period in all_periods if period.id != original_period.id
    ]
    assert len(new_periods) == 1, (
        f"Expected exactly one new period to be created, got {len(new_periods)}."
    )
    new_period = new_periods[0]
    assert new_period.start_date == date(2026, 4, 9)
    assert new_period.end_date == date(2027, 4, 9)
    assert new_period.is_archived is False

    await test_db.refresh(project)
    assert project.start_date == date(2026, 4, 9)
    assert project.end_date == date(2027, 4, 9)


@pytest.mark.asyncio
async def test_catch_up_over_multiple_ended_periods(
    test_db, monkeypatch: pytest.MonkeyPatch
):
    """A project that ended two full cycles ago must produce two new periods."""
    project, first_period = await _seed_project_with_period(
        test_db,
        project_start=date(2023, 1, 1),
        project_end=date(2024, 1, 1),
        duration_months=12,
        period_start=date(2023, 1, 1),
        period_end=date(2024, 1, 1),
    )
    # "today" is well past two full 12-month cycles after the first period.
    _freeze_today(monkeypatch, date(2025, 6, 1))

    service = ContractPeriodService(test_db)
    await service.check_and_renew_contract(project.id)

    all_periods = await service.contract_periods.get_by_project(project.id)
    all_periods_sorted = sorted(all_periods, key=lambda period: period.start_date)

    # Expected chain: [2023-01-01, 2024-01-01) archived,
    #                 [2024-01-01, 2025-01-01) archived,
    #                 [2025-01-01, 2026-01-01) active.
    assert len(all_periods_sorted) == 3
    assert all_periods_sorted[0].start_date == date(2023, 1, 1)
    assert all_periods_sorted[0].end_date == date(2024, 1, 1)
    assert all_periods_sorted[0].is_archived is True

    assert all_periods_sorted[1].start_date == date(2024, 1, 1)
    assert all_periods_sorted[1].end_date == date(2025, 1, 1)
    assert all_periods_sorted[1].is_archived is True

    assert all_periods_sorted[2].start_date == date(2025, 1, 1)
    assert all_periods_sorted[2].end_date == date(2026, 1, 1)
    assert all_periods_sorted[2].is_archived is False

    await test_db.refresh(project)
    assert project.start_date == date(2025, 1, 1)
    assert project.end_date == date(2026, 1, 1)


@pytest.mark.asyncio
async def test_no_op_when_latest_period_still_active(
    test_db, monkeypatch: pytest.MonkeyPatch
):
    """If the latest period's end_date is still in the future, do nothing."""
    project, period = await _seed_project_with_period(
        test_db,
        project_start=date(2026, 1, 1),
        project_end=date(2027, 1, 1),
        duration_months=12,
        period_start=date(2026, 1, 1),
        period_end=date(2027, 1, 1),
    )
    _freeze_today(monkeypatch, date(2026, 6, 1))

    service = ContractPeriodService(test_db)
    result = await service.check_and_renew_contract(project.id)

    assert result is None, "No new period should have been created."

    all_periods = await service.contract_periods.get_by_project(project.id)
    assert len(all_periods) == 1
    await test_db.refresh(period)
    assert period.is_archived is False
