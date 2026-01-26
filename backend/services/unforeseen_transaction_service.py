from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, datetime
from decimal import Decimal

from backend.repositories.unforeseen_transaction_repository import UnforeseenTransactionRepository
from backend.repositories.transaction_repository import TransactionRepository
from backend.repositories.project_repository import ProjectRepository
from backend.repositories.contract_period_repository import ContractPeriodRepository
from backend.models.unforeseen_transaction import UnforeseenTransaction, UnforeseenTransactionStatus
from backend.models.transaction import Transaction, TransactionType
from backend.schemas.unforeseen_transaction import (
    UnforeseenTransactionCreate,
    UnforeseenTransactionUpdate,
    UnforeseenTransactionOut,
    UnforeseenTransactionExpenseOut
)


class UnforeseenTransactionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = UnforeseenTransactionRepository(db)
        self.transaction_repo = TransactionRepository(db)
        self.project_repo = ProjectRepository(db)
        self.contract_period_repo = ContractPeriodRepository(db)

    def calculate_profit_loss(self, income: float, expenses: List[Dict[str, Any]]) -> float:
        """Calculate profit/loss: income - sum of all expenses"""
        total_expenses = sum(exp.get("amount", 0) if isinstance(exp, dict) else getattr(exp, "amount", 0) for exp in expenses)
        return income - total_expenses

    async def create(self, data: UnforeseenTransactionCreate, user_id: Optional[int] = None) -> UnforeseenTransaction:
        """Create a new unforeseen transaction"""
        # Validate project exists
        project = await self.project_repo.get_by_id(data.project_id)
        if not project:
            raise ValueError("פרויקט לא נמצא")
        
        # Validate contract period if provided
        if data.contract_period_id:
            period = await self.contract_period_repo.get_by_id(data.contract_period_id)
            if not period:
                raise ValueError("תקופת חוזה לא נמצאה")
            if period.project_id != data.project_id:
                raise ValueError("תקופת החוזה לא שייכת לפרויקט זה")
        
        return await self.repo.create(data, user_id)

    async def get_by_id(self, tx_id: int) -> Optional[UnforeseenTransaction]:
        """Get an unforeseen transaction by ID"""
        return await self.repo.get_by_id(tx_id)

    async def list_by_project(
        self,
        project_id: int,
        contract_period_id: Optional[int] = None,
        include_executed: bool = True
    ) -> List[Dict[str, Any]]:
        """List unforeseen transactions for a project, formatted for API response"""
        transactions = await self.repo.list_by_project(project_id, contract_period_id)
        
        # Filter out executed if not requested
        if not include_executed:
            transactions = [t for t in transactions if t.status != UnforeseenTransactionStatus.EXECUTED]
        
        result = []
        for tx in transactions:
            result.append(await self._format_transaction(tx))
        
        return result

    async def list_by_contract_period(self, contract_period_id: int) -> List[Dict[str, Any]]:
        """List all unforeseen transactions for a contract period"""
        transactions = await self.repo.list_by_contract_period(contract_period_id)
        result = []
        for tx in transactions:
            result.append(await self._format_transaction(tx))
        return result

    async def _format_transaction(self, tx: UnforeseenTransaction) -> Dict[str, Any]:
        """Format an unforeseen transaction for API response"""
        # Calculate totals using Decimal for precision
        total_expenses = sum(Decimal(str(exp.amount)) for exp in tx.expenses) if tx.expenses else Decimal('0')
        profit_loss = Decimal(str(tx.income_amount)) - total_expenses
        
        # Format expenses - convert Numeric to float with proper precision
        expenses_data = []
        for exp in tx.expenses:
            # SQLAlchemy Numeric returns Decimal, convert via string to preserve precision
            amount_decimal = Decimal(str(exp.amount))
            amount_value = float(amount_decimal)
            expense_dict = {
                "id": exp.id,
                "unforeseen_transaction_id": exp.unforeseen_transaction_id,
                "amount": amount_value,
                "description": exp.description,
                "document_id": exp.document_id,
                "created_at": exp.created_at.isoformat() if exp.created_at else None,
                "updated_at": exp.updated_at.isoformat() if exp.updated_at else None
            }
            
            # Include document info if available
            if exp.document:
                expense_dict["document"] = {
                    "id": exp.document.id,
                    "file_path": exp.document.file_path,
                    "description": exp.document.description,
                    "uploaded_at": exp.document.uploaded_at.isoformat() if exp.document.uploaded_at else None
                }
            
            expenses_data.append(expense_dict)
        
        # Format user info
        user_data = None
        if tx.created_by_user:
            user_data = {
                "id": tx.created_by_user.id,
                "email": tx.created_by_user.email,
                "full_name": tx.created_by_user.full_name if hasattr(tx.created_by_user, "full_name") else None
            }
        
        # SQLAlchemy Numeric returns Decimal, convert via string to preserve precision
        income_decimal = Decimal(str(tx.income_amount))
        income_value = float(income_decimal)
        
        return {
            "id": tx.id,
            "project_id": tx.project_id,
            "contract_period_id": tx.contract_period_id,
            "income_amount": income_value,
            "total_expenses": float(total_expenses),
            "profit_loss": float(profit_loss),
            "status": tx.status.value if hasattr(tx.status, "value") else str(tx.status),
            "description": tx.description,
            "notes": tx.notes,
            "transaction_date": tx.transaction_date.isoformat() if tx.transaction_date else None,
            "expenses": expenses_data,
            "created_by_user_id": tx.created_by_user_id,
            "created_by_user": user_data,
            "created_at": tx.created_at.isoformat() if tx.created_at else None,
            "updated_at": tx.updated_at.isoformat() if tx.updated_at else None,
            "resulting_transaction_id": tx.resulting_transaction_id
        }

    async def update(self, tx_id: int, data: UnforeseenTransactionUpdate, user_id: Optional[int] = None) -> Optional[UnforeseenTransaction]:
        """Update an unforeseen transaction"""
        tx = await self.repo.get_by_id(tx_id)
        if not tx:
            return None
        
        # Validate contract period if provided
        if data.contract_period_id:
            period = await self.contract_period_repo.get_by_id(data.contract_period_id)
            if not period:
                raise ValueError("תקופת חוזה לא נמצאה")
            if period.project_id != tx.project_id:
                raise ValueError("תקופת החוזה לא שייכת לפרויקט זה")
        
        # Store whether transaction was executed before update
        was_executed = tx.status == UnforeseenTransactionStatus.EXECUTED
        
        # Update the transaction
        updated_tx = await self.repo.update(tx, data)
        
        # Reload the transaction with all relationships to ensure fresh data
        updated_tx = await self.repo.get_by_id(tx_id)
        
        # If transaction was executed and has a resulting transaction, update it
        if was_executed and updated_tx.status == UnforeseenTransactionStatus.EXECUTED and updated_tx.resulting_transaction_id:
            # Recalculate profit/loss with updated values
            total_expenses = sum(Decimal(str(exp.amount)) for exp in updated_tx.expenses) if updated_tx.expenses else Decimal('0')
            profit_loss = float(updated_tx.income_amount) - float(total_expenses)
            
            # Get the resulting transaction
            resulting_tx = await self.transaction_repo.get_by_id(updated_tx.resulting_transaction_id)
            if resulting_tx:
                # Update transaction date if it changed
                if updated_tx.transaction_date:
                    resulting_tx.tx_date = updated_tx.transaction_date
                
                # Update the transaction amount and type based on new profit/loss
                if profit_loss != 0:
                    resulting_tx.amount = abs(profit_loss)
                    resulting_tx.type = TransactionType.INCOME.value if profit_loss > 0 else TransactionType.EXPENSE.value
                    # Update description to use the actual description from unforeseen transaction
                    resulting_tx.description = updated_tx.description or "עסקה לא צפויה"
                    # Update notes to reflect the new calculation
                    resulting_tx.notes = f"יתרה מעסקה לא צפויה #{updated_tx.id}" + (f": {updated_tx.description}" if updated_tx.description else "")
                    await self.transaction_repo.update(resulting_tx)
                else:
                    # If profit/loss is now 0, we could delete the transaction
                    # But for safety, we'll just update it to 0 amount
                    resulting_tx.amount = 0
                    await self.transaction_repo.update(resulting_tx)
        
        return updated_tx

    async def delete(self, tx_id: int) -> bool:
        """Delete an unforeseen transaction. If executed, also delete the resulting transaction."""
        tx = await self.repo.get_by_id(tx_id)
        if not tx:
            return False
        
        # If transaction was executed and has a resulting transaction, delete it first
        if tx.status == UnforeseenTransactionStatus.EXECUTED and tx.resulting_transaction_id:
            # Store the transaction ID before removing the reference
            resulting_tx_id = tx.resulting_transaction_id
            
            # Remove the foreign key reference first to avoid constraint violation
            tx.resulting_transaction_id = None
            await self.repo.update(tx, {})
            
            # Now we can safely delete the resulting transaction
            resulting_tx = await self.transaction_repo.get_by_id(resulting_tx_id)
            if resulting_tx:
                await self.transaction_repo.delete(resulting_tx)
        
        return await self.repo.delete(tx)

    async def execute(self, tx_id: int, user_id: Optional[int] = None) -> Optional[Transaction]:
        """
        Execute an unforeseen transaction:
        1. Change status to EXECUTED
        2. Calculate profit/loss
        3. Create a regular transaction with the profit/loss amount
        4. Link the transaction to the unforeseen transaction
        """
        tx = await self.repo.get_by_id(tx_id)
        if not tx:
            return None
        
        if tx.status == UnforeseenTransactionStatus.EXECUTED:
            raise ValueError("עסקה זו כבר בוצעה")
        
        # Calculate profit/loss
        total_expenses = sum(Decimal(str(exp.amount)) for exp in tx.expenses) if tx.expenses else Decimal('0')
        profit_loss = float(tx.income_amount) - float(total_expenses)
        
        # Only create transaction if there's a balance (profit or loss)
        if profit_loss != 0:
            # Create a regular transaction
            transaction_data = {
                "project_id": tx.project_id,
                "tx_date": tx.transaction_date,
                "type": TransactionType.INCOME.value if profit_loss > 0 else TransactionType.EXPENSE.value,
                "amount": abs(profit_loss),
                "description": tx.description or "עסקה לא צפויה",
                "notes": f"יתרה מעסקה לא צפויה #{tx.id}" + (f": {tx.description}" if tx.description else ""),
                "is_exceptional": True,
                "created_by_user_id": user_id
            }
            
            # Create the transaction
            new_transaction = Transaction(**transaction_data)
            new_transaction = await self.transaction_repo.create(new_transaction)
            
            # Update unforeseen transaction
            tx.status = UnforeseenTransactionStatus.EXECUTED
            tx.resulting_transaction_id = new_transaction.id
            await self.repo.update(tx, {})
            
            return new_transaction
        else:
            # No balance, just mark as executed
            tx.status = UnforeseenTransactionStatus.EXECUTED
            await self.repo.update(tx, {})
            return None

