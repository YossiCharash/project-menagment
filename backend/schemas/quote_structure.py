from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class QuoteStructureItemBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    sort_order: int = 0


class QuoteStructureItemCreate(QuoteStructureItemBase):
    pass


class QuoteStructureItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    sort_order: int | None = None
    is_active: bool | None = None


class QuoteStructureItemOut(QuoteStructureItemBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
