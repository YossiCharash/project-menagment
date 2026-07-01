from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

from backend.schemas.tenant import TenantOut
from backend.schemas.apartment_key import ApartmentKeyOut
from backend.schemas.authorized_vehicle import AuthorizedVehicleOut
from backend.schemas.delivery import DeliveryOut
from backend.schemas.apartment_activity import ApartmentActivityOut


class ApartmentBase(BaseModel):
    floor: int = Field(default=0, ge=0)
    unit_number: str = Field(min_length=1, max_length=32)
    label: str | None = None
    is_common_area: bool = False


class ApartmentCreate(ApartmentBase):
    building_id: int


class ApartmentUpdate(BaseModel):
    floor: int | None = Field(default=None, ge=0)
    unit_number: str | None = Field(default=None, min_length=1, max_length=32)
    label: str | None = None
    is_common_area: bool | None = None


class ApartmentOut(ApartmentBase):
    """Apartment summary – nests the current tenant and aggregate counts."""
    id: int
    building_id: int
    created_at: datetime
    current_tenant: TenantOut | None = None
    keys_count: int = 0
    vehicles_count: int = 0
    pending_deliveries_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ApartmentTaskOut(BaseModel):
    """Lightweight view of a task linked to an apartment (reception desk)."""
    id: int
    title: str
    start_time: datetime | None = None
    status: str
    assigned_to_user_id: int | None = None
    assignee_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ApartmentDetailOut(ApartmentBase):
    """Full apartment detail – tenant, keys, vehicles, deliveries, activity feed."""
    id: int
    building_id: int
    created_at: datetime
    current_tenant: TenantOut | None = None
    tenants: list[TenantOut] = Field(default_factory=list)
    keys: list[ApartmentKeyOut] = Field(default_factory=list)
    vehicles: list[AuthorizedVehicleOut] = Field(default_factory=list)
    deliveries: list[DeliveryOut] = Field(default_factory=list)
    activities: list[ApartmentActivityOut] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
