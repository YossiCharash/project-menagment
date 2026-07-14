"""Building Reception Desk (דלפק הבניין) API.

Endpoints only translate HTTP <-> service calls. All business logic lives in
the services layer; domain errors raised as ``ValueError`` (with Hebrew
messages) are converted to HTTP 4xx here.
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from backend.core.deps import DBSessionDep
from backend.iam.decorators import require_permission
from backend.iam.enums import Action, ResourceType
from backend.models.apartment import Apartment
from backend.models.apartment_key import KeyHolder
from backend.models.delivery import DeliveryStatus
from backend.schemas.building import BuildingCreate, BuildingUpdate, BuildingOut, BuildingListItem
from backend.schemas.building_project import (
    BuildingProjectCreate,
    BuildingProjectUpdate,
    BuildingProjectOut,
    BuildingProjectListItem,
)
from backend.schemas.apartment import (
    ApartmentCreate,
    ApartmentOut,
    ApartmentDetailOut,
    ApartmentUpdate,
    ApartmentTaskOut,
)
from backend.schemas.apartment_document import ApartmentDocumentOut
from backend.repositories.task_repository import TaskRepository
from backend.schemas.tenant import TenantCreate, TenantOut, TenantUpdate
from backend.schemas.apartment_key import (
    ApartmentKeyCreate,
    ApartmentKeyOut,
    ApartmentKeyUpdate,
    KeyTransferCreate,
)
from backend.schemas.authorized_vehicle import (
    AuthorizedVehicleCreate,
    AuthorizedVehicleOut,
    AuthorizedVehicleUpdate,
)
from backend.schemas.delivery import DeliveryCreate, DeliveryOut, DeliveryUpdate
from backend.schemas.technician_visit import (
    TechnicianVisitCreate,
    TechnicianVisitOut,
    TechnicianVisitUpdate,
)
from backend.schemas.client_visit import (
    ClientVisitCreate,
    ClientVisitOut,
    ClientVisitUpdate,
)
from backend.services.building_service import BuildingService
from backend.services.building_project_service import BuildingProjectService
from backend.services.apartment_service import ApartmentService
from backend.services.apartment_document_service import ApartmentDocumentService
from backend.services.tenant_service import TenantService
from backend.services.key_service import KeyService
from backend.services.authorized_vehicle_service import AuthorizedVehicleService
from backend.services.delivery_service import DeliveryService
from backend.services.technician_visit_service import TechnicianVisitService
from backend.services.client_visit_service import ClientVisitService
from backend.models.client_visit import ClientVisitStatus

router = APIRouter()

_RESOURCE = ResourceType.BUILDING_RECEPTION.value
# Structural building/project management (create / edit / delete a whole
# building or project) is gated on a separate, admin-only resource so that
# desk operators keep managing the contents (apartments, tenants, keys,
# deliveries) without being able to add or remove buildings.
_BUILDING_RESOURCE = ResourceType.BUILDING.value
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


def require_building_write(user=Depends(require_permission(Action.WRITE.value, _BUILDING_RESOURCE, project_id_param=_NO_PROJECT))):
    return user


def require_building_update(user=Depends(require_permission(Action.UPDATE.value, _BUILDING_RESOURCE, project_id_param=_NO_PROJECT))):
    return user


def require_building_delete(user=Depends(require_permission(Action.DELETE.value, _BUILDING_RESOURCE, project_id_param=_NO_PROJECT))):
    return user


# --- ORM -> schema converters --------------------------------------------


def _current_tenant_out(apartment: Apartment) -> TenantOut | None:
    """Return the current tenant of an apartment as a schema, if any."""
    for tenant in (apartment.tenants or []):
        if tenant.is_current:
            return TenantOut.model_validate(tenant)
    return None


def _apartment_base_fields(apartment: Apartment) -> dict:
    """Scalar fields shared by every apartment DTO (ApartmentBase + identity).

    Centralised so the summary and detail builders never drift apart when a new
    stored column is added to the apartment card (DRY / single source of truth).
    """
    return {
        "id": apartment.id,
        "building_id": apartment.building_id,
        "floor": apartment.floor,
        "unit_number": apartment.unit_number,
        "label": apartment.label,
        "is_common_area": apartment.is_common_area,
        "owner_name": apartment.owner_name,
        "owner_phone": apartment.owner_phone,
        "management_company_name": apartment.management_company_name,
        "management_company_phone": apartment.management_company_phone,
        "attorneys": apartment.attorneys,
        "equipment": apartment.equipment,
        "notes": apartment.notes,
        "created_at": apartment.created_at,
    }


def _apartment_to_out(apartment: Apartment, open_tasks_count: int = 0) -> ApartmentOut:
    """Summary view: current tenant + aggregate counts."""
    pending_deliveries = sum(
        1 for delivery in (apartment.deliveries or [])
        if delivery.status == DeliveryStatus.PENDING
    )
    has_active_client_visit = any(
        visit.status == ClientVisitStatus.PRESENT
        for visit in (apartment.client_visits or [])
    )
    keys = apartment.keys or []
    keys_in_desk_count = sum(1 for key in keys if key.holder == KeyHolder.IN_DESK)
    keys_out_count = sum(1 for key in keys if key.holder == KeyHolder.OUT)
    return ApartmentOut(
        **_apartment_base_fields(apartment),
        current_tenant=_current_tenant_out(apartment),
        has_active_client_visit=has_active_client_visit,
        keys_count=len(keys),
        keys_in_desk_count=keys_in_desk_count,
        keys_out_count=keys_out_count,
        vehicles_count=len(apartment.vehicles or []),
        pending_deliveries_count=pending_deliveries,
        open_tasks_count=open_tasks_count,
    )


def _apartment_to_detail(apartment: Apartment) -> ApartmentDetailOut:
    """Full detail view: tenant, keys, vehicles, deliveries, activity feed."""
    return ApartmentDetailOut(
        **_apartment_base_fields(apartment),
        current_tenant=_current_tenant_out(apartment),
        tenants=[TenantOut.model_validate(t) for t in (apartment.tenants or [])],
        keys=[ApartmentKeyOut.model_validate(k) for k in (apartment.keys or [])],
        vehicles=[AuthorizedVehicleOut.model_validate(v) for v in (apartment.vehicles or [])],
        deliveries=[DeliveryOut.model_validate(d) for d in (apartment.deliveries or [])],
        technician_visits=[
            TechnicianVisitOut.model_validate(v)
            for v in (apartment.technician_visits or [])
        ],
        client_visits=[
            ClientVisitOut.model_validate(v)
            for v in (apartment.client_visits or [])
        ],
        activities=[a for a in (apartment.activities or [])],
        documents=[
            ApartmentDocumentOut(
                id=document.id,
                apartment_id=document.entity_id,
                file_path=document.file_path,
                description=document.description,
                uploaded_at=document.uploaded_at,
            )
            for document in (apartment.documents or [])
        ],
    )


def _building_to_out(building, open_tasks_counts: dict[int, int] | None = None) -> BuildingOut:
    counts = open_tasks_counts or {}
    return BuildingOut(
        id=building.id,
        name=building.name,
        address=building.address,
        compound_name=building.compound_name,
        project_id=building.project_id,
        floors_count=building.floors_count,
        units_per_floor=building.units_per_floor,
        has_common_areas=building.has_common_areas,
        created_at=building.created_at,
        apartments=[
            _apartment_to_out(a, counts.get(a.id, 0)) for a in (building.apartments or [])
        ],
    )


async def _building_out_with_open_tasks(building, db: DBSessionDep) -> BuildingOut:
    """Build a ``BuildingOut`` enriched with per-apartment open-task counts."""
    apartment_ids = [apartment.id for apartment in (building.apartments or [])]
    open_tasks_counts = await TaskRepository(db).count_open_by_apartment_ids(apartment_ids)
    return _building_to_out(building, open_tasks_counts)


def _building_to_list_item(building) -> BuildingListItem:
    return BuildingListItem(
        id=building.id,
        name=building.name,
        address=building.address,
        compound_name=building.compound_name,
        project_id=building.project_id,
        floors_count=building.floors_count,
        units_per_floor=building.units_per_floor,
        has_common_areas=building.has_common_areas,
        created_at=building.created_at,
        apartments_count=len(building.apartments or []),
    )


def _project_to_out(project) -> BuildingProjectOut:
    return BuildingProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        buildings=[_building_to_list_item(b) for b in (project.buildings or [])],
    )


# --- Projects -------------------------------------------------------------


@router.post("/projects", response_model=BuildingProjectOut)
async def create_project(db: DBSessionDep, data: BuildingProjectCreate, user=Depends(require_building_write)):
    service = BuildingProjectService(db)
    try:
        project = await service.create_project(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _project_to_out(project)


@router.get("/projects", response_model=list[BuildingProjectListItem])
async def list_projects(db: DBSessionDep, user=Depends(require_read)):
    service = BuildingProjectService(db)
    projects = await service.list_projects()
    return [
        BuildingProjectListItem(
            id=project.id,
            name=project.name,
            description=project.description,
            created_at=project.created_at,
            buildings_count=len(project.buildings or []),
        )
        for project in projects
    ]


@router.get("/projects/{project_id}", response_model=BuildingProjectOut)
async def get_project(project_id: int, db: DBSessionDep, user=Depends(require_read)):
    service = BuildingProjectService(db)
    try:
        project = await service.get_project(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _project_to_out(project)


@router.put("/projects/{project_id}", response_model=BuildingProjectOut)
async def update_project(project_id: int, db: DBSessionDep, data: BuildingProjectUpdate, user=Depends(require_building_update)):
    service = BuildingProjectService(db)
    try:
        project = await service.update_project(project_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _project_to_out(project)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: int, db: DBSessionDep, user=Depends(require_building_delete)):
    service = BuildingProjectService(db)
    try:
        await service.delete_project(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return None


# --- Buildings ------------------------------------------------------------


@router.post("/buildings", response_model=BuildingOut)
async def create_building(db: DBSessionDep, data: BuildingCreate, user=Depends(require_building_write)):
    service = BuildingService(db)
    try:
        building = await service.create_building(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await _building_out_with_open_tasks(building, db)


@router.get("/buildings", response_model=list[BuildingListItem])
async def list_buildings(db: DBSessionDep, project_id: int | None = None, user=Depends(require_read)):
    service = BuildingService(db)
    buildings = await service.list_buildings()
    if project_id is not None:
        buildings = [building for building in buildings if building.project_id == project_id]
    return [_building_to_list_item(building) for building in buildings]


@router.get("/buildings/{building_id}", response_model=BuildingOut)
async def get_building(building_id: int, db: DBSessionDep, user=Depends(require_read)):
    service = BuildingService(db)
    try:
        building = await service.get_building(building_id)
        # Reconcile client arrivals whose end-time has passed so the desk shows
        # up-to-date occupancy on every (polled) load. The pass mutates the same
        # ClientVisit rows already loaded on the building (one identity map, and
        # expire_on_commit=False), so no re-read is needed to reflect the change.
        apartment_ids = [apartment.id for apartment in (building.apartments or [])]
        await ClientVisitService(db).expire_due_visits(apartment_ids)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return await _building_out_with_open_tasks(building, db)


@router.put("/buildings/{building_id}", response_model=BuildingOut)
async def update_building(building_id: int, db: DBSessionDep, data: BuildingUpdate, user=Depends(require_building_update)):
    service = BuildingService(db)
    try:
        building = await service.update_building(building_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return await _building_out_with_open_tasks(building, db)


@router.delete("/buildings/{building_id}", status_code=204)
async def delete_building(building_id: int, db: DBSessionDep, user=Depends(require_building_delete)):
    service = BuildingService(db)
    try:
        await service.delete_building(building_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return None


# --- Apartments -----------------------------------------------------------


@router.post("/apartments", response_model=ApartmentDetailOut)
async def create_apartment(db: DBSessionDep, data: ApartmentCreate, user=Depends(require_write)):
    service = ApartmentService(db)
    try:
        apartment = await service.create_apartment(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _apartment_to_detail(apartment)


@router.delete("/apartments/{apartment_id}", status_code=204)
async def delete_apartment(apartment_id: int, db: DBSessionDep, user=Depends(require_delete)):
    service = ApartmentService(db)
    try:
        await service.delete_apartment(apartment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return None


@router.get("/apartments/{apartment_id}", response_model=ApartmentDetailOut)
async def get_apartment(apartment_id: int, db: DBSessionDep, user=Depends(require_read)):
    service = ApartmentService(db)
    try:
        apartment = await service.get_apartment_detail(apartment_id)
        # Auto-expire a client arrival whose end-time has passed before serving
        # the panel, so an open apartment turns vacant on its next poll. The pass
        # mutates the already-loaded ClientVisit rows in place (shared identity
        # map, expire_on_commit=False), so the serialized detail reflects it.
        await ClientVisitService(db).expire_due_visits([apartment_id])
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


@router.get("/apartments/{apartment_id}/tasks", response_model=list[ApartmentTaskOut])
async def list_apartment_tasks(apartment_id: int, db: DBSessionDep, user=Depends(require_read)):
    try:
        await ApartmentService(db).get_apartment(apartment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    tasks = await TaskRepository(db).list_by_apartment(apartment_id)
    return [
        ApartmentTaskOut(
            id=task.id,
            title=task.title,
            start_time=task.start_time,
            status=task.status,
            assigned_to_user_id=task.assigned_to_user_id,
            assignee_name=(task.assigned_user.full_name if task.assigned_user else None),
        )
        for task in tasks
    ]


# --- Apartment documents --------------------------------------------------


@router.get(
    "/apartments/{apartment_id}/documents",
    response_model=list[ApartmentDocumentOut],
)
async def list_apartment_documents(apartment_id: int, db: DBSessionDep, user=Depends(require_read)):
    service = ApartmentDocumentService(db)
    try:
        return await service.list_documents(apartment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/apartments/{apartment_id}/documents", response_model=ApartmentDocumentOut)
async def upload_apartment_document(
    apartment_id: int,
    db: DBSessionDep,
    file: UploadFile = File(...),
    description: str | None = Form(None),
    user=Depends(require_write),
):
    service = ApartmentDocumentService(db)
    try:
        return await service.attach_document(apartment_id, file, description)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/apartments/{apartment_id}/documents/{document_id}", status_code=204)
async def delete_apartment_document(
    apartment_id: int, document_id: int, db: DBSessionDep, user=Depends(require_delete)
):
    service = ApartmentDocumentService(db)
    try:
        await service.remove_document(apartment_id, document_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return None


@router.post("/apartments/{apartment_id}/tenant", response_model=TenantOut)
async def swap_tenant(apartment_id: int, db: DBSessionDep, data: TenantCreate, user=Depends(require_write)):
    service = TenantService(db)
    try:
        tenant = await service.swap_tenant(apartment_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return TenantOut.model_validate(tenant)


@router.put("/tenants/{tenant_id}", response_model=TenantOut)
async def update_tenant(tenant_id: int, db: DBSessionDep, data: TenantUpdate, user=Depends(require_update)):
    service = TenantService(db)
    try:
        tenant = await service.update_tenant(tenant_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return TenantOut.model_validate(tenant)


@router.delete("/tenants/{tenant_id}", status_code=204)
async def delete_tenant(tenant_id: int, db: DBSessionDep, user=Depends(require_delete)):
    service = TenantService(db)
    try:
        await service.delete_tenant(tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return None


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


@router.put("/keys/{key_id}", response_model=ApartmentKeyOut)
async def update_key(key_id: int, db: DBSessionDep, data: ApartmentKeyUpdate, user=Depends(require_update)):
    service = KeyService(db)
    try:
        key = await service.update_key(key_id, data.label or "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ApartmentKeyOut.model_validate(key)


@router.delete("/keys/{key_id}", status_code=204)
async def delete_key(key_id: int, db: DBSessionDep, user=Depends(require_delete)):
    service = KeyService(db)
    try:
        await service.delete_key(key_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return None


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


@router.put("/vehicles/{vehicle_id}", response_model=AuthorizedVehicleOut)
async def update_vehicle(vehicle_id: int, db: DBSessionDep, data: AuthorizedVehicleUpdate, user=Depends(require_update)):
    service = AuthorizedVehicleService(db)
    try:
        vehicle = await service.update_vehicle(vehicle_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
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


@router.put("/deliveries/{delivery_id}", response_model=DeliveryOut)
async def update_delivery(delivery_id: int, db: DBSessionDep, data: DeliveryUpdate, user=Depends(require_update)):
    service = DeliveryService(db)
    try:
        delivery = await service.update_delivery(delivery_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return DeliveryOut.model_validate(delivery)


@router.delete("/deliveries/{delivery_id}", status_code=204)
async def delete_delivery(delivery_id: int, db: DBSessionDep, user=Depends(require_delete)):
    service = DeliveryService(db)
    try:
        await service.delete_delivery(delivery_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return None


# --- Technician visits ----------------------------------------------------


@router.get(
    "/apartments/{apartment_id}/technician-visits",
    response_model=list[TechnicianVisitOut],
)
async def list_technician_visits(apartment_id: int, db: DBSessionDep, user=Depends(require_read)):
    service = TechnicianVisitService(db)
    try:
        visits = await service.list_for_apartment(apartment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return [TechnicianVisitOut.model_validate(v) for v in visits]


@router.post("/technician-visits", response_model=TechnicianVisitOut)
async def create_technician_visit(
    db: DBSessionDep, data: TechnicianVisitCreate, user=Depends(require_write)
):
    service = TechnicianVisitService(db)
    try:
        visit = await service.create_visit(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return TechnicianVisitOut.model_validate(visit)


@router.post("/technician-visits/{visit_id}/exit", response_model=TechnicianVisitOut)
async def exit_technician_visit(visit_id: int, db: DBSessionDep, user=Depends(require_update)):
    service = TechnicianVisitService(db)
    try:
        visit = await service.mark_left(visit_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return TechnicianVisitOut.model_validate(visit)


@router.put("/technician-visits/{visit_id}", response_model=TechnicianVisitOut)
async def update_technician_visit(
    visit_id: int, db: DBSessionDep, data: TechnicianVisitUpdate, user=Depends(require_update)
):
    service = TechnicianVisitService(db)
    try:
        visit = await service.update_visit(visit_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return TechnicianVisitOut.model_validate(visit)


@router.delete("/technician-visits/{visit_id}", status_code=204)
async def delete_technician_visit(visit_id: int, db: DBSessionDep, user=Depends(require_delete)):
    service = TechnicianVisitService(db)
    try:
        await service.delete_visit(visit_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return None


# --- Client visits --------------------------------------------------------


@router.get(
    "/apartments/{apartment_id}/client-visits",
    response_model=list[ClientVisitOut],
)
async def list_client_visits(apartment_id: int, db: DBSessionDep, user=Depends(require_read)):
    service = ClientVisitService(db)
    try:
        visits = await service.list_for_apartment(apartment_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return [ClientVisitOut.model_validate(v) for v in visits]


@router.post("/client-visits", response_model=ClientVisitOut)
async def create_client_visit(
    db: DBSessionDep, data: ClientVisitCreate, user=Depends(require_write)
):
    service = ClientVisitService(db)
    try:
        visit = await service.create_visit(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ClientVisitOut.model_validate(visit)


@router.post("/client-visits/{visit_id}/exit", response_model=ClientVisitOut)
async def exit_client_visit(visit_id: int, db: DBSessionDep, user=Depends(require_update)):
    service = ClientVisitService(db)
    try:
        visit = await service.mark_left(visit_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ClientVisitOut.model_validate(visit)


@router.put("/client-visits/{visit_id}", response_model=ClientVisitOut)
async def update_client_visit(
    visit_id: int, db: DBSessionDep, data: ClientVisitUpdate, user=Depends(require_update)
):
    service = ClientVisitService(db)
    try:
        visit = await service.update_visit(visit_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return ClientVisitOut.model_validate(visit)


@router.delete("/client-visits/{visit_id}", status_code=204)
async def delete_client_visit(visit_id: int, db: DBSessionDep, user=Depends(require_delete)):
    service = ClientVisitService(db)
    try:
        await service.delete_visit(visit_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return None
