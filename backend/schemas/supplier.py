from datetime import datetime
from pydantic import BaseModel, Field, EmailStr, field_validator


class SupplierBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    contact_email: EmailStr | None = None
    phone: str | None = None
    annual_budget: float | None = None
    category: str | None = None
    category_id: int | None = None

    @field_validator('category', mode='before')
    @classmethod
    def extract_category_name(cls, v):
        # If value is an object with 'name' attribute (e.g. ORM model), return the name
        if hasattr(v, 'name'):
            return v.name
        return v


class SupplierCreate(SupplierBase):
    # For creation, category is mandatory
    # Allowing category_id as well
    category: str | None = None
    category_id: int | None = None


class SupplierUpdate(BaseModel):
    name: str | None = None
    contact_email: EmailStr | None = None
    phone: str | None = None
    annual_budget: float | None = None
    category: str | None = None
    category_id: int | None = None


class SupplierOut(SupplierBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
