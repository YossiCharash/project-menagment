from datetime import date, datetime
from pydantic import BaseModel, Field, model_validator
from typing import Optional


class BudgetBase(BaseModel):
    category: str = Field(..., description="Expense category (e.g., 'חשמל', 'ניקיון')")
    amount: float = Field(..., gt=0, description="Total budget amount")
    period_type: str = Field(default="Annual", description="'Annual' or 'Monthly'")
    start_date: date = Field(..., description="When budget period starts")
    end_date: Optional[date] = Field(None, description="When budget period ends (for annual budgets)")


class BudgetCreateWithoutProject(BaseModel):
    """Budget creation without project_id - used when creating budgets as part of project creation"""
    category_id: int = Field(..., description="Category ID")
    amount: float = Field(..., gt=0, description="Total budget amount")
    period_type: str = Field(default="Annual", description="'Annual' or 'Monthly'")
    start_date: Optional[date] = Field(None, description="When budget period starts")
    end_date: Optional[date] = Field(None, description="When budget period ends (for annual budgets)")


class BudgetCreate(BudgetBase):
    project_id: int


class BudgetUpdate(BaseModel):
    category: Optional[str] = None
    amount: Optional[float] = Field(None, gt=0)
    period_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None


class BudgetOut(BaseModel):
    id: int
    project_id: int
    category: str
    amount: float
    period_type: str
    start_date: date
    end_date: Optional[date]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BudgetWithSpending(BudgetOut):
    """Budget with calculated spending information"""
    category: str = Field(..., description="Expense category name")
    amount: float = Field(..., description="Effective budget amount (base + income)")
    base_amount: float = 0.0
    period_type: str = Field(default="Annual", description="'Annual' or 'Monthly'")
    start_date: date = Field(..., description="Budget period start date")
    end_date: Optional[date] = Field(None, description="Budget period end date")
    spent_amount: float = 0.0
    expense_amount: float = 0.0
    income_amount: float = 0.0
    remaining_amount: float = 0.0
    spent_percentage: float = 0.0
    expected_spent_percentage: float = 0.0  # Based on time elapsed
    is_over_budget: bool = False
    is_spending_too_fast: bool = False  # Spending faster than time elapsed

