from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta

from backend.models.recurring_transaction import RecurringTransactionTemplate
from backend.models.transaction import Transaction, TransactionType, ExpenseCategory
from backend.repositories.recurring_transaction_repository import RecurringTransactionRepository
from backend.repositories.transaction_repository import TransactionRepository
from backend.repositories.category_repository import CategoryRepository
from backend.repositories.project_repository import ProjectRepository
from backend.repositories.contract_period_repository import ContractPeriodRepository
from backend.schemas.recurring_transaction import (
    RecurringTransactionTemplateCreate,
    RecurringTransactionTemplateUpdate,
    RecurringTransactionInstanceUpdate
)


class RecurringTransactionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.recurring_repo = RecurringTransactionRepository(db)
        self.transaction_repo = TransactionRepository(db)
        self.category_repository = CategoryRepository(db)

    async def _resolve_category(
        self,
        *,
        category_id: int | None = None,
        allow_missing: bool = True
    ):
        if category_id is not None:
            category = await self.category_repository.get(category_id)
            if not category and not allow_missing:
                raise ValueError("קטגוריה שנבחרה לא קיימת יותר במערכת.")
        else:
            category = None

        if category and not category.is_active:
            raise ValueError(f"קטגוריה '{category.name}' לא פעילה. יש להפעיל את הקטגוריה בהגדרות לפני יצירת העסקה.")
        return category

    async def create_template(self, data: RecurringTransactionTemplateCreate, user_id: Optional[int] = None) -> RecurringTransactionTemplate:
        """Create a new recurring transaction template"""
        template_data = data.model_dump()
        
        # Validate template start_date is not before FIRST contract start (allow old contracts)
        project_id = template_data.get('project_id')
        start_date = template_data.get('start_date')
        
        if project_id and start_date:
            period_repo = ContractPeriodRepository(self.db)
            first_start = await period_repo.get_earliest_start_date(project_id)
            if first_start is None:
                project_repo = ProjectRepository(self.db)
                project = await project_repo.get_by_id(project_id)
                if project and project.start_date:
                    s = project.start_date
                    first_start = s.date() if hasattr(s, 'date') else s
            if first_start and start_date < first_start:
                raise ValueError(
                    f"לא ניתן ליצור תבנית מחזורית עם תאריך התחלה לפני תאריך תחילת החוזה הראשון. "
                    f"תאריך תחילת החוזה הראשון: {first_start.strftime('%d/%m/%Y')}, "
                    f"תאריך התחלה של התבנית: {start_date.strftime('%d/%m/%Y')}"
                )
        
        # Set the user who created the template
        if user_id:
            template_data['created_by_user_id'] = user_id
        
        # If category_id is missing, try to resolve it from category name if present
        if template_data.get('category_id') is None and template_data.get('category'):
            # Find category by name
            from sqlalchemy import select
            from backend.models.category import Category
            # Using imported Category model
            stmt = select(Category).where(Category.name == template_data['category'])
            result = await self.db.execute(stmt)
            category = result.scalar_one_or_none()
            if category:
                template_data['category_id'] = category.id

        if template_data.get('category_id') is None:
             raise ValueError("קטגוריה היא שדה חובה לעסקאות מחזוריות.")

        resolved_category = await self._resolve_category(
            category_id=template_data.get('category_id'),
            allow_missing=False
        )
        template_data['category_id'] = resolved_category.id if resolved_category else None

        return await self.recurring_repo.create(template_data)

    async def get_template(self, template_id: int) -> Optional[RecurringTransactionTemplate]:
        """Get a recurring transaction template by ID"""
        return await self.recurring_repo.get_by_id(template_id)

    async def list_templates_by_project(self, project_id: int) -> List[RecurringTransactionTemplate]:
        """List all recurring transaction templates for a project"""
        return await self.recurring_repo.list_by_project(project_id)

    async def update_template(self, template_id: int, data: RecurringTransactionTemplateUpdate) -> Optional[RecurringTransactionTemplate]:
        """Update a recurring transaction template"""
        template = await self.recurring_repo.get_by_id(template_id)
        if not template:
            return None
        
        update_data = data.model_dump(exclude_unset=True)

        # Validate start_date is not before FIRST contract start (if updating start_date)
        if 'start_date' in update_data:
            period_repo = ContractPeriodRepository(self.db)
            first_start = await period_repo.get_earliest_start_date(template.project_id)
            if first_start is None:
                project_repo = ProjectRepository(self.db)
                project = await project_repo.get_by_id(template.project_id)
                if project and project.start_date:
                    s = project.start_date
                    first_start = s.date() if hasattr(s, 'date') else s
            if first_start and update_data['start_date'] < first_start:
                raise ValueError(
                    f"לא ניתן לעדכן תבנית מחזורית לתאריך התחלה לפני תאריך תחילת החוזה הראשון. "
                    f"תאריך תחילת החוזה הראשון: {first_start.strftime('%d/%m/%Y')}, "
                    f"תאריך התחלה של התבנית: {update_data['start_date'].strftime('%d/%m/%Y')}"
                )

        if 'category_id' in update_data:
            if update_data['category_id'] is None:
                raise ValueError("לא ניתן להסיר קטגוריה מעסקה מחזורית.")
                
            resolved_category = await self._resolve_category(
                category_id=update_data.get('category_id'),
                allow_missing=False
            )
            update_data['category_id'] = resolved_category.id if resolved_category else None
        
        # Update the template
        updated_template = await self.recurring_repo.update(template, update_data)
        
        # Propagate changes (category, description, notes, supplier, payment_method, amount) to existing generated transactions
        # Note: We update amount as well since the user explicitly chose to update all transactions
        propagate_fields = {}
        if 'category_id' in update_data:
            propagate_fields['category_id'] = update_data['category_id']
        if 'supplier_id' in update_data:
            propagate_fields['supplier_id'] = update_data['supplier_id']
        if 'description' in update_data:
            propagate_fields['description'] = update_data['description']
        if 'notes' in update_data:
            propagate_fields['notes'] = update_data['notes']
        if 'payment_method' in update_data:
            propagate_fields['payment_method'] = update_data['payment_method']
        if 'amount' in update_data:
            propagate_fields['amount'] = update_data['amount']
            
        if propagate_fields:
            try:
                from sqlalchemy import update
                stmt = (
                    update(Transaction)
                    .where(Transaction.recurring_template_id == template_id)
                    .where(Transaction.is_generated == True)
                    .values(**propagate_fields)
                )
                await self.db.execute(stmt)
                await self.db.commit()
            except Exception as e:
                print(f"אזהרה: העברת עדכוני תבנית חוזרת לעסקאות נכשלה: {e}")
                # Don't fail the request, just log it
        
        return updated_template

    async def delete_template(self, template_id: int) -> bool:
        """Delete a recurring transaction template"""
        template = await self.recurring_repo.get_by_id(template_id)
        if not template:
            return False
        
        return await self.recurring_repo.delete(template)

    async def deactivate_template(self, template_id: int) -> Optional[RecurringTransactionTemplate]:
        """Deactivate a recurring transaction template"""
        template = await self.recurring_repo.get_by_id(template_id)
        if not template:
            return None
        
        return await self.recurring_repo.deactivate(template)

    async def _try_create_transaction_for_template_date(
        self,
        template: RecurringTransactionTemplate,
        target_date: date,
        *,
        check_first_contract: bool = False,
    ) -> Optional[Transaction]:
        """
        Check exists/deleted/end/category and optionally first_contract; create one transaction if needed.
        Does not commit; caller must commit. Returns the new transaction or None.

        check_first_contract: If True, skip creating when target_date is before the project's
        first contract start (original behavior only for "day > last_day" last-day-of-month case).
        """
        from sqlalchemy import text

        template_start = template.start_date
        if hasattr(template_start, "date"):
            template_start = template_start.date()
        if template_start and target_date < template_start:
            return None

        try:
            check_query = text("""
                SELECT id FROM transactions
                WHERE recurring_template_id = :template_id AND tx_date = :target_date
                LIMIT 1
            """)
            check_result = await self.db.execute(
                check_query, {"template_id": template.id, "target_date": target_date}
            )
            if check_result.fetchone():
                return None
        except Exception:
            pass

        try:
            from backend.repositories.deleted_recurring_instance_repository import (
                DeletedRecurringInstanceRepository,
            )
            deleted_repo = DeletedRecurringInstanceRepository(self.db)
            if await deleted_repo.is_deleted(template.id, target_date):
                return None
        except Exception:
            pass

        end_type_str = (
            template.end_type.value if hasattr(template.end_type, "value") else str(template.end_type)
        )
        if end_type_str == "On Date" and template.end_date:
            ed = template.end_date
            if hasattr(ed, "date"):
                ed = ed.date()
            if target_date > ed:
                return None

        if not template.category_id:
            return None

        if check_first_contract:
            period_repo = ContractPeriodRepository(self.db)
            first_start = await period_repo.get_earliest_start_date(template.project_id)
            if first_start is None:
                project_repo = ProjectRepository(self.db)
                project = await project_repo.get_by_id(template.project_id)
                if project and project.start_date:
                    s = project.start_date
                    first_start = s.date() if hasattr(s, "date") else s
            if first_start and target_date < first_start:
                return None

        transaction_data = {
            "project_id": template.project_id,
            "recurring_template_id": template.id,
            "tx_date": target_date,
            "type": template.type,
            "amount": template.amount,
            "description": template.description,
            "category_id": template.category_id,
            "notes": template.notes,
            "supplier_id": template.supplier_id,
            "payment_method": template.payment_method,
            "created_by_user_id": template.created_by_user_id,
            "is_generated": True,
        }
        try:
            tx = Transaction(**transaction_data)
            self.db.add(tx)
            return tx
        except Exception:
            fallback = {
                k: v
                for k, v in transaction_data.items()
                if k not in ("recurring_template_id", "is_generated", "payment_method", "created_by_user_id")
            }
            tx = Transaction(**fallback)
            if hasattr(tx, "recurring_template_id"):
                tx.recurring_template_id = transaction_data.get("recurring_template_id")
            if hasattr(tx, "is_generated"):
                tx.is_generated = True
            if hasattr(tx, "payment_method"):
                tx.payment_method = transaction_data.get("payment_method")
            if hasattr(tx, "created_by_user_id"):
                tx.created_by_user_id = transaction_data.get("created_by_user_id")
            self.db.add(tx)
            return tx

    async def generate_transactions_for_date(self, target_date: date) -> List[Transaction]:
        """Generate transactions for a specific date based on active templates"""
        templates = await self.recurring_repo.get_templates_to_generate(target_date)
        generated_transactions = []
        for template in templates:
            try:
                tx = await self._try_create_transaction_for_template_date(template, target_date)
                if tx:
                    generated_transactions.append(tx)
            except Exception:
                raise
        if generated_transactions:
            await self.db.commit()
            for tx in generated_transactions:
                await self.db.refresh(tx)
        return generated_transactions

    async def generate_transactions_for_month(self, year: int, month: int) -> List[Transaction]:
        """Generate all transactions for a specific month"""
        generated_transactions = []
        
        # First, get all active templates to understand what we're working with
        from sqlalchemy import select
        all_active = await self.db.execute(
            select(RecurringTransactionTemplate).where(RecurringTransactionTemplate.is_active == True)
        )
        all_templates = list(all_active.scalars().all())
        
        # Get the number of days in the month
        if month == 12:
            next_month = date(year + 1, 1, 1)
        else:
            next_month = date(year, month + 1, 1)
        
        last_day = (next_month - timedelta(days=1)).day
        
        # Generate transactions for each day of the month
        # Also handle cases where day_of_month > last_day (e.g., template for day 31 in February)
        for day in range(1, last_day + 1):
            target_date = date(year, month, day)
            day_transactions = await self.generate_transactions_for_date(target_date)
            generated_transactions.extend(day_transactions)
        
        # Handle templates with day_of_month > last_day (e.g., day 31 in February)
        last_day_date = date(year, month, last_day)
        for template in all_templates:
            if template.day_of_month > last_day:
                tx = await self._try_create_transaction_for_template_date(
                    template, last_day_date, check_first_contract=True
                )
                if tx:
                    generated_transactions.append(tx)

        if generated_transactions:
            await self.db.commit()
            for tx in generated_transactions:
                await self.db.refresh(tx)
        
        return generated_transactions

    async def _generate_transactions_for_month_for_project(
        self, project_id: int, year: int, month: int
    ) -> List[Transaction]:
        """
        Generate recurring transactions for a single project and month only.
        Uses project-scoped template fetching; single commit per month.
        """
        templates = await self.recurring_repo.list_by_project(project_id)
        active_templates = [t for t in templates if t.is_active]
        if not active_templates:
            return []

        if month == 12:
            next_month = date(year + 1, 1, 1)
        else:
            next_month = date(year, month + 1, 1)
        last_day = (next_month - timedelta(days=1)).day
        generated = []

        for day in range(1, last_day + 1):
            target_date = date(year, month, day)
            day_templates = await self.recurring_repo.get_templates_to_generate(
                target_date, project_id=project_id
            )
            for t in day_templates:
                tx = await self._try_create_transaction_for_template_date(t, target_date)
                if tx:
                    generated.append(tx)

        last_day_date = date(year, month, last_day)
        for t in active_templates:
            if t.day_of_month > last_day:
                tx = await self._try_create_transaction_for_template_date(
                    t, last_day_date, check_first_contract=True
                )
                if tx:
                    generated.append(tx)

        if generated:
            await self.db.commit()
            for tx in generated:
                await self.db.refresh(tx)
        return generated

    async def ensure_project_transactions_generated(self, project_id: int) -> int:
        """
        Ensure all recurring transactions for a project are generated up to current month.
        Only generates missing transactions (skips if already exist).
        Processes each relevant month once (not per template) and only for this project.
        Returns the total number of transactions generated.
        """
        templates = await self.recurring_repo.list_by_project(project_id)
        active_templates = [t for t in templates if t.is_active]
        if not active_templates:
            return 0

        today = date.today()
        months_to_process: set[tuple[int, int]] = set()

        for t in active_templates:
            start = t.start_date
            if not start:
                continue
            if hasattr(start, "date"):
                start = start.date()
            end = today
            if t.end_date:
                ed = t.end_date
                if hasattr(ed, "date"):
                    ed = ed.date()
                end = min(ed, today)
            if start > end:
                continue
            d = start
            while d <= end:
                months_to_process.add((d.year, d.month))
                if d.month == 12:
                    d = date(d.year + 1, 1, 1)
                else:
                    d = date(d.year, d.month + 1, 1)

        total = 0
        for (y, m) in sorted(months_to_process):
            txs = await self._generate_transactions_for_month_for_project(project_id, y, m)
            total += len(txs)
        return total

    async def get_template_transactions(self, template_id: int) -> List[Transaction]:
        """Get all transactions generated from a specific template"""
        # Use raw SQL to avoid AttributeError if column doesn't exist in model
        from sqlalchemy import text
        try:
            # First try with raw SQL to get IDs
            query = text("""
                SELECT id FROM transactions 
                WHERE recurring_template_id = :template_id 
                ORDER BY tx_date DESC
            """)
            result = await self.db.execute(query, {"template_id": template_id})
            tx_ids = [row[0] for row in result.fetchall()]
            
            if not tx_ids:
                return []
            
            # Get full Transaction objects
            res = await self.db.execute(
                select(Transaction).where(Transaction.id.in_(tx_ids)).order_by(Transaction.tx_date.desc())
            )
            return list(res.scalars().all())
        except Exception:
            # Fallback: try without recurring_template_id filter
            return []

    async def update_transaction_instance(self, transaction_id: int, data: RecurringTransactionInstanceUpdate) -> Optional[Transaction]:
        """Update a specific instance of a recurring transaction"""
        transaction = await self.transaction_repo.get_by_id(transaction_id)
        if not transaction:
            return None
        # Check if it's a recurring transaction using raw SQL
        from sqlalchemy import text
        try:
            check_query = text("SELECT recurring_template_id FROM transactions WHERE id = :tx_id")
            check_result = await self.db.execute(check_query, {"tx_id": transaction_id})
            recurring_id = check_result.scalar()
            if not recurring_id:
                return None
        except Exception:
            # If column doesn't exist or error, use getattr as fallback
            if not getattr(transaction, 'recurring_template_id', None):
                return None
        
        update_data = data.model_dump(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(transaction, field, value)
        
        return await self.transaction_repo.update(transaction)

    async def delete_transaction_instance(self, transaction_id: int) -> bool:
        """Delete a specific instance of a recurring transaction"""
        transaction = await self.transaction_repo.get_by_id(transaction_id)
        if not transaction:
            return False
        
        # Check if it's a recurring transaction - either has recurring_template_id or is_generated flag
        is_recurring = (
            getattr(transaction, 'recurring_template_id', None) is not None or
            getattr(transaction, 'is_generated', False) is True
        )
        
        if not is_recurring:
            return False
        
        # Get template_id and tx_date before deletion
        template_id = getattr(transaction, 'recurring_template_id', None)
        tx_date = transaction.tx_date
        
        try:
            # Delete the transaction
            await self.transaction_repo.delete(transaction)
            
            # Record the deletion to prevent regeneration
            if template_id and tx_date:
                try:
                    from backend.repositories.deleted_recurring_instance_repository import DeletedRecurringInstanceRepository
                    deleted_repo = DeletedRecurringInstanceRepository(self.db)
                    # Check if already recorded (shouldn't happen, but be safe)
                    if not await deleted_repo.is_deleted(template_id, tx_date):
                        await deleted_repo.create(template_id, tx_date)
                except Exception as e:
                    # If table doesn't exist yet, log but don't fail
                    # This allows deletion to work even if migration hasn't been run
                    import logging
                    logging.warning(f"לא ניתן לרשום מופע שנמחק (ייתכן שהטבלה לא קיימת): {e}")
            
            return True
        except Exception as e:
            # Log the error for debugging
            import logging
            logging.error(f"שגיאה במחיקת מופע עסקה חוזרת {transaction_id}: {e}")
            return False

    async def get_future_occurrences(self, template_id: int, start_date: date, months_ahead: int = 12) -> List[dict]:
        """Get future occurrences of a recurring transaction template"""
        template = await self.recurring_repo.get_by_id(template_id)
        if not template:
            return []

        occurrences = []
        current_date = start_date
        
        for i in range(months_ahead):
            # Calculate the next occurrence date
            if current_date.day > template.day_of_month:
                # Move to next month
                next_month = current_date + relativedelta(months=1)
                occurrence_date = date(next_month.year, next_month.month, template.day_of_month)
            else:
                # Use current month
                occurrence_date = date(current_date.year, current_date.month, template.day_of_month)
            
            # Check if this occurrence should be generated based on end conditions
            should_generate = True
            
            if template.end_type == "On Date" and template.end_date and occurrence_date > template.end_date:
                should_generate = False
            elif template.end_type == "After Occurrences" and template.max_occurrences:
                # Count existing transactions for this template using raw SQL
                from sqlalchemy import text
                try:
                    count_query = text("""
                        SELECT COUNT(*) FROM transactions 
                        WHERE recurring_template_id = :template_id
                    """)
                    count_result = await self.db.execute(count_query, {"template_id": template_id})
                    existing_count = count_result.scalar() or 0
                except Exception:
                    existing_count = 0
                if existing_count >= template.max_occurrences:
                    should_generate = False
            
            if should_generate:
                occurrences.append({
                    "date": occurrence_date,
                    "amount": template.amount,
                    "description": template.description,
                    "category": template.category,
                    "payment_method": template.payment_method
                })
            
            current_date = occurrence_date + relativedelta(months=1)
        
        return occurrences
