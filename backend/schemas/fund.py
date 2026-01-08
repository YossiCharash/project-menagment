from datetime import datetime, date
from pydantic import BaseModel
from typing import Optional


class FundBase(BaseModel):
    project_id: int
    current_balance: float = 0
    monthly_amount: float = 0
    last_monthly_addition: date | None = None


class FundCreate(FundBase):
    pass


class FundUpdate(BaseModel):
    current_balance: float | None = None
    monthly_amount: float | None = None
    last_monthly_addition: date | None = None


class FundOut(FundBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FundWithTransactions(FundOut):
    transactions: list[dict] = []  # List of transactions from fund
