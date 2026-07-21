"""Per-project income/expense totals grouped by category.

The project-list and subproject-list pages draw a small category chart on every
project card. They used to build it by calling ``/transactions/project/{id}``
once per project - downloading every project's full transaction history to
produce a handful of sums. Projects.tsx fired those in parallel, Subprojects.tsx
sequentially (N round trips back to back). This module answers all of them with
one aggregate query.
"""

from __future__ import annotations

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.category import Category
from backend.models.project import Project
from backend.models.transaction import Transaction

UNCATEGORIZED_LABEL = "ללא קטגוריה"


class ProjectCategorySummaryService:
    """Aggregates each active project's transactions into per-category totals."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def summarize_active_projects(self) -> dict[str, list[dict]]:
        """Return {project_id: [{category, income, expense}, ...]} for active projects.

        Keys are strings because the payload is serialised to JSON. Projects with
        no transactions are absent from the mapping; callers treat a miss as an
        empty chart.
        """
        rows = await self._load_totals()
        return self._group_by_project(rows)

    async def _load_totals(self) -> list:
        """One GROUP BY over transactions joined to their project and category."""
        query = (
            select(
                Transaction.project_id,
                Category.name,
                Transaction.type,
                func.coalesce(func.sum(Transaction.amount), 0),
            )
            .join(Project, Project.id == Transaction.project_id)
            .outerjoin(Category, Category.id == Transaction.category_id)
            .where(
                Project.is_active == True,  # noqa: E712 - SQL boolean comparison
                self._within_project_contract_dates(),
            )
            .group_by(Transaction.project_id, Category.name, Transaction.type)
        )
        result = await self.db.execute(query)
        return list(result.all())

    @staticmethod
    def _within_project_contract_dates():
        """Mirror the date scoping that /transactions/project/{id} applies.

        That endpoint keeps a transaction when the project has no contract bounds,
        or when it is a fund transaction, or when it falls inside the bounds, or
        when its own period overlaps them. Reproducing it here keeps the charts
        identical to what the per-project calls used to return.
        """
        has_no_bounds = or_(
            Project.start_date.is_(None),
            Project.end_date.is_(None),
        )
        inside_bounds = and_(
            Transaction.tx_date >= Project.start_date,
            Transaction.tx_date <= Project.end_date,
        )
        period_overlaps_bounds = and_(
            Transaction.period_start_date.is_not(None),
            Transaction.period_end_date.is_not(None),
            Transaction.period_start_date <= Project.end_date,
            Transaction.period_end_date >= Project.start_date,
        )
        return or_(
            has_no_bounds,
            Transaction.from_fund == True,  # noqa: E712 - SQL boolean comparison
            inside_bounds,
            period_overlaps_bounds,
        )

    @staticmethod
    def _group_by_project(rows: list) -> dict[str, list[dict]]:
        """Fold (project, category, type, total) rows into per-project chart points."""
        by_project: dict[str, dict[str, dict]] = {}

        for project_id, category_name, transaction_type, total in rows:
            category = category_name or UNCATEGORIZED_LABEL
            categories = by_project.setdefault(str(project_id), {})
            point = categories.setdefault(
                category, {"category": category, "income": 0.0, "expense": 0.0}
            )
            if transaction_type == "Income":
                point["income"] += float(total or 0)
            else:
                point["expense"] += float(total or 0)

        return {
            project_id: list(categories.values())
            for project_id, categories in by_project.items()
        }
