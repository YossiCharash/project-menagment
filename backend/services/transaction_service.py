from __future__ import annotations
from typing import List
import os
from uuid import uuid4
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date

from backend.core.config import settings
from backend.repositories.transaction_repository import TransactionRepository
from backend.models.transaction import Transaction
from backend.services.s3_service import S3Service
from backend.repositories.category_repository import CategoryRepository
from backend.repositories.project_repository import ProjectRepository


class TransactionService:
    def __init__(self, db: AsyncSession):
        self.transactions = TransactionRepository(db)
        self.category_repository = CategoryRepository(db)
        self.db = db  # Store db reference for duplicate checking
        # Keep local directory for backward compatibility (old files)
        os.makedirs(settings.FILE_UPLOAD_DIR, exist_ok=True)

    async def _resolve_category(
        self,
        *,
        category_id: int | None = None,
        category_name: str | None = None,
        allow_missing: bool = False
    ):
        category = None
        if category_id is not None:
            category = await self.category_repository.get(category_id)
            if not category and not allow_missing:
                raise ValueError("קטגוריה שנבחרה לא קיימת יותר במערכת.")
        elif category_name is not None:
            # Fallback for legacy calls using name
            category = await self.category_repository.get_by_name_global(category_name)
            if not category and not allow_missing:
                raise ValueError(f"לא נמצאה קטגוריה בשם '{category_name}'")
        
        if category and not category.is_active:
            raise ValueError(f"קטגוריה '{category.name}' לא פעילה. יש להפעיל את הקטגוריה בהגדרות לפני יצירת העסקה.")
        
        return category

    async def check_duplicate_transaction(
        self,
        project_id: int,
        tx_date: date,
        amount: float,
        supplier_id: int | None = None,
        type: str = "Expense"
    ) -> List[Transaction]:
        """Check for duplicate transactions with same date, amount, and optionally supplier"""
        from sqlalchemy import select, and_
        
        query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.tx_date == tx_date,
                Transaction.amount == amount,
                Transaction.type == type
            )
        )
        
        # If supplier is provided, also match by supplier
        if supplier_id is not None:
            query = query.where(Transaction.supplier_id == supplier_id)
        
        result = await self.transactions.db.execute(query)
        return list(result.scalars().all())

    async def check_period_overlap(
        self,
        project_id: int,
        category_id: int | None,
        period_start: date,
        period_end: date,
        exclude_tx_id: int | None = None
    ):
        from sqlalchemy import select, and_, or_
        
        # Only check if category is set (implied context: "Utility" tracking usually per category)
        if not category_id:
            return

        query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.category_id == category_id,
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                # Overlap condition:
                # (StartA <= EndB) and (EndA >= StartB)
                Transaction.period_start_date <= period_end,
                Transaction.period_end_date >= period_start
            )
        )
        
        if exclude_tx_id:
            query = query.where(Transaction.id != exclude_tx_id)
            
        result = await self.transactions.db.execute(query)
        overlapping = list(result.scalars().all())
        
        if overlapping:
            # Format error
            msg = "נמצאה חפיפה עם עסקאות קיימות לתקופה זו:\n"
            for tx in overlapping:
                msg += f"- {tx.period_start_date} עד {tx.period_end_date} (סכום: {tx.amount})\n"
            raise ValueError(msg)

    async def create(self, **data) -> Transaction:
        # Validate transaction date is not before project contract start date
        project_id = data.get('project_id')
        tx_date = data.get('tx_date')
        
        if project_id and tx_date:
            project_repo = ProjectRepository(self.db)
            project = await project_repo.get_by_id(project_id)
            if project and project.start_date:
                # Convert project.start_date to date if it's datetime
                project_start_date = project.start_date
                if hasattr(project_start_date, 'date'):
                    project_start_date = project_start_date.date()
                
                if tx_date < project_start_date:
                    raise ValueError(
                        f"לא ניתן ליצור עסקה לפני תאריך תחילת החוזה. "
                        f"תאריך תחילת החוזה: {project_start_date.strftime('%d/%m/%Y')}, "
                        f"תאריך העסקה: {tx_date.strftime('%d/%m/%Y')}"
                    )
        
        # Validate category if provided (unless it's a cash register transaction)
        from_fund = data.get('from_fund', False)
        category_id = data.get('category_id')
        
        resolved_category = None
        if category_id is not None:
            resolved_category = await self._resolve_category(
                category_id=category_id,
                allow_missing=from_fund
            )
        elif not from_fund:
            raise ValueError("קטגוריה היא שדה חובה. יש לבחור קטגוריה מהרשימה.")
        
        data['category_id'] = resolved_category.id if resolved_category else None
        
        # Check period overlap if dates provided
        if data.get('period_start_date') and data.get('period_end_date'):
            if data['period_start_date'] > data['period_end_date']:
                raise ValueError("תאריך התחלה חייב להיות לפני תאריך סיום")
                
            await self.check_period_overlap(
                project_id=data['project_id'],
                category_id=data['category_id'],
                period_start=data['period_start_date'],
                period_end=data['period_end_date']
            )

        # Check for duplicate transactions (for invoice payments)
        # Skip check if allow_duplicate is True
        allow_duplicate = data.pop('allow_duplicate', False)
        
        if data.get('type') == 'Expense' and not from_fund and not allow_duplicate:
            duplicates = await self.check_duplicate_transaction(
                project_id=data['project_id'],
                tx_date=data['tx_date'],
                amount=data['amount'],
                supplier_id=data.get('supplier_id'),
                type='Expense'
            )
            if duplicates:
                # Format duplicate details for error message
                duplicate_details = []
                for dup in duplicates:
                    dup_info = f"עסקה #{dup.id} מתאריך {dup.tx_date}"
                    if dup.supplier_id:
                        from backend.repositories.supplier_repository import SupplierRepository
                        supplier_repo = SupplierRepository(self.transactions.db)
                        supplier = await supplier_repo.get(dup.supplier_id)
                        if supplier:
                            dup_info += f" לספק {supplier.name}"
                    duplicate_details.append(dup_info)
                
                raise ValueError(
                    f"⚠️ זוהתה עסקה כפולה!\n\n"
                    f"קיימת עסקה עם אותם פרטים:\n" + "\n".join(duplicate_details) + "\n\n"
                    f"אם זה תשלום שונה, אנא שנה את התאריך או הסכום.\n"
                    f"אם זה אותו תשלום, אנא בדוק את הרשומות הקיימות."
                )
        
        # Create transaction
        tx = Transaction(**data)
        return await self.transactions.create(tx)

    async def attach_file(self, tx: Transaction, file: UploadFile | None) -> Transaction:
        if not file:
            return tx

        # Upload to S3 instead of local filesystem
        import asyncio
        from backend.services.s3_service import S3Service

        # Reset file pointer to beginning
        await file.seek(0)
        
        s3 = S3Service()
        
        # Use run_in_executor/to_thread to avoid blocking event loop with boto3
        # Pass file.file which is the underlying binary file object
        file_url = await asyncio.to_thread(
            s3.upload_file,
            prefix="transactions",
            file_obj=file.file,
            filename=file.filename or "transaction-file",
            content_type=file.content_type,
        )
        # Store full URL
        tx.file_path = file_url
        return await self.transactions.update(tx)

    async def list_by_project(
        self,
        project_id: int,
        user_id: int | None = None
    ) -> List[dict]:
        """
        List transactions for a project with user info and category loaded via JOIN.
        Filters by project's current contract period dates in SQL if they exist.
        Returns list of dicts ready for TransactionOut schema.
        Business logic: Gets project dates and logs audit action.
        """
        from backend.repositories.project_repository import ProjectRepository
        from backend.services.audit_service import AuditService

        # Get project for dates and audit log
        project_repo = ProjectRepository(self.db)
        project = await project_repo.get_by_id(project_id)
        project_name = project.name if project else f"Project {project_id}"

        # Log view action (business logic: audit logging)
        if user_id:
            audit_service = AuditService(self.db)
            await audit_service.log_transaction_action(
                user_id=user_id,
                action='view_list',
                transaction_id=project_id,
                details={'project_id': project_id, 'project_name': project_name}
            )

        # Extract project dates and convert datetime to date if needed
        project_start_date = project.start_date if project else None
        project_end_date = project.end_date if project else None

        if project_start_date and hasattr(project_start_date, 'date'):
            project_start_date = project_start_date.date()
        if project_end_date and hasattr(project_end_date, 'date'):
            project_end_date = project_end_date.date()

        # Get transactions via repository (data layer)
        return await self.transactions.list_by_project_with_users(
            project_id=project_id,
            project_start_date=project_start_date,
            project_end_date=project_end_date
        )