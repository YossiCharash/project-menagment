"""Service layer for hierarchical category operations.

Responsibilities:
- Parent validation (existence, depth, cycle prevention)
- Tree construction from flat category list
- Unified item listing across FixedAsset and ConsumableItem
- Deletion safety checks
"""

import uuid
from collections import defaultdict
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.models.cems_category import AssetCategory
from backend.models.cems_consumable import ConsumableItem
from backend.models.cems_fixed_asset import FixedAsset
from backend.schemas.cems_category import AssetCategoryTreeNode, CategoryItemRead

_MAX_DEPTH = 3


class CategoryTreeService:
    """Handles all tree-related operations for asset categories."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── Validation ──────────────────────────────────────────────────────────

    async def validate_parent(
        self,
        parent_id: uuid.UUID,
        category_id: Optional[uuid.UUID] = None,
    ) -> None:
        """Validate that *parent_id* is a legal parent for *category_id*.

        Checks:
        1. Parent category exists.
        2. Parent is not the category itself.
        3. Assigning this parent would not exceed MAX_DEPTH (3 levels).
        4. Assigning this parent would not create a cycle.
        """
        if category_id is not None and parent_id == category_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="קטגוריה לא יכולה להיות ההורה של עצמה.",
            )

        parent = await self._db.get(AssetCategory, parent_id)
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="קטגוריית האב לא נמצאה.",
            )

        # Check depth: walk up from parent to root and count levels.
        depth = 1  # The parent itself is at least depth 1.
        current = parent
        visited: set[uuid.UUID] = {parent_id}
        while current.parent_id is not None:
            if current.parent_id in visited:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="זוהה מעגל בהיררכיית הקטגוריות.",
                )
            visited.add(current.parent_id)
            current = await self._db.get(AssetCategory, current.parent_id)
            if current is None:
                break
            depth += 1

        # The new category would be at depth+1. Max allowed is _MAX_DEPTH.
        if depth + 1 > _MAX_DEPTH:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"עומק מקסימלי של היררכיה הוא {_MAX_DEPTH} רמות.",
            )

        # Cycle check: if reparenting an existing category, ensure parent_id
        # is not a descendant of category_id.
        if category_id is not None:
            descendant_ids = await self.get_descendant_ids(category_id)
            if parent_id in descendant_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="לא ניתן להגדיר קטגוריה צאצאית כהורה.",
                )

    # ── Tree ────────────────────────────────────────────────────────────────

    async def get_tree(self) -> list[AssetCategoryTreeNode]:
        """Return all categories as a nested tree structure.

        Loads all categories in a single query, then builds the tree
        in-memory to avoid N+1 queries.
        """
        stmt = select(AssetCategory).order_by(AssetCategory.position, AssetCategory.name)
        result = await self._db.execute(stmt)
        categories = list(result.scalars().all())

        # Fetch item counts for all categories in bulk.
        items_count_map = await self._get_all_items_counts()

        # Build lookup structures.
        node_map: dict[uuid.UUID, AssetCategoryTreeNode] = {}
        children_map: dict[Optional[uuid.UUID], list[uuid.UUID]] = defaultdict(list)

        for cat in categories:
            cat_id = cat.id
            children_map[cat.parent_id].append(cat_id)
            node_map[cat_id] = AssetCategoryTreeNode(
                id=cat_id,
                name=cat.name,
                description=cat.description,
                image_url=cat.image_url,
                position=cat.position,
                parent_id=cat.parent_id,
                items_count=items_count_map.get(cat_id, 0),
                children_count=0,
                children=[],
            )

        # Wire children into parents (bottom-up).
        roots: list[AssetCategoryTreeNode] = []
        for cat_id, node in node_map.items():
            child_ids = children_map.get(cat_id, [])
            node.children = [node_map[cid] for cid in child_ids]
            node.children_count = len(node.children)
            if node.parent_id is None:
                roots.append(node)

        return roots

    # ── Items ───────────────────────────────────────────────────────────────

    async def get_category_items(
        self,
        category_id: uuid.UUID,
        include_descendants: bool = False,
    ) -> list[CategoryItemRead]:
        """Return a unified list of FixedAssets and ConsumableItems for a category."""
        category = await self._db.get(AssetCategory, category_id)
        if category is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="קטגוריה לא נמצאה.",
            )

        target_ids: set[uuid.UUID] = {category_id}
        if include_descendants:
            target_ids |= await self.get_descendant_ids(category_id)

        items: list[CategoryItemRead] = []

        # Fixed assets
        asset_stmt = (
            select(FixedAsset)
            .options(selectinload(FixedAsset.current_warehouse))
            .where(FixedAsset.category_id.in_(target_ids))
            .order_by(FixedAsset.name)
        )
        asset_result = await self._db.execute(asset_stmt)
        for asset in asset_result.scalars().all():
            warehouse = asset.current_warehouse
            items.append(CategoryItemRead(
                id=asset.id,
                name=asset.name,
                type="asset",
                status=asset.status.value if asset.status else None,
                quantity=None,
                unit=None,
                photo_url=asset.photo_url,
                warehouse_name=warehouse.name if warehouse else None,
            ))

        # Consumable items
        consumable_stmt = (
            select(ConsumableItem)
            .options(selectinload(ConsumableItem.warehouse))
            .where(ConsumableItem.category_id.in_(target_ids))
            .order_by(ConsumableItem.name)
        )
        consumable_result = await self._db.execute(consumable_stmt)
        for item in consumable_result.scalars().all():
            warehouse = item.warehouse
            items.append(CategoryItemRead(
                id=item.id,
                name=item.name,
                type="consumable",
                status=None,
                quantity=str(item.quantity),
                unit=item.unit,
                photo_url=item.image_url,
                warehouse_name=warehouse.name if warehouse else None,
            ))

        return items

    # ── Descendant helpers ──────────────────────────────────────────────────

    async def get_descendant_ids(self, category_id: uuid.UUID) -> set[uuid.UUID]:
        """Recursively collect all descendant category IDs."""
        all_ids: set[uuid.UUID] = set()
        queue: list[uuid.UUID] = [category_id]

        while queue:
            current_id = queue.pop()
            stmt = select(AssetCategory.id).where(AssetCategory.parent_id == current_id)
            result = await self._db.execute(stmt)
            child_ids = list(result.scalars().all())
            for cid in child_ids:
                if cid not in all_ids:
                    all_ids.add(cid)
                    queue.append(cid)

        return all_ids

    # ── Deletion safety ─────────────────────────────────────────────────────

    async def can_delete(self, category_id: uuid.UUID) -> bool:
        """Return True only if no items reference this category or any descendant."""
        target_ids = {category_id} | await self.get_descendant_ids(category_id)

        asset_count_stmt = (
            select(func.count())
            .select_from(FixedAsset)
            .where(FixedAsset.category_id.in_(target_ids))
        )
        consumable_count_stmt = (
            select(func.count())
            .select_from(ConsumableItem)
            .where(ConsumableItem.category_id.in_(target_ids))
        )

        asset_count = (await self._db.execute(asset_count_stmt)).scalar_one()
        consumable_count = (await self._db.execute(consumable_count_stmt)).scalar_one()

        return (asset_count + consumable_count) == 0

    # ── Private helpers ─────────────────────────────────────────────────────

    async def _get_all_items_counts(self) -> dict[uuid.UUID, int]:
        """Bulk-fetch item counts per category (assets + consumables)."""
        asset_stmt = (
            select(FixedAsset.category_id, func.count().label("cnt"))
            .group_by(FixedAsset.category_id)
        )
        consumable_stmt = (
            select(ConsumableItem.category_id, func.count().label("cnt"))
            .group_by(ConsumableItem.category_id)
        )

        counts: dict[uuid.UUID, int] = {}

        asset_result = await self._db.execute(asset_stmt)
        for row in asset_result.all():
            counts[row[0]] = row[1]

        consumable_result = await self._db.execute(consumable_stmt)
        for row in consumable_result.all():
            counts[row[0]] = counts.get(row[0], 0) + row[1]

        return counts
