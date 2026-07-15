"""Regression test: the report's fund balance must match the fund panel.

Reproduces the reported bug where the fund panel (screen) showed 5,634.67 while
the generated report showed the raw stored balance 5,581.67. Both must now agree
because they share FundService.compute_normalized_balance.
"""
from datetime import date

import pytest

from backend.models.project import Project
from backend.models.transaction import Transaction
from backend.services.fund_service import FundService


@pytest.mark.asyncio
async def test_normalized_balance_matches_panel(test_db):
    # Project with a 12-month contract starting 2025-11-01
    project = Project(name="שמעון פרס מודיעין", start_date=date(2025, 11, 1))
    test_db.add(project)
    await test_db.commit()
    await test_db.refresh(project)

    # Fund: monthly deposit 1178, stored balance drifted to 5,581.67
    # (implies a -53 initial balance the panel clamps to 0).
    fund_service = FundService(test_db)
    fund = await fund_service.create_fund(
        project_id=project.id, monthly_amount=1178.0, initial_balance=5581.67
    )

    # Fund expenses summing to 4,967.33 (subset of the real report).
    expenses = [500.00, 120.00, 450.00, 737.50, 163.13, 436.00, 300.00,
                265.50, 400.00, 55.00, 220.00, 55.00, 1100.00, 165.20]
    for amt in expenses:
        test_db.add(Transaction(
            project_id=project.id, type="Expense", amount=amt,
            from_fund=True, tx_date=date(2025, 12, 1), description="expense",
        ))
    await test_db.commit()

    # Freeze "today" so monthly additions = 9 occurrences (Nov..Jul).
    import backend.services.fund_service as fs_mod
    import backend.services.project_service as ps_mod

    class _FrozenDate(date):
        @classmethod
        def today(cls):
            return date(2026, 7, 15)

    orig_fs_date, orig_ps_date = fs_mod.date, ps_mod.date
    fs_mod.date = _FrozenDate
    ps_mod.date = _FrozenDate
    try:
        result = await fund_service.compute_normalized_balance(project.id, persist=True)
    finally:
        fs_mod.date = orig_fs_date
        ps_mod.date = orig_ps_date

    # 9 * 1178 - 4967.33 = 5634.67 (the value shown on screen), NOT the raw 5581.67.
    assert result is not None
    assert round(result["total_monthly_additions"], 2) == 10602.00
    assert round(result["total_deductions"], 2) == 4967.33
    assert round(result["current_balance"], 2) == 5634.67
    # persist=True must have synced the stored balance too.
    assert round(float(result["fund"].current_balance), 2) == 5634.67
