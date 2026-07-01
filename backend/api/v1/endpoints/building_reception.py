"""Building Reception Desk (דלפק הבניין) API.

Endpoints only translate HTTP <-> service calls. All business logic lives in
the services layer; domain errors raised as ``ValueError`` (with Hebrew
messages) are converted to HTTP 4xx here.
"""
from fastapi import APIRouter, Depends, HTTPException

from backend.core.deps import DBSessionDep
from backend.iam.decorators import require_permission
from backend.iam.enums import Action, ResourceType
from backend.models.apartment import Apartment
from backend.models.delivery import DeliveryStatus
from backend.schemas.building import BuildingCreate, BuildingUpdate, BuildingOut, BuildingListItem
from backend.schemas.apartment import ApartmentOut, ApartmentDetailOut, ApartmentUpdate
from backend.schemas.tenant import TenantCreate, TenantOut
from backend.schemas.apartment_key import (
    ApartmentKeyCreate,
    ApartmentKeyOut,
    KeyTransferCreate,
)
from backend.schemas.authorized_vehicle import AuthorizedVehicleCreate, AuthorizedVehicleOut
from backend.schemas.delivery import DeliveryCreate, DeliveryOut
from backend.services.building_service import BuildingService
from backend.services.apartment_service import ApartmentService
from backend.services.tenant_service import TenantService
from backend.services.key_service import KeyService
from backend.services.authorized_vehicle_service import AuthorizedVehicleService
from backend.services.delivery_service import DeliveryService

router = APIRouter()

_RESOURCE = ResourceType.BUILDING_RECEPTION.value
# Reception desk is a global (non project-scoped) resource.
_NO_PROJECT = None


def require_read(user=Depends(require_permission(Action.READ.value, _RESOURCE, project_id_param=_NO_PROJECT))):
    return user


def require_write(user=Depends(require_permission(Action.WRITE.value, _RESOURCE, project_id_param=_NO_PROJECT))):
    return user


def require_update(user=Depends(require_permission(Action.UPDATE.value, _RESOURCE, project_id_param=_NO_PROJECT))):
    return user


def require_delete(user=Depends(require_permission(Action.DELETE.value, _RESOURCE, project_id_param=_NO_PROJECT))):
    return user


# --- ORM -> schema converters --------------------------------------------


def _current_tenant_out(apartment: Apartment) -> TenantOut | None:
    """Return the current tenant of an apartment as a schema, if any."""
    for tenant in (apartment.tenants or []):
        if tenant.is_current:
            return TenantOut.model_validate(tenant)
    return None


def _apartment_to_out(apartment: Apartment) -> ApartmentOut:
    """Summary view: current tenant + aggregate counts."""
    pending_deliveries = sum(
        1 for delivery in (apartment.deliveries or [])
        if delivery.status == DeliveryStatus.PENDING
    )
    return ApartmentOut(
        id=apartment.id,
        building_id=apartment.building_id,
        floor=apartment.floor,
        unit_number=apartment.unit_number,
        label=apartment.label,
        is_common_area=apartment.is_common_area,
        created_at=apartment.created_at,
        current_tenant=_current_tenant_out(apartment),
        keys_count=len(apartment.keys or []),
        vehicles_count=len(apartment.vehicles or []),
        pending_deliveries_count=pending_deliveries,
    )


def _apartment_to_detail(apartment: Apartment) -> ApartmentDetailOut:
    """Full detail view: tenant, keys, vehicles, deliveries, activity feed."""
    return ApartmentDetailOut(
        id=apartment.id,
        building_id=apartment.building_id,
        floor=apartment.floor,
        unit_number=apartment.unit_number,
        label=apartment.label,
        is_common_area=apartment.is_common_area,
        created_at=apartment.created_at,
        current_tenant=_current_tenant_out(apartment),
        tenants=[TenantOut.model_validate(t) for t in (apartment.tenants or [])],
        keys=[ApartmentKeyOut.model_validate(k) for k in (apartment.keys or [])],
        vehicles=[AuthorizedVehicleOut.model_validate(v) for v in (apartment.vehicles or [])],
        deliveries=[DeliveryOut.model_validate(d) for d in (apartment.deliveries or [])],
        activities=[a for a in (apartment.activities or [])],
    )


def _building_to_out(building) -> BuildingOut:
    return BuildingOut(
        id=building.id,
        name=building.name,
        address=building.address,
        compound_name=building.compound_name,
        floors_count=building.floors_count,
        units_per_floor=building.units_per_floor,
        has_common_areas=building.has_common_areas,
        created_at=building.created_at,
        apartments=[_apartment_to_out(a) for a in (building.apartments or [])],
    )


# --- Buildings ------------------------------------------------------------


@router.post("/buildings", response_model=BuildingOut)
async def create_building(db: DBSessionDep, data: BuildingCreate, user=Depends(require_write)):
    service = BuildingService(db)
    try:
        building = await service.create_building(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _building_to_out(building)


@router.get("/buildings", response_model=list[BuildingListItem])
async def list_buildings(db: DBSessionDep, user=Depends(require_read)):
    service = BuildingService(db)
    buildings = await service.list_buildings()
    return [
        BuildingListItem(
            id=building.id,
            name=building.name,
            address=building.address,
            compound_name=building.compound_name,
            floors_count=building.floors_count,
            units_per_floor=building.units_per_floor,
            has_common_areas=building.has_common_areas,
            created_at=building.created_at,
            apartments_count=len(building.apartments or []),
        )
        for building in buildings
    ]


@router.get("/buildings/{building_id}", response_model=BuildingOut)
async def get_building(building_id: int, db: DBSessionDep, user=Depends(require_read)):
    service = BuildingService(db)
    try:
        building = await service.get_building(building_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _building_to_out(building)


@router.put("/buildings/{building_id}", response_model=BuildingOut)
async def update_building(building_id: int, db: DBSessionDep, data: BuildingUpdate, user=Depends(require_update)):
    service = BuildingService(db)
    try:
        building = await service.update_building(building_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _building_to_out(building)


@router.delete("/buildings/{building_id}", status_code=204)
async def delete_building(building_id: int, db: DBSessionDep, user=Depends(require_delete)):
    service = BuildingService(db)
    try:
        await service.delete_building(building_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return None


# --- Apartments -----------------------------------------------------------


@router.get("/apartments/{apartment_id}", response_model=ApartmentDetailOut)
async def get_apartment(apartment_id: int, db: DBSessionDep, user=Depends(require_read)):
    service = ApartmentService(db)
    try:
        apartment = await service.get_apartment_detail(apartment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _apartment_to_detail(apartment)


@router.put("/apartments/{apartment_id}", response_model=ApartmentDetailOut)
async def update_apartment(apartment_id: int, db: DBSessionDep, data: ApartmentUpdate, user=Depends(require_update)):
    service = ApartmentService(db)
    try:
        apartment = await service.update_apartment(apartment_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _apartment_to_detail(apartment)


@router.post("/apartments/{apartment_id}/tenant", response_model=TenantOut)
async def swap_tenant(apartment_id: int, db: DBSessionDep, data: TenantCreate, user=Depends(require_write)):
    service = TenantService(db)
    try:
        tenant = await service.swap_tenant(apartment_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return TenantOut.model_validate(tenant)


# --- Keys -----------------------------------------------------------------


@router.get("/apartments/{apartment_id}/keys", response_model=list[ApartmentKeyOut])
async def list_keys(apartment_id: int, db: DBSessionDep, user=Depends(require_read)):
    service = KeyService(db)
    try:
        keys = await service.list_for_apartment(apartment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return [ApartmentKeyOut.model_validate(k) for k in keys]


@router.post("/keys", response_model=ApartmentKeyOut)
async def create_key(db: DBSessionDep, data: ApartmentKeyCreate, user=Depends(require_write)):
    service = KeyService(db)
    try:
        key = await service.create_key(data.apartment_id, data.label)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ApartmentKeyOut.model_validate(key)


@router.post("/keys/{key_id}/transfer", response_model=ApartmentKeyOut)
async def transfer_key(key_id: int, db: DBSessionDep, data: KeyTransferCreate, user=Depends(require_update)):
    service = KeyService(db)
    try:
        key = await service.transfer(
            key_id=key_id,
            direction=data.direction,
            counterparty_name=data.counterparty_name,
            note=data.note,
            user_id=user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ApartmentKeyOut.model_validate(key)


# --- Vehicles -------------------------------------------------------------


@router.get("/apartments/{apartment_id}/vehicles", response_model=list[AuthorizedVehicleOut])
async def list_vehicles(apartment_id: int, db: DBSessionDep, user=Depends(require_read)):
    service = AuthorizedVehicleService(db)
    try:
        vehicles = await service.list_for_apartment(apartment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return [AuthorizedVehicleOut.model_validate(v) for v in vehicles]


@router.post("/vehicles", response_model=AuthorizedVehicleOut)
async def create_vehicle(db: DBSessionDep, data: AuthorizedVehicleCreate, user=Depends(require_write)):
    service = AuthorizedVehicleService(db)
    try:
        vehicle = await service.create_vehicle(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return AuthorizedVehicleOut.model_validate(vehicle)


@router.delete("/vehicles/{vehicle_id}", status_code=204)
async def delete_vehicle(vehicle_id: int, db: DBSessionDep, user=Depends(require_delete)):
    service = AuthorizedVehicleService(db)
    try:
        await service.delete_vehicle(vehicle_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return None


# --- Deliveries -----------------------------------------------------------


@router.get("/apartments/{apartment_id}/deliveries", response_model=list[DeliveryOut])
async def list_deliveries(apartment_id: int, db: DBSessionDep, user=Depends(require_read)):
    service = DeliveryService(db)
    try:
        deliveries = await service.list_for_apartment(apartment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return [DeliveryOut.model_validate(d) for d in deliveries]


@router.post("/deliveries", response_model=DeliveryOut)
async def create_delivery(db: DBSessionDep, data: DeliveryCreate, user=Depends(require_write)):
    service = DeliveryService(db)
    try:
        delivery = await service.create_delivery(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return DeliveryOut.model_validate(delivery)


@router.post("/deliveries/{delivery_id}/deliver", response_model=DeliveryOut)
async def deliver_delivery(delivery_id: int, db: DBSessionDep, user=Depends(require_update)):
    service = DeliveryService(db)
    try:
        delivery = await service.mark_delivered(delivery_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return DeliveryOut.model_validate(delivery)
