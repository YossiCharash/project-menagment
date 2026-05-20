import io
import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.cems.api.deps import (
    get_current_user,
    get_db,
    require_admin,
    require_admin_or_manager,
)
from backend.cems.configurations.file_uploads import (
    ALLOWED_PHOTO_EXTENSIONS,
    CATEGORY_IMAGE_PREFIX,
    DEFAULT_IMAGE_FILENAME,
    MAX_PHOTO_BYTES,
    MAX_PHOTO_SIZE_MB,
)
from backend.cems.configurations.pagination import (
    DEFAULT_LIMIT,
    DEFAULT_SKIP,
    MAX_LIMIT,
    MIN_LIMIT,
)
from backend.cems.core.exceptions import (
    CategoryHasItemsError,
    CategoryNotFoundError,
    FileTooLargeError,
    UnsupportedFileExtensionError,
)
from backend.cems.models.category import AssetCategory
from backend.cems.models.consumable import ConsumableItem
from backend.cems.models.fixed_asset import FixedAsset
from backend.cems.repositories.base_repository import BaseRepository
from backend.cems.schemas.category import (
    AssetCategoryCreate,
    AssetCategoryRead,
    AssetCategoryTreeNode,
    AssetCategoryUpdate,
    CategoryItemRead,
)
from backend.cems.services.category_service import CategoryTreeService
from backend.cems.services.photo_storage import PhotoStorage
from backend.core.config import settings
from backend.models.user import User

router = APIRouter(prefix="/categories", tags=["CEMS Categories"])


async def _load_category(db: AsyncSession, category_id: uuid.UUID) -> AssetCategory:
    stmt = (
        select(AssetCategory)
        .options(selectinload(AssetCategory.warehouse))
        .where(AssetCategory.id == category_id)
    )
    result = await db.execute(stmt)
    cat = result.scalar_one_or_none()
    if cat is None:
        raise CategoryNotFoundError()
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


@router.get("/tree", response_model=List[AssetCategoryTreeNode])
async def get_category_tree(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AssetCategoryTreeNode]:
    service = CategoryTreeService(db)
    return await service.get_tree()


@router.get("", response_model=List[AssetCategoryRead])
async def list_categories(
    warehouse_id: Optional[uuid.UUID] = Query(None, description="Filter by warehouse"),
    parent_id: Optional[uuid.UUID] = Query(None, description="Filter by parent category"),
    skip: int = Query(DEFAULT_SKIP, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=MIN_LIMIT, le=MAX_LIMIT),
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
        raise CategoryNotFoundError()
    category = await _load_category(db, category_id)
    return await _to_read_schema(db, category)


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> None:
    service = CategoryTreeService(db)

    existing = await db.get(AssetCategory, category_id)
    if existing is None:
        raise CategoryNotFoundError()

    if not await service.can_delete(category_id):
        raise CategoryHasItemsError()

    repo = BaseRepository(AssetCategory, db)
    await repo.delete(category_id)


@router.get("/{category_id}/items", response_model=List[CategoryItemRead])
async def get_category_items(
    category_id: uuid.UUID,
    include_descendants: bool = Query(False, description="Include items from sub-categories"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[CategoryItemRead]:
    service = CategoryTreeService(db)
    return await service.get_category_items(category_id, include_descendants=include_descendants)


@router.post("/{category_id}/upload-image", response_model=AssetCategoryRead)
async def upload_category_image(
    category_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> AssetCategoryRead:
    """Upload or replace the image for a category."""
    ext = (os.path.splitext(file.filename or "")[1] or "").lower()
    if ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise UnsupportedFileExtensionError(photo_only=True)
    content = await file.read()
    if len(content) > MAX_PHOTO_BYTES:
        raise FileTooLargeError(MAX_PHOTO_SIZE_MB, is_photo=True)

    repo = BaseRepository(AssetCategory, db)
    category = await repo.get_by_id(category_id)
    if category is None:
        raise CategoryNotFoundError()

    if settings.AWS_S3_BUCKET:
        from backend.services.s3_service import S3Service
        s3 = S3Service()
        if category.image_url and category.image_url.startswith("http"):
            try:
                s3.delete_file(category.image_url)
            except Exception:
                pass
        new_image_url = s3.upload_file(
            prefix=CATEGORY_IMAGE_PREFIX,
            file_obj=io.BytesIO(content),
            filename=file.filename or DEFAULT_IMAGE_FILENAME,
            content_type=file.content_type,
        )
    else:
        target_dir = PhotoStorage.ensure_local_dir(CATEGORY_IMAGE_PREFIX)
        safe_name = (file.filename or DEFAULT_IMAGE_FILENAME).strip().replace("/", "_").replace("\\", "_") or DEFAULT_IMAGE_FILENAME
        stored_name = f"{uuid.uuid4().hex}_{safe_name}"
        new_full_path = os.path.join(target_dir, stored_name)
        with open(new_full_path, "wb") as fh:
            fh.write(content)

        if category.image_url and not category.image_url.startswith("http"):
            base = PhotoStorage.resolve_upload_base()
            old_path = os.path.join(base, category.image_url)
            if os.path.isfile(old_path):
                try:
                    os.remove(old_path)
                except OSError:
                    pass
        new_image_url = f"{CATEGORY_IMAGE_PREFIX}/{stored_name}"

    category = await repo.update(category_id, {"image_url": new_image_url})
    category = await _load_category(db, category_id)
    return await _to_read_schema(db, category)
