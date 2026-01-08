from datetime import datetime, date, timedelta
from pydantic import BaseModel, Field, field_serializer
from typing import Optional
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.schemas.recurring_transaction import RecurringTransactionTemplateCreate
    from backend.schemas.budget import BudgetCreateWithoutProject


class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    budget_monthly: float = 0
    budget_annual: float = 0
    manager_id: int | None = None
    relation_project: int | None = None

    num_residents: int | None = None
    monthly_price_per_apartment: float | None = None
    address: str | None = None
    city: str | None = None
    image_url: str | None = None
    is_parent_project: bool = False
    contract_file_url: str | None = None
    
    # Fund fields
    has_fund: bool = False
    monthly_fund_amount: float | None = None


class ProjectCreate(ProjectBase):
    recurring_transactions: Optional[list["RecurringTransactionTemplateCreate"]] = None
    budgets: Optional[list["BudgetCreateWithoutProject"]] = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    budget_monthly: float | None = None
    budget_annual: float | None = None
    manager_id: int | None = None

    num_residents: int | None = None
    monthly_price_per_apartment: float | None = None
    address: str | None = None
    city: str | None = None
    image_url: str | None = None
    contract_file_url: str | None = None
    is_parent_project: bool | None = None
    budgets: Optional[list["BudgetCreateWithoutProject"]] = None
    
    # Fund fields
    has_fund: bool | None = None
    monthly_fund_amount: float | None = None


class ProjectOut(ProjectBase):
    id: int
    is_active: bool = True
    created_at: datetime
    total_value: float = 0.0

    @field_serializer('end_date')
    def serialize_end_date(self, end_date: date | None, _info):
        if end_date:
            return end_date + timedelta(days=1)
        return end_date

    class Config:
        from_attributes = True


# Import for model rebuild
from backend.schemas.recurring_transaction import RecurringTransactionTemplateCreate
from backend.schemas.budget import BudgetCreateWithoutProject

# Rebuild models to resolve forward references
ProjectCreate.model_rebuild()
ProjectUpdate.model_rebuild()
