"""
Shared financial calculation utilities.

This module eliminates duplicated period-expense pro-rata logic that was
copy-pasted across ProjectService, ReportService, FinancialAggregationService,
and TransactionRepository. All callers now delegate to these pure functions.

SRP: Each function does exactly one calculation.
DRY: The pro-rata overlap logic exists in one place only.
"""

from __future__ import annotations

from datetime import date


def calculate_proportional_period_amount(
    *,
    amount: float,
    period_start: date,
    period_end: date,
    range_start: date,
    range_end: date,
) -> float:
    """Calculate the proportional amount of a period transaction that falls
    within a given date range.

    Uses daily-rate pro-rata: ``daily_rate * overlap_days``.

    Args:
        amount: Total transaction amount.
        period_start: Transaction period start date.
        period_end: Transaction period end date.
        range_start: Query range start (inclusive).
        range_end: Query range end (inclusive).

    Returns:
        The pro-rated amount for the overlap, or 0.0 if no overlap.
    """
    total_days = (period_end - period_start).days + 1
    if total_days <= 0:
        return 0.0

    daily_rate = amount / total_days

    overlap_start = max(period_start, range_start)
    overlap_end = min(period_end, range_end)
    overlap_days = (overlap_end - overlap_start).days + 1

    if overlap_days <= 0:
        return 0.0

    return daily_rate * overlap_days


def calculate_period_income_and_expense(
    transactions,
    range_start: date,
    range_end: date,
) -> tuple[float, float]:
    """Split a list of period transactions into proportional income and expense.

    Args:
        transactions: Iterable of objects with ``.type``, ``.amount``,
            ``.period_start_date``, ``.period_end_date`` attributes.
        range_start: Query range start (inclusive).
        range_end: Query range end (inclusive).

    Returns:
        Tuple of (total_income, total_expense) for the overlap period.
    """
    income = 0.0
    expense = 0.0

    for tx in transactions:
        proportional = calculate_proportional_period_amount(
            amount=float(tx.amount),
            period_start=tx.period_start_date,
            period_end=tx.period_end_date,
            range_start=range_start,
            range_end=range_end,
        )
        if tx.type == "Income":
            income += proportional
        else:
            expense += proportional

    return income, expense


def determine_profit_status_color(profit_percent: float) -> str:
    """Return a traffic-light status color based on profit percentage.

    This logic was duplicated in ProjectService.get_project_financial_data,
    FinancialAggregationService, and ReportService.
    """
    if profit_percent >= 10:
        return "green"
    if profit_percent <= -10:
        return "red"
    return "yellow"
