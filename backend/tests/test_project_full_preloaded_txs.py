"""
Regression tests for the project-detail load optimization.

get_project_full previously loaded the project's full transaction set THREE times
per request (the main query plus one inside each of get_current_contract_period and
get_previous_contracts_by_year). The contract-service methods now accept an optional
``preloaded_txs`` list so the caller can load transactions once and share them.

These tests assert that passing ``preloaded_txs`` yields byte-for-byte identical
results to letting the method load the transactions itself — i.e. the optimization
is behavior-preserving.

Reuses the isolated SQLite engine pattern from test_contract_renewal so we only
create the tables these tests touch (avoids the cross-DeclarativeBase CEMS FK issue).
"""
from __future__ import annotations

from datetime import date
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from backend.db.base import Base
from backend.models.contract_period import ContractPeriod
from backend.models.project import Project
from backend.models.transaction import Transaction, TransactionType
from backend.services.contract_period_service import ContractPeriodService

# Importing test_contract_renewal applies its module-level shims (dropping the CEMS
# cross-DeclarativeBase FK from users) so Base.metadata resolves on SQLite.
import backend.tests.test_contract_renewal  # noqa: F401,E402

# Tables these tests touch. Transaction eager-loads its `documents` relationship
# (lazy="selectin"), so that table must exist too or the ORM load raises.
_REQUIRED_TABLE_NAMES = {
    "projects",
    "contract_periods",
    "transactions",
    "documents",
    "users",
    "categories",
    "suppliers",
    "budgets",
    "subprojects",
    "recurring_transaction_templates",
    "funds",
    "unforeseen_transactions",
}


def _subset_tables():
    return [t for t in Base.metadata.sorted_tables if t.name in _REQUIRED_TABLE_NAMES]


@pytest_asyncio.fixture
async def test_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    tables = _subset_tables()
    async with engine.begin() as conn:
        await conn.exec_driver_sql("PRAGMA foreign_keys = OFF")
        for table in tables:
            await conn.run_sync(lambda sync_conn, tbl=table: tbl.create(sync_conn, checkfirst=True))
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def test_db(test_engine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()


async def _seed(test_db: AsyncSession) -> Project:
    """A project with two contract years and a spread of transactions.

    Includes regular income/expense, a fund transaction (must be ignored by the
    period financials), and a period-spanning transaction (proportional split) so
    every branch of _compute_period_financials_from_txs is exercised.
    """
    project = Project(
        name="Preload Equivalence Project",
        start_date=date(2025, 1, 1),
        end_date=date(2026, 1, 1),
        contract_duration_months=12,
    )
    test_db.add(project)
    await test_db.flush()

    # Two periods: year 1 (active) and a prior year.
    p_prev = ContractPeriod(
        project_id=project.id,
        start_date=date(2024, 1, 1),
        end_date=date(2025, 1, 1),
        contract_year=2024,
        year_index=1,
    )
    p_curr = ContractPeriod(
        project_id=project.id,
        start_date=date(2025, 1, 1),
        end_date=date(2026, 1, 1),
        contract_year=2025,
        year_index=1,
    )
    test_db.add_all([p_prev, p_curr])

    txs = [
        # Prior period
        Transaction(project_id=project.id, tx_date=date(2024, 3, 1), type=TransactionType.INCOME.value, amount=1000),
        Transaction(project_id=project.id, tx_date=date(2024, 6, 1), type=TransactionType.EXPENSE.value, amount=400),
        # Current period
        Transaction(project_id=project.id, tx_date=date(2025, 2, 1), type=TransactionType.INCOME.value, amount=2500),
        Transaction(project_id=project.id, tx_date=date(2025, 5, 1), type=TransactionType.EXPENSE.value, amount=900),
        # Fund transaction — must be excluded from period financials
        Transaction(project_id=project.id, tx_date=date(2025, 7, 1), type=TransactionType.EXPENSE.value, amount=5000, from_fund=True),
        # Period-spanning transaction — proportional split across the overlap
        Transaction(
            project_id=project.id,
            tx_date=date(2025, 1, 1),
            type=TransactionType.EXPENSE.value,
            amount=1200,
            period_start_date=date(2024, 7, 1),
            period_end_date=date(2025, 6, 30),
        ),
    ]
    test_db.add_all(txs)
    await test_db.commit()
    return project


async def _all_txs(test_db: AsyncSession, project_id: int):
    from sqlalchemy import select
    res = await test_db.execute(select(Transaction).where(Transaction.project_id == project_id))
    return list(res.scalars().all())


@pytest.mark.asyncio
async def test_current_period_preloaded_matches_self_loaded(test_db: AsyncSession):
    project = await _seed(test_db)
    service = ContractPeriodService(test_db)

    self_loaded = await service.get_current_contract_period(project.id)
    preloaded = await service.get_current_contract_period(
        project.id, preloaded_txs=await _all_txs(test_db, project.id)
    )

    assert preloaded == self_loaded
    # Sanity: the fund transaction (5000) must not have leaked into expenses.
    assert self_loaded["total_expense"] < 5000


@pytest.mark.asyncio
async def test_previous_periods_preloaded_matches_self_loaded(test_db: AsyncSession):
    project = await _seed(test_db)
    service = ContractPeriodService(test_db)

    self_loaded = await service.get_previous_contracts_by_year(project.id)
    preloaded = await service.get_previous_contracts_by_year(
        project.id, preloaded_txs=await _all_txs(test_db, project.id)
    )

    assert preloaded == self_loaded
    assert self_loaded, "expected at least one prior period in the result"


@pytest.mark.asyncio
async def test_empty_preloaded_list_is_reused_not_reloaded(test_db: AsyncSession):
    """An explicit empty list means 'no transactions' and must be honored as-is,
    not treated as 'unset' and silently reloaded from the DB."""
    project = await _seed(test_db)
    service = ContractPeriodService(test_db)

    result = await service.get_current_contract_period(project.id, preloaded_txs=[])

    # With zero transactions supplied, every financial figure is zero.
    assert result["total_income"] == 0
    assert result["total_expense"] == 0
    assert result["total_profit"] == 0
