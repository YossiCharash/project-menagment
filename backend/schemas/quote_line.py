from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class QuoteLineOutNested(BaseModel):
    """Minimal line info when nested in quote project/building."""
    id: int
    quote_structure_item_id: int
    quote_structure_item_name: str = ""
    amount: float | None = None
    sort_order: int = 0

    model_config = ConfigDict(from_attributes=True)


class QuoteLineCreate(BaseModel):
    quote_structure_item_id: int
    amount: float | None = None
    sort_order: int = 0


class QuoteLineUpdate(BaseModel):
    amount: float | None = None
    sort_order: int | None = None


class QuoteLineOut(BaseModel):
    id: int
    quote_project_id: int | None
    quote_structure_item_id: int
    quote_structure_item_name: str = ""
    amount: float | None = None
    sort_order: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
