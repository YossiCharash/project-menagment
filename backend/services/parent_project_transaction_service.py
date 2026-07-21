"""Aggregated transaction listing for parent projects.

The parent-project page shows one combined transaction table covering the parent
project and every one of its subprojects. It used to build that table client-side
with ``1 + 1 + N`` HTTP calls (parent transactions, the full project list, then one
``/transactions/project/{id}`` per subproject), each returning *every* transaction
ever recorded and each writing an audit row. This module collapses that into a
single request backed by two queries, with the date filtering done in SQL.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.project import Project
from backend.models.transaction import Transaction


class ParentProjectTransactionNotFoundError(Exception):
    """Raised when the requested parent project does not exist or is inactive."""


class ParentProjectTransactionService:
    """Lists the transactions of a parent project together with its subprojects'."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_with_subprojects(
        self,
        parent_project_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> list[dict]:
        """Return parent + subproject transactions, newest first, labelled by project.

        ``start_date`` / ``end_date`` are inclusive and applied in SQL so the client
        never downloads transactions it is about to discard.

        Raises:
            ParentProjectTransactionNotFoundError: when ``parent_project_id`` does not
                match an active project.
        """
        project_names = await self._load_project_names(parent_project_id)
        transactions = await self._load_transactions(
            list(project_names.keys()), start_date, end_date
        )
        return [
            self._to_dict(transaction, parent_project_id, project_names)
            for transaction in transactions
        ]

    async def _load_project_names(self, parent_project_id: int) -> dict[int, str]:
        """Map {project_id: name} for the parent and all of its active subprojects."""
        result = await self.db.execute(
            select(Project.id, Project.name).where(
                (Project.id == parent_project_id)
                | (
                    (Project.relation_project == parent_project_id)
                    & (Project.is_active == True)  # noqa: E712 - SQL boolean comparison
                )
            )
        )
        names = {row[0]: row[1] for row in result.all()}

        if parent_project_id not in names:
            raise ParentProjectTransactionNotFoundError(
                f"פרויקט אב {parent_project_id} לא נמצא או אינו פעיל"
            )

        return names

    async def _load_transactions(
        self,
        project_ids: list[int],
        start_date: Optional[date],
        end_date: Optional[date],
    ) -> list[Transaction]:
        """Fetch every transaction of the given projects inside the date range."""
        query = select(Transaction).where(Transaction.project_id.in_(project_ids))

        if start_date is not None:
            query = query.where(Transaction.tx_date >= start_date)
        if end_date is not None:
            query = query.where(Transaction.tx_date <= end_date)

        result = await self.db.execute(query.order_by(Transaction.tx_date.desc()))
        return list(result.scalars().all())

    @staticmethod
    def _to_dict(
        transaction: Transaction,
        parent_project_id: int,
        project_names: dict[int, str],
    ) -> dict:
        """Shape one transaction for the parent page's combined table."""
        is_parent_row = transaction.project_id == parent_project_id
        return {
            "id": transaction.id,
            "project_id": transaction.project_id,
            "tx_date": transaction.tx_date.isoformat() if transaction.tx_date else None,
            "type": transaction.type,
            "amount": float(transaction.amount or 0),
            "description": transaction.description,
            "category": transaction.category.name if transaction.category else None,
            "notes": transaction.notes,
            "is_exceptional": transaction.is_exceptional,
            "is_generated": bool(
                transaction.is_generated or transaction.recurring_template_id
            ),
            "from_fund": transaction.from_fund or False,
            # The table's month/year filter treats period transactions by overlap,
            # so these must survive the round trip.
            "period_start_date": (
                transaction.period_start_date.isoformat()
                if transaction.period_start_date
                else None
            ),
            "period_end_date": (
                transaction.period_end_date.isoformat()
                if transaction.period_end_date
                else None
            ),
            "subproject_id": None if is_parent_row else transaction.project_id,
            "subproject_name": project_names.get(transaction.project_id),
        }
