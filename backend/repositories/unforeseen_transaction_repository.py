from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from datetime import date

from backend.models.unforeseen_transaction import (
    UnforeseenTransaction,
    UnforeseenTransactionExpense,
    UnforeseenTransactionIncome,
    UnforeseenTransactionStatus,
)
from backend.schemas.unforeseen_transaction import (
    UnforeseenTransactionUpdate,
    UnforeseenTransactionCreate,
)


class UnforeseenTransactionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: UnforeseenTransactionCreate | dict, user_id: Optional[int] = None) -> UnforeseenTransaction:
        """Create a new unforeseen transaction with incomes and expenses"""
        payload = data if isinstance(data, dict) else data.model_dump()
        expenses_data = payload.pop("expenses", [])
        incomes_data = payload.pop("incomes", [])
        
        # Create the main transaction
        unforeseen_tx = UnforeseenTransaction(**payload)
        if user_id:
            unforeseen_tx.created_by_user_id = user_id
        
        self.db.add(unforeseen_tx)
        await self.db.flush()  # Flush to get the ID
        
        # Create expenses
        for expense_data in expenses_data:
            expense = UnforeseenTransactionExpense(
                unforeseen_transaction_id=unforeseen_tx.id,
                amount=expense_data.get("amount") if isinstance(expense_data, dict) else expense_data.amount,
                description=expense_data.get("description") if isinstance(expense_data, dict) else expense_data.description
            )
            self.db.add(expense)
            
        # Create incomes
        for income_data in incomes_data:
            income = UnforeseenTransactionIncome(
                unforeseen_transaction_id=unforeseen_tx.id,
                amount=income_data.get("amount") if isinstance(income_data, dict) else income_data.amount,
                description=income_data.get("description") if isinstance(income_data, dict) else income_data.description
            )
            self.db.add(income)
        
        await self.db.commit()
        await self.db.refresh(unforeseen_tx)
        return unforeseen_tx

    async def get_by_id(self, tx_id: int) -> Optional[UnforeseenTransaction]:
        """Get an unforeseen transaction by ID (with relationships eager-loaded for async-safe formatting)"""
        from sqlalchemy.orm import selectinload
        res = await self.db.execute(
            select(UnforeseenTransaction)
            .options(
                selectinload(UnforeseenTransaction.expenses)
                .selectinload(UnforeseenTransactionExpense.documents),
                selectinload(UnforeseenTransaction.incomes)
                .selectinload(UnforeseenTransactionIncome.documents),
                selectinload(UnforeseenTransaction.created_by_user),
            )
            .where(UnforeseenTransaction.id == tx_id)
        )
        return res.scalar_one_or_none()

    async def get_by_resulting_transaction_id(self, resulting_transaction_id: int) -> Optional[UnforeseenTransaction]:
        """Get an unforeseen transaction by the ID of its resulting (created) transaction"""
        from sqlalchemy.orm import selectinload
        res = await self.db.execute(
            select(UnforeseenTransaction)
            .options(
                selectinload(UnforeseenTransaction.expenses)
                .selectinload(UnforeseenTransactionExpense.documents),
                selectinload(UnforeseenTransaction.incomes)
                .selectinload(UnforeseenTransactionIncome.documents),
                selectinload(UnforeseenTransaction.created_by_user),
            )
            .where(UnforeseenTransaction.resulting_transaction_id == resulting_transaction_id)
        )
        return res.scalar_one_or_none()

    async def list_by_project(self, project_id: int, contract_period_id: Optional[int] = None) -> List[UnforeseenTransaction]:
        """List all unforeseen transactions for a project, optionally filtered by contract period"""
        from sqlalchemy.orm import selectinload
        query = select(UnforeseenTransaction).options(
            selectinload(UnforeseenTransaction.expenses)
            .selectinload(UnforeseenTransactionExpense.documents),
            selectinload(UnforeseenTransaction.incomes)
            .selectinload(UnforeseenTransactionIncome.documents)
        ).where(UnforeseenTransaction.project_id == project_id)
        
        if contract_period_id is not None:
            query = query.where(UnforeseenTransaction.contract_period_id == contract_period_id)
        
        query = query.order_by(UnforeseenTransaction.transaction_date.desc(), UnforeseenTransaction.created_at.desc())
        
        res = await self.db.execute(query)
        return list(res.scalars().all())

    async def list_by_contract_period(self, contract_period_id: int) -> List[UnforeseenTransaction]:
        """List all unforeseen transactions for a specific contract period"""
        from sqlalchemy.orm import selectinload
        res = await self.db.execute(
            select(UnforeseenTransaction)
            .options(
                selectinload(UnforeseenTransaction.expenses)
                .selectinload(UnforeseenTransactionExpense.documents),
                selectinload(UnforeseenTransaction.incomes)
                .selectinload(UnforeseenTransactionIncome.documents)
            )
            .where(UnforeseenTransaction.contract_period_id == contract_period_id)
            .order_by(UnforeseenTransaction.transaction_date.desc(), UnforeseenTransaction.created_at.desc())
        )
        return list(res.scalars().all())

    async def update(self, tx: UnforeseenTransaction, data: UnforeseenTransactionUpdate | dict) -> UnforeseenTransaction:
        """Update an unforeseen transaction. Updates expenses/incomes in place by index so documents are not lost."""
        update_data = data if isinstance(data, dict) else data.model_dump(exclude_unset=True)
        expenses_data = update_data.pop("expenses", None)
        incomes_data = update_data.pop("incomes", None)
        
        # Update main transaction fields
        for field, value in update_data.items():
            if hasattr(tx, field):
                setattr(tx, field, value)
        
        # Update expenses in place by index (do not delete/recreate – preserves document links)
        if expenses_data is not None:
            existing_expenses_result = await self.db.execute(
                select(UnforeseenTransactionExpense)
                .where(UnforeseenTransactionExpense.unforeseen_transaction_id == tx.id)
                .order_by(UnforeseenTransactionExpense.id)
            )
            existing_expenses = list(existing_expenses_result.scalars().all())
            for i, expense_data in enumerate(expenses_data):
                amount = expense_data.get("amount") if isinstance(expense_data, dict) else expense_data.amount
                description = expense_data.get("description") if isinstance(expense_data, dict) else expense_data.description
                if i < len(existing_expenses):
                    existing_expenses[i].amount = amount
                    existing_expenses[i].description = description
                else:
                    expense = UnforeseenTransactionExpense(
                        unforeseen_transaction_id=tx.id,
                        amount=amount,
                        description=description
                    )
                    self.db.add(expense)
            # Remove extra expenses (only those beyond new count – their documents CASCADE delete)
            for j in range(len(expenses_data), len(existing_expenses)):
                await self.db.delete(existing_expenses[j])

        # Update incomes in place by index (do not delete/recreate – preserves document links)
        if incomes_data is not None:
            existing_incomes_result = await self.db.execute(
                select(UnforeseenTransactionIncome)
                .where(UnforeseenTransactionIncome.unforeseen_transaction_id == tx.id)
                .order_by(UnforeseenTransactionIncome.id)
            )
            existing_incomes = list(existing_incomes_result.scalars().all())
            for i, income_data in enumerate(incomes_data):
                amount = income_data.get("amount") if isinstance(income_data, dict) else income_data.amount
                description = income_data.get("description") if isinstance(income_data, dict) else income_data.description
                if i < len(existing_incomes):
                    existing_incomes[i].amount = amount
                    existing_incomes[i].description = description
                else:
                    income = UnforeseenTransactionIncome(
                        unforeseen_transaction_id=tx.id,
                        amount=amount,
                        description=description
                    )
                    self.db.add(income)
            for j in range(len(incomes_data), len(existing_incomes)):
                await self.db.delete(existing_incomes[j])
        
        await self.db.commit()
        tx_id = tx.id
        self.db.expire(tx)
        return await self.get_by_id(tx_id)

    async def delete(self, tx: UnforeseenTransaction) -> bool:
        """Delete an unforeseen transaction (cascade will delete expenses)"""
        await self.db.delete(tx)
        await self.db.commit()
        return True

    async def get_expense_by_id(self, expense_id: int) -> Optional[UnforeseenTransactionExpense]:
        """Get an expense by ID"""
        res = await self.db.execute(
            select(UnforeseenTransactionExpense).where(UnforeseenTransactionExpense.id == expense_id)
        )
        return res.scalar_one_or_none()

    async def get_income_by_id(self, income_id: int) -> Optional[UnforeseenTransactionIncome]:
        """Get an income by ID"""
        res = await self.db.execute(
            select(UnforeseenTransactionIncome).where(UnforeseenTransactionIncome.id == income_id)
        )
        return res.scalar_one_or_none()

    async def update_expense(self, expense: UnforeseenTransactionExpense, data: dict) -> UnforeseenTransactionExpense:
        """Update an expense"""
        for field, value in data.items():
            if hasattr(expense, field):
                setattr(expense, field, value)
        
        await self.db.commit()
        await self.db.refresh(expense)
        return expense

    async def delete_expense(self, expense: UnforeseenTransactionExpense) -> bool:
        """Delete an expense"""
        await self.db.delete(expense)
        await self.db.commit()
        return True

    async def list_executed_by_project(self, project_id: int) -> List[UnforeseenTransaction]:
        """List all executed unforeseen transactions for a project"""
        res = await self.db.execute(
            select(UnforeseenTransaction)
            .where(
                and_(
                    UnforeseenTransaction.project_id == project_id,
                    UnforeseenTransaction.status == UnforeseenTransactionStatus.EXECUTED
                )
            )
            .order_by(UnforeseenTransaction.transaction_date.desc())
        )
        return list(res.scalars().all())
