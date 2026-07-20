"""Tests for the month-generation optimization in RecurringTransactionService.

``_generate_transactions_for_month_for_project`` now pre-loads the existing
(recurring_template_id, tx_date) pairs for the month in ONE query instead of
running an existence query per candidate. These tests pin the *behaviour*:
the same transactions must be created, and re-running must be a no-op.
"""
from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from backend.models.project import Project
from backend.models.recurring_transaction import (
    RecurringEndType,
    RecurringFrequency,
    RecurringTransactionTemplate,
)
from backend.models.transaction import Transaction, TransactionType
from backend.services.recurring_transaction_service import RecurringTransactionService


async def _make_project(test_db, name: str = "Recurring Test Project") -> Project:
    project = Project(
        name=name,
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
        budget_monthly=0,
        budget_annual=0,
        is_active=True,
    )
    test_db.add(project)
    await test_db.commit()
    await test_db.refresh(project)
    return project


async def _make_template(
    test_db,
    project_id: int,
    category_id: int,
    day_of_month: int,
    description: str = "דמי ניהול",
) -> RecurringTransactionTemplate:
    template = RecurringTransactionTemplate(
        project_id=project_id,
        description=description,
        type=TransactionType.EXPENSE.value,
        amount=100,
        category_id=category_id,
        frequency=RecurringFrequency.MONTHLY.value,
        day_of_month=day_of_month,
        start_date=date(2024, 1, 1),
        end_type=RecurringEndType.NO_END.value,
        is_active=True,
    )
    test_db.add(template)
    await test_db.commit()
    await test_db.refresh(template)
    return template


async def _transactions_for(test_db, project_id: int) -> list[Transaction]:
    result = await test_db.execute(
        select(Transaction)
        .where(Transaction.project_id == project_id)
        .order_by(Transaction.tx_date)
    )
    return list(result.scalars().all())


@pytest.mark.asyncio
async def test_month_generation_creates_one_transaction_per_template(
    test_db, default_category
):
    """A month with two templates yields exactly one transaction each,
    on the templates' respective days."""
    project = await _make_project(test_db)
    await _make_template(test_db, project.id, default_category, day_of_month=5)
    await _make_template(
        test_db, project.id, default_category, day_of_month=20, description="חשמל"
    )

    service = RecurringTransactionService(test_db)
    generated = await service._generate_transactions_for_month_for_project(
        project.id, 2024, 3
    )

    assert len(generated) == 2
    tx_dates = sorted(tx.tx_date for tx in await _transactions_for(test_db, project.id))
    assert tx_dates == [date(2024, 3, 5), date(2024, 3, 20)]


@pytest.mark.asyncio
async def test_month_generation_is_idempotent(test_db, default_category):
    """Re-running the same month must not duplicate anything — this is what the
    pre-loaded existing-pairs set is responsible for."""
    project = await _make_project(test_db)
    await _make_template(test_db, project.id, default_category, day_of_month=10)

    service = RecurringTransactionService(test_db)
    first_run = await service._generate_transactions_for_month_for_project(
        project.id, 2024, 4
    )
    second_run = await service._generate_transactions_for_month_for_project(
        project.id, 2024, 4
    )

    assert len(first_run) == 1
    assert second_run == []
    assert len(await _transactions_for(test_db, project.id)) == 1


@pytest.mark.asyncio
async def test_day_of_month_beyond_last_day_falls_back_to_last_day(
    test_db, default_category
):
    """A template for day 31 must bill on 29 February 2024 (leap year),
    and must not be duplicated on a re-run."""
    project = await _make_project(test_db)
    await _make_template(test_db, project.id, default_category, day_of_month=31)

    service = RecurringTransactionService(test_db)
    generated = await service._generate_transactions_for_month_for_project(
        project.id, 2024, 2
    )
    assert len(generated) == 1
    assert generated[0].tx_date == date(2024, 2, 29)

    assert await service._generate_transactions_for_month_for_project(
        project.id, 2024, 2
    ) == []
    assert len(await _transactions_for(test_db, project.id)) == 1


@pytest.mark.asyncio
async def test_existing_transaction_is_not_regenerated(test_db, default_category):
    """A transaction already present for (template, date) suppresses creation."""
    project = await _make_project(test_db)
    template = await _make_template(
        test_db, project.id, default_category, day_of_month=8
    )
    test_db.add(
        Transaction(
            project_id=project.id,
            recurring_template_id=template.id,
            tx_date=date(2024, 5, 8),
            type=TransactionType.EXPENSE.value,
            amount=100,
            category_id=default_category,
            is_generated=True,
        )
    )
    await test_db.commit()

    service = RecurringTransactionService(test_db)
    generated = await service._generate_transactions_for_month_for_project(
        project.id, 2024, 5
    )

    assert generated == []
    assert len(await _transactions_for(test_db, project.id)) == 1


@pytest.mark.asyncio
async def test_pairs_are_preloaded_in_a_single_query(test_db, default_category):
    """The optimization itself: the month run loads existing pairs once, and the
    per-candidate existence query is bypassed (existing_pairs is not None)."""
    project = await _make_project(test_db)
    await _make_template(test_db, project.id, default_category, day_of_month=12)

    service = RecurringTransactionService(test_db)
    seen_pairs_args = []

    original = service._transaction_already_exists

    async def spy(template, target_date, existing_pairs=None):
        seen_pairs_args.append(existing_pairs)
        return await original(template, target_date, existing_pairs)

    service._transaction_already_exists = spy
    await service._generate_transactions_for_month_for_project(project.id, 2024, 6)

    assert seen_pairs_args, "existence check was never consulted"
    assert all(pairs is not None for pairs in seen_pairs_args)


@pytest.mark.asyncio
async def test_try_create_without_preloaded_set_still_works(test_db, default_category):
    """Other call sites pass no existing_pairs; that path must behave as before
    (own existence query, no duplicate on a second call)."""
    project = await _make_project(test_db)
    template = await _make_template(
        test_db, project.id, default_category, day_of_month=3
    )

    service = RecurringTransactionService(test_db)
    first = await service._try_create_transaction_for_template_date(
        template, date(2024, 7, 3)
    )
    assert first is not None
    await test_db.commit()

    second = await service._try_create_transaction_for_template_date(
        template, date(2024, 7, 3)
    )
    assert second is None
    assert len(await _transactions_for(test_db, project.id)) == 1
