from datetime import date, datetime
from pydantic import BaseModel, Field, ConfigDict
from typing import Literal, List, Optional


class UnforeseenTransactionExpenseBase(BaseModel):
    amount: float = Field(gt=0, description="Amount of the expense")
    description: str | None = None


class UnforeseenTransactionExpenseCreate(UnforeseenTransactionExpenseBase):
    pass


class UnforeseenTransactionExpenseUpdate(BaseModel):
    amount: float | None = Field(None, gt=0)
    description: str | None = None
    document_id: int | None = None


class UnforeseenTransactionExpenseOut(BaseModel):
    id: int
    unforeseen_transaction_id: int
    amount: float
    description: str | None = None
    document_id: int | None = None
    document: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UnforeseenTransactionBase(BaseModel):
    project_id: int
    contract_period_id: int | None = None
    income_amount: float = Field(ge=0, description="Amount charged to the project")
    description: str | None = None
    notes: str | None = None
    transaction_date: date = Field(default_factory=date.today)
    expenses: List[UnforeseenTransactionExpenseCreate] = Field(default_factory=list)


class UnforeseenTransactionCreate(UnforeseenTransactionBase):
    pass


class UnforeseenTransactionUpdate(BaseModel):
    contract_period_id: int | None = None
    income_amount: float | None = Field(None, ge=0)
    description: str | None = None
    notes: str | None = None
    transaction_date: date | None = None
    status: Literal["draft", "waiting_for_approval", "executed"] | None = None
    expenses: List[UnforeseenTransactionExpenseCreate] | None = None


class UnforeseenTransactionOut(BaseModel):
    id: int
    project_id: int
    contract_period_id: int | None = None
    income_amount: float
    total_expenses: float
    profit_loss: float  # income - total_expenses
    status: str
    description: str | None = None
    notes: str | None = None
    transaction_date: date
    expenses: List[UnforeseenTransactionExpenseOut] = Field(default_factory=list)
    created_by_user_id: int | None = None
    created_by_user: dict | None = None
    created_at: datetime
    updated_at: datetime
    resulting_transaction_id: int | None = None

    model_config = ConfigDict(from_attributes=True)
