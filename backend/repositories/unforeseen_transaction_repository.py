from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from backend.models.unforeseen_transaction import (
    UnforeseenTransaction,
    UnforeseenTransactionLine,
    UnforeseenTransactionStatus,
)
from backend.schemas.unforeseen_transaction import (
    UnforeseenTransactionUpdate,
    UnforeseenTransactionCreate,
)


class UnforeseenTransactionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── eager-load helper ────────────────────────────────────────────────────

    def _with_lines(self):
        return (
            selectinload(UnforeseenTransaction.lines).selectinload(UnforeseenTransactionLine.documents),
            selectinload(UnforeseenTransaction.created_by_user),
        )

    # ── create ───────────────────────────────────────────────────────────────

    async def create(self, data: UnforeseenTransactionCreate | dict, user_id: Optional[int] = None) -> UnforeseenTransaction:
        """Create a new unforeseen transaction with lines (expenses and incomes)."""
        payload = data if isinstance(data, dict) else data.model_dump()
        expenses_data = payload.pop("expenses", [])
        incomes_data = payload.pop("incomes", [])

        unforeseen_tx = UnforeseenTransaction(**payload)
        if user_id:
            unforeseen_tx.created_by_user_id = user_id

        self.db.add(unforeseen_tx)
        await self.db.flush()

        for expense_data in expenses_data:
            line = UnforeseenTransactionLine(
                unforeseen_transaction_id=unforeseen_tx.id,
                line_type="expense",
                amount=expense_data.get("amount") if isinstance(expense_data, dict) else expense_data.amount,
                description=expense_data.get("description") if isinstance(expense_data, dict) else expense_data.description,
            )
            self.db.add(line)

        for income_data in incomes_data:
            line = UnforeseenTransactionLine(
                unforeseen_transaction_id=unforeseen_tx.id,
                line_type="income",
                amount=income_data.get("amount") if isinstance(income_data, dict) else income_data.amount,
                description=income_data.get("description") if isinstance(income_data, dict) else income_data.description,
            )
            self.db.add(line)

        await self.db.commit()
        await self.db.refresh(unforeseen_tx)
        return unforeseen_tx

    # ── read ─────────────────────────────────────────────────────────────────

    async def get_by_id(self, tx_id: int) -> Optional[UnforeseenTransaction]:
        res = await self.db.execute(
            select(UnforeseenTransaction)
            .options(*self._with_lines())
            .where(UnforeseenTransaction.id == tx_id)
        )
        return res.scalar_one_or_none()

    async def get_by_resulting_transaction_id(self, resulting_transaction_id: int) -> Optional[UnforeseenTransaction]:
        res = await self.db.execute(
            select(UnforeseenTransaction)
            .options(*self._with_lines())
            .where(UnforeseenTransaction.resulting_transaction_id == resulting_transaction_id)
        )
        return res.scalar_one_or_none()

    async def list_by_project(self, project_id: int, contract_period_id: Optional[int] = None) -> List[UnforeseenTransaction]:
        query = (
            select(UnforeseenTransaction)
            .options(*self._with_lines())
            .where(UnforeseenTransaction.project_id == project_id)
        )
        if contract_period_id is not None:
            query = query.where(UnforeseenTransaction.contract_period_id == contract_period_id)
        query = query.order_by(UnforeseenTransaction.transaction_date.desc(), UnforeseenTransaction.created_at.desc())
        res = await self.db.execute(query)
        return list(res.scalars().all())

    async def list_by_contract_period(self, contract_period_id: int) -> List[UnforeseenTransaction]:
        res = await self.db.execute(
            select(UnforeseenTransaction)
            .options(*self._with_lines())
            .where(UnforeseenTransaction.contract_period_id == contract_period_id)
            .order_by(UnforeseenTransaction.transaction_date.desc(), UnforeseenTransaction.created_at.desc())
        )
        return list(res.scalars().all())

    async def list_executed_by_project(self, project_id: int) -> List[UnforeseenTransaction]:
        res = await self.db.execute(
            select(UnforeseenTransaction)
            .where(
                and_(
                    UnforeseenTransaction.project_id == project_id,
                    UnforeseenTransaction.status == UnforeseenTransactionStatus.EXECUTED,
                )
            )
            .order_by(UnforeseenTransaction.transaction_date.desc())
        )
        return list(res.scalars().all())

    # ── update ────────────────────────────────────────────────────────────────

    async def update(self, tx: UnforeseenTransaction, data: UnforeseenTransactionUpdate | dict) -> UnforeseenTransaction:
        """Update a transaction. Updates lines in-place by index so documents are not lost."""
        update_data = data if isinstance(data, dict) else data.model_dump(exclude_unset=True)
        expenses_data = update_data.pop("expenses", None)
        incomes_data = update_data.pop("incomes", None)

        for field, value in update_data.items():
            if hasattr(tx, field):
                setattr(tx, field, value)

        async def _sync_lines(new_items, line_type: str):
            existing_result = await self.db.execute(
                select(UnforeseenTransactionLine)
                .where(
                    UnforeseenTransactionLine.unforeseen_transaction_id == tx.id,
                    UnforeseenTransactionLine.line_type == line_type,
                )
                .order_by(UnforeseenTransactionLine.id)
            )
            existing = list(existing_result.scalars().all())
            for i, item in enumerate(new_items):
                amount = item.get("amount") if isinstance(item, dict) else item.amount
                description = item.get("description") if isinstance(item, dict) else item.description
                if i < len(existing):
                    existing[i].amount = amount
                    existing[i].description = description
                else:
                    line = UnforeseenTransactionLine(
                        unforeseen_transaction_id=tx.id,
                        line_type=line_type,
                        amount=amount,
                        description=description,
                    )
                    self.db.add(line)
            for j in range(len(new_items), len(existing)):
                await self.db.delete(existing[j])

        if expenses_data is not None:
            await _sync_lines(expenses_data, "expense")
        if incomes_data is not None:
            await _sync_lines(incomes_data, "income")

        await self.db.commit()
        tx_id = tx.id
        self.db.expire(tx)
        return await self.get_by_id(tx_id)

    # ── delete ────────────────────────────────────────────────────────────────

    async def delete(self, tx: UnforeseenTransaction) -> bool:
        await self.db.delete(tx)
        await self.db.commit()
        return True

    # ── line helpers ──────────────────────────────────────────────────────────

    async def get_line_by_id(self, line_id: int) -> Optional[UnforeseenTransactionLine]:
        res = await self.db.execute(
            select(UnforeseenTransactionLine).where(UnforeseenTransactionLine.id == line_id)
        )
        return res.scalar_one_or_none()

    async def get_expense_by_id(self, expense_id: int) -> Optional[UnforeseenTransactionLine]:
        """Get an expense line by ID."""
        res = await self.db.execute(
            select(UnforeseenTransactionLine).where(
                UnforeseenTransactionLine.id == expense_id,
                UnforeseenTransactionLine.line_type == "expense",
            )
        )
        return res.scalar_one_or_none()

    async def get_income_by_id(self, income_id: int) -> Optional[UnforeseenTransactionLine]:
        """Get an income line by ID."""
        res = await self.db.execute(
            select(UnforeseenTransactionLine).where(
                UnforeseenTransactionLine.id == income_id,
                UnforeseenTransactionLine.line_type == "income",
            )
        )
        return res.scalar_one_or_none()

    async def update_expense(self, expense: UnforeseenTransactionLine, data: dict) -> UnforeseenTransactionLine:
        for field, value in data.items():
            if hasattr(expense, field):
                setattr(expense, field, value)
        await self.db.commit()
        await self.db.refresh(expense)
        return expense

    async def delete_expense(self, expense: UnforeseenTransactionLine) -> bool:
        await self.db.delete(expense)
        await self.db.commit()
        return True
