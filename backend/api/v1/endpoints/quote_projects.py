from fastapi import APIRouter, Depends, HTTPException, Query, Body

from backend.core.deps import DBSessionDep, get_current_user
from pydantic import BaseModel
from backend.models import QuoteProject, QuoteLine, QuoteBuilding, QuoteApartment
from backend.repositories.quote_project_repository import QuoteProjectRepository
from backend.repositories.quote_line_repository import QuoteLineRepository
from backend.repositories.quote_structure_repository import QuoteStructureRepository
from backend.repositories.project_repository import ProjectRepository
from backend.repositories.quote_building_repository import QuoteBuildingRepository, QuoteApartmentRepository
from backend.schemas.quote_project import (
    QuoteProjectCreate,
    QuoteProjectUpdate,
    QuoteProjectOut,
    QuoteLineOutNested,
)
from backend.schemas.quote_line import QuoteLineCreate, QuoteLineOut, QuoteLineUpdate
from backend.schemas.quote_building import (
    QuoteBuildingCreate,
    QuoteBuildingUpdate,
    QuoteBuildingOut,
    QuoteApartmentsBulkCreate,
    QuoteApartmentOut,
    QuoteLineOutNested as BuildingLineOutNested,
)
from backend.schemas.quote_subject import QuoteSubjectOut
from backend.services.project_service import ProjectService
from backend.services.contract_period_service import ContractPeriodService

router = APIRouter()


def _building_to_out(b: QuoteBuilding) -> QuoteBuildingOut:
    """Convert a QuoteBuilding ORM object (with relationships loaded) to QuoteBuildingOut."""
    lines_out = [
        BuildingLineOutNested(
            id=line.id,
            quote_structure_item_id=line.quote_structure_item_id,
            quote_structure_item_name=line.quote_structure_item.name if line.quote_structure_item else "",
            amount=float(line.amount) if line.amount is not None else None,
            sort_order=line.sort_order,
        )
        for line in (b.quote_lines or [])
    ]
    apts_out = [
        QuoteApartmentOut(
            id=a.id,
            quote_building_id=a.quote_building_id,
            size_sqm=float(a.size_sqm),
            sort_order=a.sort_order,
            created_at=a.created_at,
        )
        for a in (b.quote_apartments or [])
    ]
    return QuoteBuildingOut(
        id=b.id,
        quote_project_id=b.quote_project_id,
        address=b.address,
        num_residents=b.num_residents,
        calculation_method=b.calculation_method,
        sort_order=b.sort_order,
        created_at=b.created_at,
        updated_at=b.updated_at,
        quote_lines=lines_out,
        quote_apartments=apts_out,
    )


def _quote_project_to_out(
    qp: QuoteProject,
    children_count: int = 0,
    lines: list | None = None,
    buildings: list | None = None,
    quote_subject=None,
) -> QuoteProjectOut:
    """Build QuoteProjectOut. Pass lines=[], buildings=[] when relationships are not loaded (e.g. after create)."""
    # Project-level lines: only those NOT belonging to a building
    if lines is not None:
        line_list = lines
    else:
        line_list = [l for l in (qp.quote_lines or []) if l.quote_building_id is None]
    lines_out = []
    for line in line_list:
        name = line.quote_structure_item.name if line.quote_structure_item else ""
        lines_out.append(
            QuoteLineOutNested(
                id=line.id,
                quote_structure_item_id=line.quote_structure_item_id,
                quote_structure_item_name=name,
                amount=float(line.amount) if line.amount is not None else None,
                sort_order=line.sort_order,
            )
        )

    building_list = buildings if buildings is not None else (qp.quote_buildings or [])
    buildings_out = [_building_to_out(b) for b in building_list]

    sub_out = None
    sub = quote_subject if quote_subject is not None else getattr(qp, 'quote_subject', None)
    if sub is not None:
        sub_out = QuoteSubjectOut(
            id=sub.id,
            address=sub.address,
            num_apartments=sub.num_apartments,
            num_buildings=sub.num_buildings,
            notes=sub.notes,
            created_at=sub.created_at,
            updated_at=sub.updated_at,
        )

    return QuoteProjectOut(
        id=qp.id,
        name=qp.name,
        description=qp.description,
        parent_id=qp.parent_id,
        project_id=getattr(qp, 'project_id', None),
        quote_subject_id=getattr(qp, 'quote_subject_id', None),
        expected_start_date=qp.expected_start_date,
        expected_income=float(qp.expected_income) if qp.expected_income is not None else None,
        expected_expenses=float(qp.expected_expenses) if qp.expected_expenses is not None else None,
        num_residents=qp.num_residents,
        status=qp.status,
        converted_project_id=qp.converted_project_id,
        created_at=qp.created_at,
        updated_at=qp.updated_at,
        quote_lines=lines_out,
        children_count=children_count,
        quote_buildings=buildings_out,
        quote_subject=sub_out,
    )


@router.get("/", response_model=list[QuoteProjectOut])
async def list_quote_projects(
    db: DBSessionDep,
    parent_id: int | None = Query(None, description="Filter by parent quote (legacy)"),
    project_id: int | None = Query(None, description="Filter by project - quotes for this project"),
    quote_subject_id: int | None = Query(None, description="Filter by quote subject (נושא הצעה)"),
    status: str | None = Query(None, description="draft | approved"),
    include_all: bool = Query(False, description="Return all quotes regardless of parent/project filters"),
    user=Depends(get_current_user),
):
    repo = QuoteProjectRepository(db)
    items = await repo.list(parent_id=parent_id, project_id=project_id, quote_subject_id=quote_subject_id, status=status, include_all=include_all)
    result = []
    for qp in items:
        children_count = len(qp.children or [])
        result.append(_quote_project_to_out(qp, children_count=children_count))
    return result


@router.get("/{quote_project_id}", response_model=QuoteProjectOut)
async def get_quote_project(
    quote_project_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    repo = QuoteProjectRepository(db)
    qp = await repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    children_count = await repo.get_children_count(qp.id)
    return _quote_project_to_out(qp, children_count=children_count)


@router.post("/", response_model=QuoteProjectOut)
async def create_quote_project(
    db: DBSessionDep,
    data: QuoteProjectCreate,
    user=Depends(get_current_user),
):
    qp = QuoteProject(
        name=data.name.strip(),
        description=data.description.strip() if data.description else None,
        parent_id=data.parent_id,
        project_id=getattr(data, 'project_id', None),
        quote_subject_id=data.quote_subject_id,
        expected_start_date=data.expected_start_date,
        expected_income=data.expected_income,
        expected_expenses=data.expected_expenses,
        num_residents=data.num_residents,
        status="draft",
    )
    repo = QuoteProjectRepository(db)
    if data.parent_id:
        parent = await repo.get(data.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent quote project not found")
    created = await repo.create(qp)
    children_count = 0
    return _quote_project_to_out(created, children_count=children_count, lines=[], buildings=[])


@router.put("/{quote_project_id}", response_model=QuoteProjectOut)
async def update_quote_project(
    quote_project_id: int,
    db: DBSessionDep,
    data: QuoteProjectUpdate,
    user=Depends(get_current_user),
):
    repo = QuoteProjectRepository(db)
    qp = await repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    if qp.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot update an approved quote project")
    if data.name is not None:
        qp.name = data.name.strip()
    if data.description is not None:
        qp.description = data.description.strip() if data.description else None
    if data.parent_id is not None:
        qp.parent_id = data.parent_id
    if 'project_id' in data.model_dump(exclude_unset=True):
        qp.project_id = data.project_id
    if data.expected_start_date is not None:
        qp.expected_start_date = data.expected_start_date
    if data.expected_income is not None:
        qp.expected_income = data.expected_income
    if data.expected_expenses is not None:
        qp.expected_expenses = data.expected_expenses
    if data.num_residents is not None:
        qp.num_residents = data.num_residents
    updated = await repo.update(qp)
    children_count = await repo.get_children_count(updated.id)
    return _quote_project_to_out(updated, children_count=children_count)


@router.delete("/{quote_project_id}", status_code=204)
async def delete_quote_project(
    quote_project_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    repo = QuoteProjectRepository(db)
    qp = await repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    if qp.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot delete an approved quote project")
    await repo.delete(qp)
    return None


# --- Quote lines (nested under quote project) ---


@router.get("/{quote_project_id}/lines", response_model=list[QuoteLineOut])
async def list_quote_lines(
    quote_project_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    qp_repo = QuoteProjectRepository(db)
    qp = await qp_repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    line_repo = QuoteLineRepository(db)
    lines = await line_repo.list_by_quote_project(quote_project_id)
    return [
        QuoteLineOut(
            id=line.id,
            quote_project_id=line.quote_project_id,
            quote_structure_item_id=line.quote_structure_item_id,
            quote_structure_item_name=line.quote_structure_item.name if line.quote_structure_item else "",
            amount=float(line.amount) if line.amount is not None else None,
            sort_order=line.sort_order,
            created_at=line.created_at,
        )
        for line in lines
    ]


@router.post("/{quote_project_id}/lines", response_model=QuoteLineOut)
async def add_quote_line(
    quote_project_id: int,
    db: DBSessionDep,
    data: QuoteLineCreate,
    user=Depends(get_current_user),
):
    qp_repo = QuoteProjectRepository(db)
    qp = await qp_repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    if qp.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot add lines to an approved quote project")
    struct_repo = QuoteStructureRepository(db)
    item = await struct_repo.get(data.quote_structure_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Quote structure item not found")
    line = QuoteLine(
        quote_project_id=quote_project_id,
        quote_building_id=data.quote_building_id,
        quote_structure_item_id=data.quote_structure_item_id,
        amount=data.amount,
        sort_order=data.sort_order,
    )
    line_repo = QuoteLineRepository(db)
    created = await line_repo.create(line)
    return QuoteLineOut(
        id=created.id,
        quote_project_id=created.quote_project_id,
        quote_structure_item_id=created.quote_structure_item_id,
        quote_structure_item_name=item.name,
        amount=float(created.amount) if created.amount is not None else None,
        sort_order=created.sort_order,
        created_at=created.created_at,
    )


@router.put("/{quote_project_id}/lines/{line_id}", response_model=QuoteLineOut)
async def update_quote_line(
    quote_project_id: int,
    line_id: int,
    db: DBSessionDep,
    data: QuoteLineUpdate,
    user=Depends(get_current_user),
):
    qp_repo = QuoteProjectRepository(db)
    qp = await qp_repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    if qp.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot update lines of an approved quote project")
    line_repo = QuoteLineRepository(db)
    line = await line_repo.get(line_id)
    if not line or line.quote_project_id != quote_project_id:
        raise HTTPException(status_code=404, detail="Quote line not found")
    if data.amount is not None:
        line.amount = data.amount
    if data.sort_order is not None:
        line.sort_order = data.sort_order
    updated = await line_repo.update(line)
    name = updated.quote_structure_item.name if updated.quote_structure_item else ""
    return QuoteLineOut(
        id=updated.id,
        quote_project_id=updated.quote_project_id,
        quote_structure_item_id=updated.quote_structure_item_id,
        quote_structure_item_name=name,
        amount=float(updated.amount) if updated.amount is not None else None,
        sort_order=updated.sort_order,
        created_at=updated.created_at,
    )


@router.delete("/{quote_project_id}/lines/{line_id}", status_code=204)
async def delete_quote_line(
    quote_project_id: int,
    line_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    qp_repo = QuoteProjectRepository(db)
    qp = await qp_repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    if qp.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot delete lines of an approved quote project")
    line_repo = QuoteLineRepository(db)
    line = await line_repo.get(line_id)
    if not line or line.quote_project_id != quote_project_id:
        raise HTTPException(status_code=404, detail="Quote line not found")
    await line_repo.delete(line)
    return None


# --- Buildings (nested under quote project) ---


@router.post("/{quote_project_id}/buildings", response_model=QuoteBuildingOut)
async def add_building(
    quote_project_id: int,
    db: DBSessionDep,
    data: QuoteBuildingCreate,
    user=Depends(get_current_user),
):
    qp_repo = QuoteProjectRepository(db)
    qp = await qp_repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    if qp.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot modify an approved quote project")
    b_repo = QuoteBuildingRepository(db)
    building = QuoteBuilding(
        quote_project_id=quote_project_id,
        address=data.address,
        num_residents=data.num_residents,
        calculation_method=data.calculation_method,
        sort_order=data.sort_order,
    )
    created = await b_repo.create(building)
    created = await b_repo.get(created.id)
    return _building_to_out(created)


@router.put("/{quote_project_id}/buildings/{building_id}", response_model=QuoteBuildingOut)
async def update_building(
    quote_project_id: int,
    building_id: int,
    db: DBSessionDep,
    data: QuoteBuildingUpdate,
    user=Depends(get_current_user),
):
    qp_repo = QuoteProjectRepository(db)
    qp = await qp_repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    if qp.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot modify an approved quote project")
    b_repo = QuoteBuildingRepository(db)
    b = await b_repo.get(building_id)
    if not b or b.quote_project_id != quote_project_id:
        raise HTTPException(status_code=404, detail="Building not found")
    update_data = data.model_dump(exclude_unset=True)
    if 'address' in update_data:
        b.address = (update_data['address'] or '').strip() or None
    if 'num_residents' in update_data:
        b.num_residents = update_data['num_residents']
    if 'calculation_method' in update_data:
        b.calculation_method = update_data['calculation_method']
    if 'sort_order' in update_data:
        b.sort_order = update_data['sort_order']
    updated = await b_repo.update(b)
    updated = await b_repo.get(updated.id)
    return _building_to_out(updated)


@router.delete("/{quote_project_id}/buildings/{building_id}", status_code=204)
async def delete_building(
    quote_project_id: int,
    building_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    qp_repo = QuoteProjectRepository(db)
    qp = await qp_repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    if qp.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot modify an approved quote project")
    b_repo = QuoteBuildingRepository(db)
    b = await b_repo.get(building_id)
    if not b or b.quote_project_id != quote_project_id:
        raise HTTPException(status_code=404, detail="Building not found")
    await b_repo.delete(b)
    return None


@router.post("/{quote_project_id}/buildings/{building_id}/apartments/bulk", response_model=QuoteBuildingOut)
async def add_apartments_bulk(
    quote_project_id: int,
    building_id: int,
    db: DBSessionDep,
    data: QuoteApartmentsBulkCreate,
    user=Depends(get_current_user),
):
    qp_repo = QuoteProjectRepository(db)
    qp = await qp_repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    if qp.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot modify an approved quote project")
    b_repo = QuoteBuildingRepository(db)
    b = await b_repo.get(building_id)
    if not b or b.quote_project_id != quote_project_id:
        raise HTTPException(status_code=404, detail="Building not found")
    apt_repo = QuoteApartmentRepository(db)
    existing = await apt_repo.list_by_building(building_id)
    next_sort = len(existing)
    for i in range(data.count):
        apt = QuoteApartment(
            quote_building_id=building_id,
            size_sqm=data.size_sqm,
            sort_order=next_sort + i,
        )
        await apt_repo.create(apt)
    b = await b_repo.get(building_id)
    return _building_to_out(b)


@router.delete("/{quote_project_id}/buildings/{building_id}/apartments/{apartment_id}", status_code=204)
async def delete_apartment(
    quote_project_id: int,
    building_id: int,
    apartment_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    qp_repo = QuoteProjectRepository(db)
    qp = await qp_repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    if qp.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot modify an approved quote project")
    apt_repo = QuoteApartmentRepository(db)
    apt = await apt_repo.get(apartment_id)
    if not apt or apt.quote_building_id != building_id:
        raise HTTPException(status_code=404, detail="Apartment not found")
    await apt_repo.delete(apt)
    return None


class ApproveQuoteBody(BaseModel):
    """Optional: when quote has no project_id, client can pass an existing project to link."""
    project_id: int | None = None


@router.post("/{quote_project_id}/approve")
async def approve_quote_project(
    quote_project_id: int,
    db: DBSessionDep,
    body: ApproveQuoteBody | None = Body(None),
    user=Depends(get_current_user),
):
    """Approve quote project: create a real Project and link, or link to existing project (for standalone quotes)."""
    repo = QuoteProjectRepository(db)
    qp = await repo.get(quote_project_id)
    if not qp:
        raise HTTPException(status_code=404, detail="Quote project not found")
    if qp.status == "approved":
        raise HTTPException(status_code=400, detail="Quote project is already approved")
    if qp.converted_project_id:
        raise HTTPException(status_code=400, detail="Quote project already has a converted project")

    project_id_from_body = body.project_id if body is not None else None

    # If client provided project_id (e.g. from project creation modal for standalone quote), use it
    if project_id_from_body is not None:
        proj_repo = ProjectRepository(db)
        proj = await proj_repo.get_by_id(project_id_from_body)
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        qp.status = "approved"
        qp.converted_project_id = project_id_from_body
        await repo.update(qp)
        return {
            "message": "הצעת המחיר אושרה וחוברה לפרויקט",
            "quote_project_id": qp.id,
            "project_id": project_id_from_body,
        }

    # Resolve parent project id: use project_id (quote linked to project) or parent quote's converted project
    relation_project = getattr(qp, 'project_id', None)
    if relation_project is None and qp.parent_id:
        parent_qp = await repo.get(qp.parent_id)
        if parent_qp and parent_qp.converted_project_id:
            relation_project = parent_qp.converted_project_id

    # Determine is_parent_project: True if this quote project has children
    children_count = await repo.get_children_count(qp.id)
    is_parent_project = children_count > 0

    project_data = {
        "name": qp.name,
        "description": qp.description or None,
        "start_date": qp.expected_start_date,
        "end_date": None,
        "contract_duration_months": 12,
        "budget_monthly": float(qp.expected_income or 0),
        "budget_annual": float(qp.expected_income or 0) * 12,
        "manager_id": user.id,
        "relation_project": relation_project,
        "is_parent_project": is_parent_project,
        "num_residents": qp.num_residents,
        "address": None,
        "city": None,
    }
    project_service = ProjectService(db)
    created_project = await project_service.create(user_id=user.id, **project_data)

    qp.status = "approved"
    qp.converted_project_id = created_project.id
    await repo.update(qp)

    return {
        "message": "הצעת המחיר אושרה והפרויקט נוסף לרשימת הפרויקטים",
        "quote_project_id": qp.id,
        "project_id": created_project.id,
    }
