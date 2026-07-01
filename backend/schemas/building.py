from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

from backend.schemas.apartment import ApartmentOut


class BuildingBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    address: str | None = None
    compound_name: str | None = None
    floors_count: int = Field(default=0, ge=0)
    units_per_floor: int = Field(default=0, ge=0)
    has_common_areas: bool = False


class BuildingCreate(BuildingBase):
    pass


class BuildingUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    address: str | None = None
    compound_name: str | None = None
    floors_count: int | None = Field(default=None, ge=0)
    units_per_floor: int | None = Field(default=None, ge=0)
    has_common_areas: bool | None = None


class BuildingListItem(BuildingBase):
    """Building summary used in list views (no nested apartments)."""
    id: int
    created_at: datetime
    apartments_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class BuildingOut(BuildingBase):
    """Full building overview – nests its apartments (floors + units)."""
    id: int
    created_at: datetime
    apartments: list[ApartmentOut] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
