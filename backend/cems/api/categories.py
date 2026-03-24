import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import get_current_user, get_db, require_admin, require_admin_or_manager
from backend.cems.models.category import AssetCategory
from backend.cems.repositories.base_repository import BaseRepository
from backend.cems.schemas.category import AssetCategoryCreate, AssetCategoryRead, AssetCategoryUpdate
from backend.models.user import User

router = APIRouter(prefix="/categories", tags=["CEMS Categories"])


@router.get("", response_model=List[AssetCategoryRead])
async def list_categories(
    warehouse_id: Optional[uuid.UUID] = Query(None, description="Filter by warehouse"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AssetCategoryRead]:
    stmt = select(AssetCategory)
    if warehouse_id is not None:
        stmt = stmt.where(AssetCategory.warehouse_id == warehouse_id)
    stmt = stmt.order_by(AssetCategory.name).offset(skip).limit(limit)
    result = await db.execute(stmt)
    categories = list(result.scalars().all())
    return [AssetCategoryRead.from_orm_with_warehouse(c) for c in categories]


@router.post("", response_model=AssetCategoryRead, status_code=201)
async def create_category(
    payload: AssetCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> AssetCategoryRead:
    repo = BaseRepository(AssetCategory, db)
    category = await repo.create(payload.model_dump())
    return AssetCategoryRead.from_orm_with_warehouse(category)


@router.put("/{category_id}", response_model=AssetCategoryRead)
async def update_category(
    category_id: uuid.UUID,
    payload: AssetCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> AssetCategoryRead:
    repo = BaseRepository(AssetCategory, db)
    data = payload.model_dump(exclude_unset=True)
    category = await repo.update(category_id, data)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
    return AssetCategoryRead.from_orm_with_warehouse(category)


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> None:
    repo = BaseRepository(AssetCategory, db)
    deleted = await repo.delete(category_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
