from datetime import datetime
from pydantic import BaseModel, ConfigDict


class QuoteSubjectBase(BaseModel):
    address: str | None = None
    num_apartments: int | None = None
    num_buildings: int | None = None
    notes: str | None = None


class QuoteSubjectCreate(QuoteSubjectBase):
    pass


class QuoteSubjectUpdate(BaseModel):
    address: str | None = None
    num_apartments: int | None = None
    num_buildings: int | None = None
    notes: str | None = None


class QuoteSubjectOut(QuoteSubjectBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
