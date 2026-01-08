from __future__ import annotations

from datetime import date, datetime
from pydantic import BaseModel, Field, model_validator
from typing import Literal, Optional, Any


class RecurringTransactionTemplateBase(BaseModel):
    project_id: int
    description: str
    type: Literal["Income", "Expense"]
    amount: float
    category_id: Optional[int] = None
    notes: Optional[str] = None
    supplier_id: int | None = Field(None, description="Supplier ID is required for Expense transactions")
    payment_method: Optional[str] = None
    frequency: Literal["Monthly"] = "Monthly"
    day_of_month: int = Field(ge=1, le=31)
    start_date: date
    end_type: Literal["No End", "After Occurrences", "On Date"] = "No End"
    end_date: Optional[date] = None
    max_occurrences: Optional[int] = Field(None, ge=1)


class RecurringTransactionTemplateCreate(RecurringTransactionTemplateBase):
    category: Optional[str] = None


class RecurringTransactionTemplateUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    category_id: Optional[int] = None
    notes: Optional[str] = None
    supplier_id: Optional[int] = None
    payment_method: Optional[str] = None
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    start_date: Optional[date] = None
    end_type: Optional[Literal["No End", "After Occurrences", "On Date"]] = None
    end_date: Optional[date] = None
    max_occurrences: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None


class RecurringTransactionTemplateOut(BaseModel):
    id: int
    project_id: int
    description: str
    type: Literal["Income", "Expense"]
    amount: float
    category: Optional[str] = None  # Category name for display (from association_proxy)
    category_id: Optional[int] = None
    notes: Optional[str] = None
    supplier_id: int | None = None
    payment_method: Optional[str] = None
    frequency: Literal["Monthly"] = "Monthly"
    day_of_month: int
    start_date: date
    end_type: Literal["No End", "After Occurrences", "On Date"] = "No End"
    end_date: Optional[date] = None
    max_occurrences: Optional[int] = None
    is_active: bool
    created_by_user_id: Optional[int] = None
    created_by_user: Optional[Any] = None  # User object or dict
    created_at: datetime
    updated_at: datetime

    @model_validator(mode='before')
    @classmethod
    def convert_enum_to_string(cls, data: Any) -> Any:
        """Convert Enum objects to their string values for frequency and end_type"""
        if hasattr(data, '__dict__') or hasattr(data, '_sa_instance_state'):
            # Handle SQLAlchemy model objects - use getattr to access attributes
            obj_dict = {}
            for attr in ['id', 'project_id', 'description', 'type', 'amount', 'category', 'category_id', 'notes',
                        'supplier_id', 'payment_method', 'frequency', 'day_of_month', 'start_date', 'end_type', 'end_date',
                        'max_occurrences', 'is_active', 'created_by_user_id', 'created_at', 'updated_at']:
                if hasattr(data, attr):
                    value = getattr(data, attr)
                    if attr == 'frequency' and hasattr(value, 'value'):
                        obj_dict[attr] = value.value
                    elif attr == 'end_type' and hasattr(value, 'value'):
                        obj_dict[attr] = value.value
                    elif attr == 'payment_method' and hasattr(value, 'value'):
                        obj_dict[attr] = value.value
                    else:
                        obj_dict[attr] = value
            
            # Handle created_by_user separately
            if hasattr(data, 'created_by_user'):
                user = getattr(data, 'created_by_user')
                if user:
                    # Simple user info
                    obj_dict['created_by_user'] = {
                        'id': user.id,
                        'email': user.email,
                        'full_name': getattr(user, 'full_name', None) or user.email.split('@')[0]
                    }
                else:
                    obj_dict['created_by_user'] = None

            return obj_dict
        elif isinstance(data, dict):
            # Handle dict objects
            result = dict(data)
            if 'frequency' in result and hasattr(result.get('frequency'), 'value'):
                result['frequency'] = result['frequency'].value
            if 'end_type' in result and hasattr(result.get('end_type'), 'value'):
                result['end_type'] = result['end_type'].value
            if 'payment_method' in result and hasattr(result.get('payment_method'), 'value'):
                result['payment_method'] = result['payment_method'].value
            return result
        return data

    class Config:
        from_attributes = True


class RecurringTransactionTemplateWithTransactions(RecurringTransactionTemplateOut):
    generated_transactions: list["TransactionOut"] = []

    class Config:
        from_attributes = True


class RecurringTransactionInstanceUpdate(BaseModel):
    """For updating individual instances of recurring transactions"""
    tx_date: Optional[date] = None
    amount: Optional[float] = None
    category_id: Optional[int] = None
    notes: Optional[str] = None


# Import TransactionOut for model_rebuild
from backend.schemas.transaction import TransactionOut

# Rebuild models to resolve forward references
RecurringTransactionTemplateWithTransactions.model_rebuild()
