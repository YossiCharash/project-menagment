from datetime import date, datetime
from pydantic import BaseModel, Field, ConfigDict


class TenantBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)  # איש קשר 1
    phone: str | None = None
    email: str | None = None
    name_2: str | None = None  # איש קשר 2
    phone_2: str | None = None
    email_2: str | None = None
    move_in_date: date | None = None
    move_out_date: date | None = None


class TenantCreate(TenantBase):
    pass


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = None
    email: str | None = None
    name_2: str | None = None
    phone_2: str | None = None
    email_2: str | None = None
    move_in_date: date | None = None
    move_out_date: date | None = None
    is_current: bool | None = None


class TenantOut(TenantBase):
    id: int
    apartment_id: int
    is_current: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
