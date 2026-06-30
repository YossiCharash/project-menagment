from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class KeyTransferOut(BaseModel):
    id: int
    key_id: int
    direction: str  # out | return
    counterparty_name: str
    note: str | None = None
    created_by_user_id: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ApartmentKeyBase(BaseModel):
    label: str = Field(min_length=1, max_length=255)


class ApartmentKeyCreate(ApartmentKeyBase):
    apartment_id: int


class ApartmentKeyUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=255)


class ApartmentKeyOut(ApartmentKeyBase):
    id: int
    apartment_id: int
    holder: str  # in_desk | out
    holder_name: str | None = None
    created_at: datetime
    transfers: list[KeyTransferOut] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class KeyTransferCreate(BaseModel):
    """Hand-out or return of a key at the reception desk."""
    direction: str = Field(pattern="^(out|return)$")
    counterparty_name: str = Field(min_length=1, max_length=255)
    note: str | None = None
