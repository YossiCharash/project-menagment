import uuid
from datetime import date, timedelta
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.models.fixed_asset import AssetHistory, AssetStatus, FixedAsset
from backend.cems.models.base import _utc_now
from backend.cems.repositories.base_repository import BaseRepository


class AssetRepository(BaseRepository[FixedAsset]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(FixedAsset, session)

    async def get_by_serial(self, serial_number: str) -> Optional[FixedAsset]:
        stmt = select(FixedAsset).where(FixedAsset.serial_number == serial_number)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_custodian(
        self, user_id: uuid.UUID, skip: int = 0, limit: int = 100
    ) -> List[FixedAsset]:
        stmt = (
            select(FixedAsset)
            .where(FixedAsset.current_custodian_id == user_id)
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_warehouse(
        self, warehouse_id: uuid.UUID, skip: int = 0, limit: int = 100
    ) -> List[FixedAsset]:
        stmt = (
            select(FixedAsset)
            .where(FixedAsset.current_warehouse_id == warehouse_id)
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_project(
        self, project_id: uuid.UUID, skip: int = 0, limit: int = 100
    ) -> List[FixedAsset]:
        stmt = (
            select(FixedAsset)
            .where(FixedAsset.project_id == project_id)
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_status(
        self, status: AssetStatus, skip: int = 0, limit: int = 100
    ) -> List[FixedAsset]:
        stmt = (
            select(FixedAsset)
            .where(FixedAsset.status == status)
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_expiring_warranties(self, days_ahead: int = 30) -> List[FixedAsset]:
        cutoff = date.today() + timedelta(days=days_ahead)
        stmt = (
            select(FixedAsset)
            .where(
                FixedAsset.warranty_expiry.isnot(None),
                FixedAsset.warranty_expiry <= cutoff,
                FixedAsset.status != AssetStatus.RETIRED,
            )
            .order_by(FixedAsset.warranty_expiry.asc())
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def log_history(
        self,
        asset_id: uuid.UUID,
        action: str,
        actor_id: uuid.UUID,
        from_custodian_id: Optional[uuid.UUID] = None,
        to_custodian_id: Optional[uuid.UUID] = None,
        from_warehouse_id: Optional[uuid.UUID] = None,
        to_warehouse_id: Optional[uuid.UUID] = None,
        notes: Optional[str] = None,
    ) -> AssetHistory:
        entry = AssetHistory(
            asset_id=asset_id,
            action=action,
            actor_id=actor_id,
            from_custodian_id=from_custodian_id,
            to_custodian_id=to_custodian_id,
            from_warehouse_id=from_warehouse_id,
            to_warehouse_id=to_warehouse_id,
            notes=notes,
        )
        self._session.add(entry)
        await self._session.flush()
        return entry

    async def get_history(
        self, asset_id: uuid.UUID, skip: int = 0, limit: int = 100
    ) -> List[AssetHistory]:
        stmt = (
            select(AssetHistory)
            .where(AssetHistory.asset_id == asset_id)
            .order_by(AssetHistory.timestamp.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
