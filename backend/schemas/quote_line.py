from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class QuoteLineBase(BaseModel):
    quote_structure_item_id: int
    amount: float | None = None
    sort_order: int = 0
    quote_building_id: int | None = None  # when set, line belongs to this building


class QuoteLineCreate(QuoteLineBase):
    pass


class QuoteLineUpdate(BaseModel):
    amount: float | None = None
    sort_order: int | None = None


class QuoteLineOut(QuoteLineBase):
    id: int
    quote_project_id: int
    quote_structure_item_name: str = ""
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
