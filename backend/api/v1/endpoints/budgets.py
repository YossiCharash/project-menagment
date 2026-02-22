import logging
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import date
from typing import Optional, List

from backend.core.deps import DBSessionDep, get_current_user
from backend.iam.decorators import require_permission
from backend.schemas.budget import BudgetCreate, BudgetUpdate, BudgetOut, BudgetWithSpending
from backend.services.budget_service import BudgetService
from backend.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/", response_model=BudgetOut)
async def create_budget(
    budget: BudgetCreate,
    db: DBSessionDep,
    current_user: User = Depends(require_permission("write", "budget", project_id_param=None))
):
    """Create a new budget for a project category, optionally linked to a contract period"""
    try:

        service = BudgetService(db)
        
        # Convert category name to category_id
        from backend.repositories.category_repository import CategoryRepository
        category_repo = CategoryRepository(db)
        # Use get_by_name_global to find any category with this name, even subcategories
        category_obj = await category_repo.get_by_name_global(budget.category)
        if not category_obj:
            raise HTTPException(
                status_code=400, 
                detail=f"קטגוריה '{budget.category}' לא נמצאה במערכת. יש לבחור קטגוריה מהרשימה."
            )
        
        # Debug: Print what we're about to pass

        created_budget = await service.create_budget(
            project_id=budget.project_id,
            category_id=category_obj.id,
            amount=budget.amount,
            period_type=budget.period_type,
            start_date=budget.start_date,
            end_date=budget.end_date,
            contract_period_id=budget.contract_period_id
        )
        return BudgetOut.model_validate(created_budget)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error creating budget")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה ביצירת תקציב. נסה שוב.")


@router.get("/project/{project_id}", response_model=List[BudgetWithSpending])
async def get_project_budgets(
    project_id: int,
    db: DBSessionDep,
    contract_period_id: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Get all budgets for a project with spending information, optionally filtered by contract period"""
    try:
        service = BudgetService(db)
        budgets_data = await service.get_project_budgets_with_spending(
            project_id, 
            contract_period_id=contract_period_id
        )
        budgets = [BudgetWithSpending.model_validate(budget_dict) for budget_dict in budgets_data]
        return budgets
    except Exception as e:
        logger.exception(f"Error retrieving budgets for project {project_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה בטעינת תקציבים.")


@router.get("/{budget_id}", response_model=BudgetWithSpending)
async def get_budget(
    budget_id: int,
    db: DBSessionDep,
    current_user: User = Depends(get_current_user)
):
    """Get a specific budget with spending information"""
    try:
        service = BudgetService(db)
        budget_data = await service.get_budget_with_spending(budget_id)
        return BudgetWithSpending.model_validate(budget_data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.exception(f"Error retrieving budget {budget_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה בטעינת תקציב.")


@router.put("/{budget_id}", response_model=BudgetOut)
async def update_budget(
    budget_id: int,
    budget_update: BudgetUpdate,
    db: DBSessionDep,
    current_user: User = Depends(require_permission("update", "budget", resource_id_param="budget_id", project_id_param=None))
):
    """Update a budget"""
    try:
        from backend.repositories.budget_repository import BudgetRepository
        from backend.repositories.category_repository import CategoryRepository
        repository = BudgetRepository(db)
        category_repository = CategoryRepository(db)
        budget = await repository.get_by_id(budget_id)
        
        if not budget:
            raise HTTPException(status_code=404, detail="Budget not found")
        
        if budget_update.category is not None:
            budget.category = budget_update.category
        if budget_update.amount is not None:
            budget.amount = budget_update.amount
        if budget_update.period_type is not None:
            budget.period_type = budget_update.period_type
        if budget_update.start_date is not None:
            budget.start_date = budget_update.start_date
        if budget_update.end_date is not None:
            budget.end_date = budget_update.end_date
        if budget_update.is_active is not None:
            budget.is_active = budget_update.is_active
        
        updated_budget = await repository.update(budget)
        return BudgetOut.model_validate(updated_budget)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating budget {budget_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה בעדכון תקציב.")


@router.delete("/{budget_id}")
async def delete_budget(
    budget_id: int,
    db: DBSessionDep,
    current_user: User = Depends(require_permission("delete", "budget", resource_id_param="budget_id", project_id_param=None))
):
    """Delete a budget"""
    try:
        from backend.repositories.budget_repository import BudgetRepository
        repository = BudgetRepository(db)
        budget = await repository.get_by_id(budget_id)
        
        if not budget:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="תקציב לא נמצא")
        
        await repository.delete(budget)
        return {"message": "Budget deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting budget {budget_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה במחיקת תקציב.")


@router.get("/project/{project_id}/alerts")
async def get_project_budget_alerts(
    project_id: int,
    db: DBSessionDep,
    current_user: User = Depends(get_current_user)
):
    """Get budget alerts for a project"""
    try:
        service = BudgetService(db)
        alerts = await service.check_category_budget_alerts(project_id)
        return {"alerts": alerts}
    except Exception as e:
        logger.exception(f"Error retrieving budget alerts for project {project_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה בטעינת התראות תקציב.")

