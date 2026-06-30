from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class DeliveryBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    kind: str | None = None
    meta: str | None = None


class DeliveryCreate(DeliveryBase):
    apartment_id: int


class DeliveryUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    kind: str | None = None
    meta: str | None = None
    status: str | None = Field(default=None, pattern="^(pending|delivered)$")


class DeliveryOut(DeliveryBase):
    id: int
    apartment_id: int
    status: str  # pending | delivered
    received_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
