from fastapi import APIRouter, Depends, HTTPException, Query
from backend.core.deps import DBSessionDep, get_current_user
from backend.models.quote_structure_item import QuoteStructureItem
from backend.repositories.quote_structure_repository import QuoteStructureRepository
from backend.schemas.quote_structure import (
    QuoteStructureItemCreate,
    QuoteStructureItemOut,
    QuoteStructureItemUpdate,
)

router = APIRouter()


@router.get("/", response_model=list[QuoteStructureItemOut])
async def list_quote_structure_items(
    db: DBSessionDep,
    include_inactive: bool = Query(False),
    user=Depends(get_current_user),
):
    """List quote structure items (חלוקת הצעת מחיר) - for use in Settings and when building quotes"""
    repo = QuoteStructureRepository(db)
    items = await repo.list(include_inactive=include_inactive)
    return [QuoteStructureItemOut.model_validate(i) for i in items]


@router.get("/{item_id}", response_model=QuoteStructureItemOut)
async def get_quote_structure_item(
    item_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    repo = QuoteStructureRepository(db)
    item = await repo.get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Quote structure item not found")
    return QuoteStructureItemOut.model_validate(item)


@router.post("/", response_model=QuoteStructureItemOut)
async def create_quote_structure_item(
    db: DBSessionDep,
    data: QuoteStructureItemCreate,
    user=Depends(get_current_user),
):
    item = QuoteStructureItem(
        name=data.name.strip(),
        sort_order=data.sort_order,
    )
    repo = QuoteStructureRepository(db)
    created = await repo.create(item)
    return QuoteStructureItemOut.model_validate(created)


@router.put("/{item_id}", response_model=QuoteStructureItemOut)
async def update_quote_structure_item(
    item_id: int,
    db: DBSessionDep,
    data: QuoteStructureItemUpdate,
    user=Depends(get_current_user),
):
    repo = QuoteStructureRepository(db)
    item = await repo.get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Quote structure item not found")
    if data.name is not None:
        item.name = data.name.strip()
    if data.sort_order is not None:
        item.sort_order = data.sort_order
    if data.is_active is not None:
        item.is_active = data.is_active
    updated = await repo.update(item)
    return QuoteStructureItemOut.model_validate(updated)


@router.delete("/{item_id}", status_code=204)
async def delete_quote_structure_item(
    item_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    repo = QuoteStructureRepository(db)
    item = await repo.get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Quote structure item not found")
    await repo.delete(item)
    return None
