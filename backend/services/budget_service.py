from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, timedelta
from typing import List, Dict, Any
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
        end_date: date | None = None
    ) -> Budget:
        """Create a new budget for a project category"""
        # Validate that the category exists in the Category table - ONLY categories from DB are allowed
        resolved_category = await self._resolve_category(category_id=category_id)

        existing_budget = await self.repository.get_by_project_and_category(
            project_id,
            resolved_category.id,  # Pass category_id, function will convert to category name internally
            active_only=True
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
            category=resolved_category.name,  # Store category name as string
            amount=amount,
            period_type=period_type,
            start_date=start_date,
            end_date=end_date,
            is_active=True
        )
        
        return await self.repository.create(budget)

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
        as_of_date: date | None = None
    ) -> List[Dict[str, Any]]:
        """Get all budgets for a project with spending information"""
        budgets = await self.repository.get_active_budgets_for_project(project_id)
        result = []
        
        for budget in budgets:
            budget_data = await self.get_budget_with_spending(budget.id, as_of_date)
            result.append(budget_data)
        
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

