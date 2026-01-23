from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, timedelta
from typing import List, Dict, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.models.contract_period import ContractPeriod
from backend.models.budget import Budget
from backend.repositories.budget_repository import BudgetRepository
from backend.repositories.category_repository import CategoryRepository


class BudgetService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = BudgetRepository(db)
        self.category_repository = CategoryRepository(db)

    async def _resolve_category(
        self,
        *,
        category_id: int
    ):
        """Resolve category by ID."""
        if category_id is None:
            raise ValueError("קטגוריה היא שדה חובה. יש לבחור קטגוריה מהרשימה.")
        
        category = await self.category_repository.get(category_id)
        if not category:
            raise ValueError("קטגוריה שנבחרה לא קיימת יותר במערכת.")

        if not category.is_active:
            raise ValueError(
                f"קטגוריה '{category.name}' לא פעילה. יש להפעיל את הקטגוריה בהגדרות לפני יצירת תקציב."
            )
        return category

    async def create_budget(
        self,
        project_id: int,
        amount: float,
        category_id: int,
        period_type: str = "Annual",
        start_date: date | None = None,
        end_date: date | None = None,
        contract_period_id: int | None = None
    ) -> Budget:
        """Create a new budget for a project category, optionally linked to a contract period"""
        # Validate that the category exists in the Category table - ONLY categories from DB are allowed
        resolved_category = await self._resolve_category(category_id=category_id)

        # Check for existing budget in the same contract period (or no contract period)
        existing_budget = await self.repository.get_by_project_and_category(
            project_id,
            resolved_category.id,  # Pass category_id, function will convert to category name internally
            active_only=True,
            contract_period_id=contract_period_id
        )
        if existing_budget:
            raise ValueError(
                f"לפרויקט כבר מוגדר תקציב פעיל עבור הקטגוריה '{resolved_category.name}'. יש לערוך או למחוק את התקציב הקיים מתוך דף פרטי הפרויקט."
            )
        
        if start_date is None:
            start_date = date.today()
        
        # For annual budgets, set end_date to one year from start_date
        if period_type == "Annual" and end_date is None:
            end_date = start_date.replace(year=start_date.year + 1) - timedelta(days=1)
        
        budget = Budget(
            project_id=project_id,
            contract_period_id=contract_period_id,
            category=resolved_category.name,  # Store category name as string
            amount=amount,
            period_type=period_type,
            start_date=start_date,
            end_date=end_date,
            is_active=True
        )
        
        created_budget = await self.repository.create(budget)
        
        # If budget was created in a historical period, also copy it to the current period
        # This ensures that budgets created in past periods are available in the current period
        if contract_period_id is not None:
            from backend.repositories.contract_period_repository import ContractPeriodRepository
            from backend.repositories.project_repository import ProjectRepository
            
            contract_repo = ContractPeriodRepository(self.db)
            project_repo = ProjectRepository(self.db)
            
            # Get all periods for this project
            all_periods = await contract_repo.get_by_project(project_id)
            
            # Find the current period (the one whose start_date matches project.start_date)
            project = await project_repo.get_by_id(project_id)
            
            current_period = None
            if project and project.start_date and all_periods:
                for period in all_periods:
                    if period.start_date == project.start_date:
                        current_period = period
                        break
            
            # If we found a current period and it's different from the one where we created the budget
            if current_period and current_period.id != contract_period_id:
                # Check if this category already exists in the current period
                existing_budgets = await self.repository.get_active_budgets_for_project(
                    project_id, contract_period_id=current_period.id
                )
                category_exists = any(bg.category == resolved_category.name for bg in existing_budgets)
                
                if not category_exists:
                    # Copy the budget to the current period
                    new_start = current_period.start_date
                    new_end_date = None
                    if period_type == "Annual":
                        new_end_date = new_start.replace(year=new_start.year + 1) - timedelta(days=1)
                    
                    new_budget = Budget(
                        project_id=project_id,
                        contract_period_id=current_period.id,
                        category=resolved_category.name,
                        amount=amount,
                        period_type=period_type,
                        start_date=new_start,
                        end_date=new_end_date,
                        is_active=True,
                    )
                    await self.repository.create(new_budget)
                    print(f"✓ [BUDGET AUTO-COPY] Copied budget '{resolved_category.name}' (amount: {amount}) from period {contract_period_id} to current period {current_period.id}")
        
        return created_budget

    async def copy_budgets_to_new_period(
        self,
        project_id: int,
        from_period_id: int | None,
        to_period: "ContractPeriod",
    ) -> int:
        """
        Copy all budgets that were ever created in the project to a new period.
        Takes the most recent budget for each category (active or inactive) from any period.
        Used when a new year/contract starts so budgets "restart" with the same definitions.
        Returns the number of budgets copied.
        """
        # Get ALL budgets for the project (including inactive ones) - this ensures we get
        # every budget that was ever created, regardless of which period it belongs to
        all_budgets = await self.repository.list_by_project(project_id, active_only=False)
        
        if not all_budgets:
            print(f"⚠️ [BUDGET COPY] No budgets found for project {project_id}")
            return 0
        
        # Group by category and take the most recent budget for each category
        # This ensures we copy the latest version of each budget category
        from collections import OrderedDict
        budgets_by_category = OrderedDict()
        for budget in sorted(all_budgets, key=lambda b: b.created_at, reverse=True):
            if budget.category not in budgets_by_category:
                budgets_by_category[budget.category] = budget
        
        source_budgets = list(budgets_by_category.values())
        
        if not source_budgets:
            print(f"⚠️ [BUDGET COPY] No unique budget categories found for project {project_id}")
            return 0

        new_start = to_period.start_date
        count = 0
        
        # Get existing budgets for the new period to avoid duplicates
        existing_budgets = await self.repository.get_active_budgets_for_project(
            project_id, contract_period_id=to_period.id
        )
        existing_categories = {bg.category for bg in existing_budgets}
        
        for b in source_budgets:
            # Check if a budget for this category already exists in the new period
            if b.category in existing_categories:
                print(f"ℹ️ [BUDGET COPY] Budget for category '{b.category}' already exists in period {to_period.id}, skipping")
                continue
            
            end_date = None
            if b.period_type == "Annual":
                end_date = new_start.replace(year=new_start.year + 1) - timedelta(days=1)
            new_budget = Budget(
                project_id=project_id,
                contract_period_id=to_period.id,
                category=b.category,
                amount=b.amount,
                period_type=b.period_type,
                start_date=new_start,
                end_date=end_date,
                is_active=True,
            )
            await self.repository.create(new_budget)
            count += 1
            print(f"✓ [BUDGET COPY] Copied budget '{b.category}' (amount: {b.amount}) to period {to_period.id}")
        
        if count > 0:
            print(f"✓ [BUDGET COPY] Successfully copied {count} budget(s) to period {to_period.id} (project {project_id})")
        else:
            print(f"⚠️ [BUDGET COPY] No new budgets copied to period {to_period.id} (project {project_id}) - all categories already exist")
        
        return count

    async def get_budget_with_spending(
        self, 
        budget_id: int,
        as_of_date: date | None = None
    ) -> Dict[str, Any]:
        """Get budget with calculated spending information"""
        budget = await self.repository.get_by_id(budget_id)
        if not budget:
            raise ValueError(f"Budget {budget_id} not found")
        
        if as_of_date is None:
            as_of_date = date.today()
        
        # Calculate spending breakdown
        total_expenses, total_income = await self.repository.calculate_spending_for_budget(budget, as_of_date)
        # Ensure values are floats, not None
        total_expenses = float(total_expenses) if total_expenses is not None else 0.0
        total_income = float(total_income) if total_income is not None else 0.0
        base_amount = float(budget.amount) if budget.amount is not None else 0.0
        effective_amount = base_amount + total_income
        remaining_amount = effective_amount - total_expenses
        
        # Calculate percentages
        spent_percentage = (total_expenses / effective_amount * 100) if effective_amount > 0 else 0
        
        # Calculate expected spending based on time elapsed
        if budget.period_type == "Annual" and budget.end_date:
            total_days = (budget.end_date - budget.start_date).days + 1
            days_elapsed = max(0, (as_of_date - budget.start_date).days + 1)
            if total_days > 0:
                expected_spent_percentage = min((days_elapsed / total_days) * 100, 100)
            else:
                expected_spent_percentage = 0
        elif budget.period_type == "Monthly":
            # For monthly budgets, assume 30 days per month
            total_days = 30
            days_elapsed = max(0, (as_of_date - budget.start_date).days + 1)
            if total_days > 0:
                expected_spent_percentage = min((days_elapsed / total_days) * 100, 100)
            else:
                expected_spent_percentage = 0
        else:
            expected_spent_percentage = 0
        
        # Check if over budget
        is_over_budget = total_expenses > effective_amount
        
        # Check if spending too fast (spent more than expected based on time)
        # Allow 10% buffer before alerting
        is_spending_too_fast = spent_percentage > (expected_spent_percentage + 10)
        
        from datetime import datetime as dt
        # Convert dates/datetimes to ISO format strings for JSON serialization
        start_date_str = budget.start_date.isoformat() if isinstance(budget.start_date, date) else str(budget.start_date)
        end_date_str = budget.end_date.isoformat() if budget.end_date and isinstance(budget.end_date, date) else (budget.end_date.isoformat() if budget.end_date else None)
        created_at_str = budget.created_at.isoformat() if isinstance(budget.created_at, dt) else str(budget.created_at)
        updated_at_str = budget.updated_at.isoformat() if isinstance(budget.updated_at, dt) else str(budget.updated_at)
        
        return {
            "id": budget.id,
            "project_id": budget.project_id,
            "category": budget.category,
            "base_amount": base_amount,
            "amount": effective_amount,
            "period_type": budget.period_type,
            "start_date": start_date_str,
            "end_date": end_date_str,
            "is_active": budget.is_active,
            "created_at": created_at_str,
            "updated_at": updated_at_str,
            "spent_amount": total_expenses,
            "expense_amount": total_expenses,
            "income_amount": total_income,
            "remaining_amount": remaining_amount,
            "spent_percentage": round(spent_percentage, 2),
            "expected_spent_percentage": round(expected_spent_percentage, 2),
            "is_over_budget": is_over_budget,
            "is_spending_too_fast": is_spending_too_fast
        }

    async def get_project_budgets_with_spending(
        self,
        project_id: int,
        as_of_date: date | None = None,
        contract_period_id: int | None = None
    ) -> List[Dict[str, Any]]:
        """Get all budgets for a project with spending information, optionally filtered by contract period"""
        budgets = await self.repository.get_active_budgets_for_project(project_id, contract_period_id=contract_period_id)
        result = []
        
        for budget in budgets:
            budget_data = await self.get_budget_with_spending(budget.id, as_of_date)
            result.append(budget_data)
        
        return result

    async def get_project_budgets_for_period(
        self,
        project_id: int,
        start_date: date | None = None,
        end_date: date | None = None
    ) -> List[Dict[str, Any]]:
        """Get all budgets for a project with spending calculated for a specific period.
        Unlike get_project_budgets_with_spending, this filters spending by the given date range.
        """
        from sqlalchemy import select, and_, func, or_
        from backend.models.transaction import Transaction
        from backend.models.category import Category
        
        budgets = await self.repository.get_active_budgets_for_project(project_id)
        
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = date(end_date.year, 1, 1)  # Default to start of year
        
        result = []
        
        for budget in budgets:
            # Get category IDs for this budget
            category_result = await self.db.execute(
                select(Category.id).where(Category.name == budget.category)
            )
            category_ids = list(category_result.scalars().all())
            
            if not category_ids:
                continue
            
            # Calculate spending for the specified period (not budget period)
            # 1. Regular expenses in the specified date range
            regular_expenses_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                and_(
                    Transaction.project_id == project_id,
                    Transaction.type == "Expense",
                    Transaction.category_id.in_(category_ids),
                    Transaction.tx_date >= start_date,
                    Transaction.tx_date <= end_date,
                    Transaction.from_fund == False,
                    or_(
                        Transaction.period_start_date.is_(None),
                        Transaction.period_end_date.is_(None)
                    )
                )
            )
            
            regular_expenses_result = await self.db.execute(regular_expenses_query)
            total_expenses = float(regular_expenses_result.scalar_one() or 0.0)
            
            # 2. Period expenses that overlap with the specified range
            period_expenses_query = select(Transaction).where(
                and_(
                    Transaction.project_id == project_id,
                    Transaction.type == "Expense",
                    Transaction.category_id.in_(category_ids),
                    Transaction.from_fund == False,
                    Transaction.period_start_date.is_not(None),
                    Transaction.period_end_date.is_not(None),
                    Transaction.period_start_date <= end_date,
                    Transaction.period_end_date >= start_date
                )
            )
            
            period_expenses = (await self.db.execute(period_expenses_query)).scalars().all()
            
            for tx in period_expenses:
                total_days = (tx.period_end_date - tx.period_start_date).days + 1
                if total_days <= 0:
                    continue
                
                daily_rate = float(tx.amount) / total_days
                overlap_start = max(tx.period_start_date, start_date)
                overlap_end = min(tx.period_end_date, end_date)
                overlap_days = (overlap_end - overlap_start).days + 1
                
                if overlap_days > 0:
                    total_expenses += daily_rate * overlap_days
            
            # Calculate budget amount for the period (pro-rata if needed)
            budget_amount = float(budget.amount) if budget.amount else 0.0
            
            # For annual budgets, pro-rate if the period is shorter than a year
            if budget.period_type == "Annual" and budget.start_date and budget.end_date:
                budget_total_days = (budget.end_date - budget.start_date).days + 1
                period_days = (end_date - start_date).days + 1
                if budget_total_days > 0:
                    # Pro-rate the budget for the period
                    budget_amount = budget_amount * (period_days / budget_total_days)
            elif budget.period_type == "Monthly":
                # Calculate number of months in the period
                from dateutil.relativedelta import relativedelta
                months_in_period = ((end_date.year - start_date.year) * 12 + 
                                   (end_date.month - start_date.month) + 1)
                budget_amount = budget_amount * months_in_period
            
            remaining_amount = budget_amount - total_expenses
            spent_percentage = (total_expenses / budget_amount * 100) if budget_amount > 0 else 0
            
            result.append({
                "id": budget.id,
                "project_id": budget.project_id,
                "category": budget.category,
                "amount": round(budget_amount, 2),
                "base_amount": float(budget.amount) if budget.amount else 0.0,
                "period_type": budget.period_type,
                "spent_amount": round(total_expenses, 2),
                "remaining_amount": round(remaining_amount, 2),
                "spent_percentage": round(spent_percentage, 2),
                "is_over_budget": total_expenses > budget_amount,
                "period_start": start_date.isoformat(),
                "period_end": end_date.isoformat()
            })
        
        return result

    async def check_category_budget_alerts(
        self,
        project_id: int,
        as_of_date: date | None = None
    ) -> List[Dict[str, Any]]:
        """Check for budget alerts for all categories in a project"""
        budgets = await self.get_project_budgets_with_spending(project_id, as_of_date)
        alerts = []
        
        for budget_data in budgets:
            if budget_data["is_over_budget"] or budget_data["is_spending_too_fast"]:
                alerts.append({
                    "project_id": project_id,
                    "budget_id": budget_data["id"],
                    "category": budget_data["category"],
                    "amount": budget_data["amount"],
                    "spent_amount": budget_data["spent_amount"],
                    "spent_percentage": budget_data["spent_percentage"],
                    "expected_spent_percentage": budget_data["expected_spent_percentage"],
                    "is_over_budget": budget_data["is_over_budget"],
                    "is_spending_too_fast": budget_data["is_spending_too_fast"],
                    "alert_type": "over_budget" if budget_data["is_over_budget"] else "spending_too_fast"
                })
        
        return alerts

    def calculate_budgets_from_transactions(
        self,
        budgets: List[Budget],
        transactions: List[Dict[str, Any]],
        start_date: date | None = None,
        end_date: date | None = None
    ) -> List[Dict[str, Any]]:
        """
        OPTIMIZED: Calculate budget spending from already-fetched transactions.
        This avoids N queries per budget and calculates everything in memory.
        
        Args:
            budgets: List of Budget model objects
            transactions: List of transaction dicts (already fetched)
            start_date: Period start date for filtering
            end_date: Period end date for filtering
            
        Returns:
            List of budget dicts with spending calculated
        """
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = date(end_date.year, 1, 1)
        
        # Group expenses by category
        expenses_by_category: Dict[str, float] = {}
        
        for tx in transactions:
            # Skip fund transactions
            if tx.get('from_fund', False):
                continue
            # Only expenses
            if tx.get('type') != 'Expense':
                continue
            
            cat_name = tx.get('category') or "כללי"
            amount = float(tx.get('amount', 0) or 0)
            tx_date = tx.get('tx_date')
            period_start = tx.get('period_start_date')
            period_end = tx.get('period_end_date')
            
            # Convert string dates if needed
            if isinstance(tx_date, str):
                try:
                    tx_date = date.fromisoformat(tx_date.split('T')[0])
                except:
                    continue
            if isinstance(period_start, str):
                try:
                    period_start = date.fromisoformat(period_start.split('T')[0])
                except:
                    period_start = None
            if isinstance(period_end, str):
                try:
                    period_end = date.fromisoformat(period_end.split('T')[0])
                except:
                    period_end = None
            
            # Calculate amount for this period
            if period_start and period_end:
                # Pro-rata calculation
                total_days = (period_end - period_start).days + 1
                if total_days <= 0:
                    continue
                
                daily_rate = amount / total_days
                overlap_start = max(period_start, start_date)
                overlap_end = min(period_end, end_date)
                overlap_days = (overlap_end - overlap_start).days + 1
                
                if overlap_days > 0:
                    amount = daily_rate * overlap_days
                else:
                    continue
            else:
                # Regular transaction - check date range
                if not tx_date or not (start_date <= tx_date <= end_date):
                    continue
            
            expenses_by_category[cat_name] = expenses_by_category.get(cat_name, 0.0) + amount
        
        # Calculate budget data for each budget
        result = []
        for budget in budgets:
            budget_category = budget.category
            if not budget_category:
                continue
            
            # Get expenses for this category
            total_expenses = expenses_by_category.get(budget_category, 0.0)
            base_amount = float(budget.amount or 0)
            
            # Calculate budget amount for the period (pro-rata if needed)
            budget_amount = base_amount
            
            if budget.period_type == "Annual" and budget.start_date and budget.end_date:
                budget_total_days = (budget.end_date - budget.start_date).days + 1
                period_days = (end_date - start_date).days + 1
                if budget_total_days > 0:
                    budget_amount = base_amount * (period_days / budget_total_days)
            elif budget.period_type == "Monthly":
                months_in_period = ((end_date.year - start_date.year) * 12 + 
                                   (end_date.month - start_date.month) + 1)
                budget_amount = base_amount * months_in_period
            
            remaining_amount = budget_amount - total_expenses
            spent_percentage = (total_expenses / budget_amount * 100) if budget_amount > 0 else 0
            
            result.append({
                "id": budget.id,
                "project_id": budget.project_id,
                "category": budget_category,
                "amount": round(budget_amount, 2),
                "base_amount": base_amount,
                "period_type": budget.period_type,
                "spent_amount": round(total_expenses, 2),
                "remaining_amount": round(remaining_amount, 2),
                "spent_percentage": round(spent_percentage, 2),
                "is_over_budget": total_expenses > budget_amount,
                "period_start": start_date.isoformat(),
                "period_end": end_date.isoformat()
            })
        
        return result
