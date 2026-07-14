from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

from backend.schemas.tenant import TenantOut
from backend.schemas.apartment_key import ApartmentKeyOut
from backend.schemas.authorized_vehicle import AuthorizedVehicleOut
from backend.schemas.delivery import DeliveryOut
from backend.schemas.technician_visit import TechnicianVisitOut
from backend.schemas.client_visit import ClientVisitOut
from backend.schemas.apartment_activity import ApartmentActivityOut


class ApartmentBase(BaseModel):
    floor: int = Field(default=0, ge=0)
    unit_number: str = Field(min_length=1, max_length=32)
    label: str | None = None
    is_common_area: bool = False
    owner_name: str | None = None
    owner_phone: str | None = None
    management_company_name: str | None = None
    management_company_phone: str | None = None
    attorneys: str | None = None
    equipment: str | None = None
    notes: str | None = None


class ApartmentCreate(ApartmentBase):
    building_id: int


class ApartmentUpdate(BaseModel):
    floor: int | None = Field(default=None, ge=0)
    unit_number: str | None = Field(default=None, min_length=1, max_length=32)
    label: str | None = None
    is_common_area: bool | None = None
    owner_name: str | None = None
    owner_phone: str | None = None
    management_company_name: str | None = None
    management_company_phone: str | None = None
    attorneys: str | None = None
    equipment: str | None = None
    notes: str | None = None


class ApartmentOut(ApartmentBase):
    """Apartment summary – nests the current tenant and aggregate counts."""
    id: int
    building_id: int
    created_at: datetime
    current_tenant: TenantOut | None = None
    has_active_client_visit: bool = False
    keys_count: int = 0
    keys_in_desk_count: int = 0  # מפתחות שנמצאים כרגע בדלפק
    keys_out_count: int = 0  # מפתחות שהוצאו החוצה (טרם הוחזרו)
    vehicles_count: int = 0
    pending_deliveries_count: int = 0
    open_tasks_count: int = 0

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
    technician_visits: list[TechnicianVisitOut] = Field(default_factory=list)
    client_visits: list[ClientVisitOut] = Field(default_factory=list)
    activities: list[ApartmentActivityOut] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
