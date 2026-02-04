from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.schemas.quote_line import QuoteLineOutNested


class QuoteApartmentBase(BaseModel):
    size_sqm: float = Field(ge=0)
    sort_order: int = 0


class QuoteApartmentCreate(QuoteApartmentBase):
    pass


class QuoteApartmentsBulkCreate(BaseModel):
    """Create multiple apartments with the same size_sqm (e.g. 50 apartments of 50 m²)."""
    count: int = Field(ge=1, le=500, description="Number of apartments to add")
    size_sqm: float = Field(ge=0.01, description="Size in sqm for each apartment")


class QuoteApartmentUpdate(BaseModel):
    size_sqm: float | None = Field(default=None, ge=0)
    sort_order: int | None = None


class QuoteApartmentOut(QuoteApartmentBase):
    id: int
    quote_building_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuoteBuildingBase(BaseModel):
    address: str | None = None
    num_residents: int | None = Field(default=None, ge=0)
    calculation_method: str = Field(default="by_residents", pattern="^(by_residents|by_apartment_size)$")
    sort_order: int = 0


class QuoteBuildingCreate(QuoteBuildingBase):
    pass


class QuoteBuildingUpdate(BaseModel):
    address: str | None = None
    num_residents: int | None = Field(default=None, ge=0)
    calculation_method: str | None = Field(default=None, pattern="^(by_residents|by_apartment_size)$")
    sort_order: int | None = None


class QuoteLineOutNested(BaseModel):
    id: int
    quote_structure_item_id: int
    quote_structure_item_name: str = ""
    amount: float | None
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class QuoteBuildingOut(QuoteBuildingBase):
    id: int
    quote_project_id: int
    created_at: datetime
    updated_at: datetime
    quote_lines: list[QuoteLineOutNested] = Field(default_factory=list)
    quote_apartments: list[QuoteApartmentOut] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
