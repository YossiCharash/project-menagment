from datetime import date, datetime
from pydantic import BaseModel, Field, field_validator
from typing import Literal


class TransactionBase(BaseModel):
    project_id: int
    tx_date: date
    type: Literal["Income", "Expense"]
    amount: float
    description: str | None = None
    category_id: int | None = None
    payment_method: str | None = None
    notes: str | None = None
    is_exceptional: bool = False
    supplier_id: int | None = None
    from_fund: bool = False
    allow_duplicate: bool = False
    period_start_date: date | None = None
    period_end_date: date | None = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    tx_date: date | None = None
    type: Literal["Income", "Expense"] | None = None
    amount: float | None = None
    description: str | None = None
    category_id: int | None = None
    payment_method: str | None = None
    notes: str | None = None
    is_exceptional: bool | None = None
    supplier_id: int | None = None
    from_fund: bool | None = None
    allow_duplicate: bool = False
    period_start_date: date | None = None
    period_end_date: date | None = None


class TransactionOut(BaseModel):
    id: int
    project_id: int
    tx_date: date
    type: Literal["Income", "Expense"]
    amount: float  # No validation constraint for response
    description: str | None = None
    category: str | None = None
    category_id: int | None = None
    payment_method: str | None = None

    @field_validator('category', mode='before')
    @classmethod
    def extract_category_name(cls, v):
        # If value is an object with 'name' attribute (e.g. ORM model), return the name
        if hasattr(v, 'name'):
            return v.name
        return v
    notes: str | None = None
    is_exceptional: bool = False
    is_generated: bool = False
    file_path: str | None
    supplier_id: int | None = None
    created_by_user_id: int | None = None
    created_at: datetime
    created_by_user: dict | None = None  # Will contain user info if loaded
    from_fund: bool = False
    recurring_template_id: int | None = None
    period_start_date: date | None = None
    period_end_date: date | None = None

    class Config:
        from_attributes = True
