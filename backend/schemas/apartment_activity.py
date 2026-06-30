from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class ApartmentActivityBase(BaseModel):
    kind: str = Field(min_length=1, max_length=32)  # tenant_changed | key_out | key_in | delivery | task
    text: str = Field(min_length=1)


class ApartmentActivityCreate(ApartmentActivityBase):
    apartment_id: int


class ApartmentActivityOut(ApartmentActivityBase):
    id: int
    apartment_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
