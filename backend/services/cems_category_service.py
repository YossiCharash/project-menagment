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

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.configurations.cems.category_limits import MAX_CATEGORY_DEPTH
from backend.core.exceptions.cems import (
    CategoryCycleDetectedError,
    CategoryDescendantAsParentError,
    CategoryMaxDepthExceededError,
    CategoryNotFoundError,
    CategorySelfParentError,
    ParentCategoryNotFoundError,
)
from backend.models.cems_category import AssetCategory
from backend.models.cems_consumable import ConsumableItem
from backend.models.cems_fixed_asset import FixedAsset
from backend.schemas.cems_category import AssetCategoryTreeNode, CategoryItemRead


class CategoryTreeService:
    """Handles all tree-related operations for asset categories."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def validate_parent(
        self,
        parent_id: uuid.UUID,
        category_id: Optional[uuid.UUID] = None,
    ) -> None:
        if category_id is not None and parent_id == category_id:
            raise CategorySelfParentError()

        parent = await self._db.get(AssetCategory, parent_id)
        if parent is None:
            raise ParentCategoryNotFoundError()

        depth = 1
        current = parent
        visited: set[uuid.UUID] = {parent_id}
        while current.parent_id is not None:
            if current.parent_id in visited:
                raise CategoryCycleDetectedError()
            visited.add(current.parent_id)
            current = await self._db.get(AssetCategory, current.parent_id)
            if current is None:
                break
            depth += 1

        if depth + 1 > MAX_CATEGORY_DEPTH:
            raise CategoryMaxDepthExceededError(MAX_CATEGORY_DEPTH)

        if category_id is not None:
            descendant_ids = await self.get_descendant_ids(category_id)
            if parent_id in descendant_ids:
                raise CategoryDescendantAsParentError()

    async def get_tree(self) -> list[AssetCategoryTreeNode]:
        stmt = select(AssetCategory).order_by(AssetCategory.position, AssetCategory.name)
        result = await self._db.execute(stmt)
        categories = list(result.scalars().all())

        items_count_map = await self._get_all_items_counts()

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

        roots: list[AssetCategoryTreeNode] = []
        for cat_id, node in node_map.items():
            child_ids = children_map.get(cat_id, [])
            node.children = [node_map[cid] for cid in child_ids]
            node.children_count = len(node.children)
            if node.parent_id is None:
                roots.append(node)

        return roots

    async def get_category_items(
        self,
        category_id: uuid.UUID,
        include_descendants: bool = False,
    ) -> list[CategoryItemRead]:
        category = await self._db.get(AssetCategory, category_id)
        if category is None:
            raise CategoryNotFoundError()

        target_ids: set[uuid.UUID] = {category_id}
        if include_descendants:
            target_ids |= await self.get_descendant_ids(category_id)

        items: list[CategoryItemRead] = []

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

    async def get_descendant_ids(self, category_id: uuid.UUID) -> set[uuid.UUID]:
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

    async def can_delete(self, category_id: uuid.UUID) -> bool:
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

    async def _get_all_items_counts(self) -> dict[uuid.UUID, int]:
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
