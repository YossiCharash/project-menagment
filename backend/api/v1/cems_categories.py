import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.config import settings
from backend.api.v1.cems_deps import (
    get_current_user,
    get_db,
    require_admin,
    require_admin_or_manager,
)
from backend.models.cems_category import AssetCategory
from backend.models.cems_consumable import ConsumableItem
from backend.models.cems_fixed_asset import FixedAsset
from backend.repositories.cems_base_repository import BaseRepository
from backend.schemas.cems_category import (
    AssetCategoryCreate,
    AssetCategoryRead,
    AssetCategoryTreeNode,
    AssetCategoryUpdate,
    CategoryItemRead,
)
from backend.services.cems_category_service import CategoryTreeService
from backend.models.user import User

router = APIRouter(prefix="/categories", tags=["CEMS Categories"])

_ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


def _get_category_images_dir() -> str:
    base = settings.FILE_UPLOAD_DIR
    if not os.path.isabs(base):
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        base = os.path.abspath(os.path.join(backend_dir, base))
    d = os.path.join(base, "category_images")
    os.makedirs(d, exist_ok=True)
    return d


# ── Helpers ─────────────────────────────────────────────────────────────────


async def _load_category(db: AsyncSession, category_id: uuid.UUID) -> AssetCategory:
    stmt = (
        select(AssetCategory)
        .options(selectinload(AssetCategory.warehouse))
        .where(AssetCategory.id == category_id)
    )
    result = await db.execute(stmt)
    cat = result.scalar_one_or_none()
    if cat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
    return cat


async def _get_children_count(db: AsyncSession, category_id: uuid.UUID) -> int:
    stmt = select(func.count()).select_from(AssetCategory).where(AssetCategory.parent_id == category_id)
    return (await db.execute(stmt)).scalar_one()


async def _get_items_count(db: AsyncSession, category_id: uuid.UUID) -> int:
    asset_stmt = select(func.count()).select_from(FixedAsset).where(FixedAsset.category_id == category_id)
    consumable_stmt = select(func.count()).select_from(ConsumableItem).where(ConsumableItem.category_id == category_id)
    assets = (await db.execute(asset_stmt)).scalar_one()
    consumables = (await db.execute(consumable_stmt)).scalar_one()
    return assets + consumables


async def _to_read_schema(db: AsyncSession, category: AssetCategory) -> AssetCategoryRead:
    children_count = await _get_children_count(db, category.id)
    items_count = await _get_items_count(db, category.id)
    return AssetCategoryRead.from_orm_with_warehouse(
        category,
        children_count=children_count,
        items_count=items_count,
    )


# ── Tree endpoint (must be registered BEFORE /{category_id}) ───────────────


@router.get("/tree", response_model=List[AssetCategoryTreeNode])
async def get_category_tree(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AssetCategoryTreeNode]:
    """Return the full category hierarchy as a nested tree."""
    service = CategoryTreeService(db)
    return await service.get_tree()


# ── Standard CRUD ──────────────────────────────────────────────────────────


@router.get("", response_model=List[AssetCategoryRead])
async def list_categories(
    warehouse_id: Optional[uuid.UUID] = Query(None, description="Filter by warehouse"),
    parent_id: Optional[uuid.UUID] = Query(None, description="Filter by parent category"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AssetCategoryRead]:
    stmt = select(AssetCategory).options(selectinload(AssetCategory.warehouse))
    if warehouse_id is not None:
        stmt = stmt.where(AssetCategory.warehouse_id == warehouse_id)
    if parent_id is not None:
        stmt = stmt.where(AssetCategory.parent_id == parent_id)
    stmt = stmt.order_by(AssetCategory.position, AssetCategory.name).offset(skip).limit(limit)
    result = await db.execute(stmt)
    categories = list(result.scalars().all())

    read_list: list[AssetCategoryRead] = []
    for cat in categories:
        read_list.append(await _to_read_schema(db, cat))
    return read_list


@router.post("", response_model=AssetCategoryRead, status_code=201)
async def create_category(
    payload: AssetCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> AssetCategoryRead:
    if payload.parent_id is not None:
        service = CategoryTreeService(db)
        await service.validate_parent(payload.parent_id)

    repo = BaseRepository(AssetCategory, db)
    category = await repo.create(payload.model_dump())
    category = await _load_category(db, category.id)
    return await _to_read_schema(db, category)


@router.put("/{category_id}", response_model=AssetCategoryRead)
async def update_category(
    category_id: uuid.UUID,
    payload: AssetCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> AssetCategoryRead:
    data = payload.model_dump(exclude_unset=True)

    if "parent_id" in data and data["parent_id"] is not None:
        service = CategoryTreeService(db)
        await service.validate_parent(data["parent_id"], category_id=category_id)

    repo = BaseRepository(AssetCategory, db)
    category = await repo.update(category_id, data)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
    category = await _load_category(db, category_id)
    return await _to_read_schema(db, category)


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> None:
    service = CategoryTreeService(db)

    # Verify category exists before checking items.
    existing = await db.get(AssetCategory, category_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    if not await service.can_delete(category_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="לא ניתן למחוק קטגוריה שמשויכים אליה פריטים",
        )

    repo = BaseRepository(AssetCategory, db)
    await repo.delete(category_id)


# ── Category items ─────────────────────────────────────────────────────────


@router.get("/{category_id}/items", response_model=List[CategoryItemRead])
async def get_category_items(
    category_id: uuid.UUID,
    include_descendants: bool = Query(False, description="Include items from sub-categories"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[CategoryItemRead]:
    """Return all items (assets + consumables) in a category."""
    service = CategoryTreeService(db)
    return await service.get_category_items(category_id, include_descendants=include_descendants)


# ── Image upload ───────────────────────────────────────────────────────────


@router.post("/{category_id}/upload-image", response_model=AssetCategoryRead)
async def upload_category_image(
    category_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> AssetCategoryRead:
    """Upload or replace the image for a category."""
    import io as _io

    ext = (os.path.splitext(file.filename or "")[1] or "").lower()
    if ext not in _ALLOWED_IMAGE_EXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="סוג קובץ לא נתמך. מותרים: jpg, jpeg, png",
        )
    content = await file.read()
    if len(content) > _MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="גודל תמונה מקסימלי: 10 MB",
        )

    repo = BaseRepository(AssetCategory, db)
    category = await repo.get_by_id(category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    if settings.AWS_S3_BUCKET:
        from backend.services.s3_service import S3Service
        s3 = S3Service()
        if category.image_url and category.image_url.startswith("http"):
            try:
                s3.delete_file(category.image_url)
            except Exception:
                pass
        new_image_url = s3.upload_file(
            prefix="category_images",
            file_obj=_io.BytesIO(content),
            filename=file.filename or "image",
            content_type=file.content_type,
        )
    else:
        base = settings.FILE_UPLOAD_DIR
        if not os.path.isabs(base):
            backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            base = os.path.abspath(os.path.join(backend_dir, base))

        safe_name = (file.filename or "image").strip().replace("/", "_").replace("\\", "_") or "image"
        stored_name = f"{uuid.uuid4().hex}_{safe_name}"
        new_full_path = os.path.join(_get_category_images_dir(), stored_name)
        with open(new_full_path, "wb") as fh:
            fh.write(content)

        if category.image_url and not category.image_url.startswith("http"):
            old_path = os.path.join(base, category.image_url)
            if os.path.isfile(old_path):
                try:
                    os.remove(old_path)
                except OSError:
                    pass
        new_image_url = f"category_images/{stored_name}"

    category = await repo.update(category_id, {"image_url": new_image_url})
    category = await _load_category(db, category_id)
    return await _to_read_schema(db, category)
