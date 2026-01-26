from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from datetime import date

from backend.models.unforeseen_transaction import UnforeseenTransaction, UnforeseenTransactionExpense, UnforeseenTransactionStatus
from backend.schemas.unforeseen_transaction import (
    UnforeseenTransactionCreate,
    UnforeseenTransactionUpdate,
    UnforeseenTransactionExpenseCreate
)


class UnforeseenTransactionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: UnforeseenTransactionCreate | dict, user_id: Optional[int] = None) -> UnforeseenTransaction:
        """Create a new unforeseen transaction with expenses"""
        payload = data if isinstance(data, dict) else data.model_dump()
        expenses_data = payload.pop("expenses", [])
        
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
        
        await self.db.commit()
        await self.db.refresh(unforeseen_tx)
        return unforeseen_tx

    async def get_by_id(self, tx_id: int) -> Optional[UnforeseenTransaction]:
        """Get an unforeseen transaction by ID"""
        from sqlalchemy.orm import selectinload
        res = await self.db.execute(
            select(UnforeseenTransaction)
            .options(selectinload(UnforeseenTransaction.expenses))
            .where(UnforeseenTransaction.id == tx_id)
        )
        return res.scalar_one_or_none()

    async def list_by_project(self, project_id: int, contract_period_id: Optional[int] = None) -> List[UnforeseenTransaction]:
        """List all unforeseen transactions for a project, optionally filtered by contract period"""
        from sqlalchemy.orm import selectinload
        query = select(UnforeseenTransaction).options(selectinload(UnforeseenTransaction.expenses)).where(UnforeseenTransaction.project_id == project_id)
        
        if contract_period_id is not None:
            query = query.where(UnforeseenTransaction.contract_period_id == contract_period_id)
        
        query = query.order_by(UnforeseenTransaction.transaction_date.desc(), UnforeseenTransaction.created_at.desc())
        
        res = await self.db.execute(query)
        return list(res.scalars().all())

    async def list_by_contract_period(self, contract_period_id: int) -> List[UnforeseenTransaction]:
        """List all unforeseen transactions for a specific contract period"""
        res = await self.db.execute(
            select(UnforeseenTransaction)
            .where(UnforeseenTransaction.contract_period_id == contract_period_id)
            .order_by(UnforeseenTransaction.transaction_date.desc(), UnforeseenTransaction.created_at.desc())
        )
        return list(res.scalars().all())

    async def update(self, tx: UnforeseenTransaction, data: UnforeseenTransactionUpdate | dict) -> UnforeseenTransaction:
        """Update an unforeseen transaction"""
        update_data = data if isinstance(data, dict) else data.model_dump(exclude_unset=True)
        expenses_data = update_data.pop("expenses", None)
        
        # Update main transaction fields
        for field, value in update_data.items():
            if hasattr(tx, field):
                setattr(tx, field, value)
        
        # Update expenses if provided
        if expenses_data is not None:
            # Delete existing expenses
            existing_expenses_result = await self.db.execute(
                select(UnforeseenTransactionExpense)
                .where(UnforeseenTransactionExpense.unforeseen_transaction_id == tx.id)
            )
            existing_expenses = list(existing_expenses_result.scalars().all())
            for expense in existing_expenses:
                await self.db.delete(expense)
            
            # Create new expenses
            for expense_data in expenses_data:
                expense = UnforeseenTransactionExpense(
                    unforeseen_transaction_id=tx.id,
                    amount=expense_data.get("amount") if isinstance(expense_data, dict) else expense_data.amount,
                    description=expense_data.get("description") if isinstance(expense_data, dict) else expense_data.description
                )
                self.db.add(expense)
        
        await self.db.commit()
        # Capture ID before expiring to avoid async context issues
        tx_id = tx.id
        # Expire the object to force reload from database
        self.db.expire(tx)
        # Reload from database to get fresh relationships including expenses
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
