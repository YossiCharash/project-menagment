import uuid
from typing import List, Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.models.retirement import AssetRetirement
from backend.cems.models.signature import Signature
from backend.cems.models.transfer import Transfer, TransferStatus, WarehouseReturn, ReturnStatus
from backend.cems.repositories.base_repository import BaseRepository


class TransferRepository(BaseRepository[Transfer]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Transfer, session)

    async def get_pending_for_user(self, user_id: uuid.UUID) -> List[Transfer]:
        stmt = select(Transfer).where(
            Transfer.to_user_id == user_id,
            Transfer.status == TransferStatus.PENDING,
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_active_transfers_for_asset(self, asset_id: uuid.UUID) -> List[Transfer]:
        stmt = select(Transfer).where(
            Transfer.asset_id == asset_id,
            Transfer.status.in_([TransferStatus.PENDING, TransferStatus.APPROVED]),
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_status(
        self, status: TransferStatus, skip: int = 0, limit: int = 100
    ) -> List[Transfer]:
        stmt = (
            select(Transfer)
            .where(Transfer.status == status)
            .order_by(Transfer.initiated_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    # ---------- Signature ----------

    async def create_signature(self, data: dict) -> Signature:
        sig = Signature(**data)
        self._session.add(sig)
        await self._session.flush()
        return sig

    # ---------- Warehouse Return ----------

    async def create_return(self, data: dict) -> WarehouseReturn:
        wr = WarehouseReturn(**data)
        self._session.add(wr)
        await self._session.flush()
        return wr

    async def get_return_by_id(self, return_id: uuid.UUID) -> Optional[WarehouseReturn]:
        return await self._session.get(WarehouseReturn, return_id)

    async def get_pending_returns(
        self, warehouse_id: Optional[uuid.UUID] = None
    ) -> List[WarehouseReturn]:
        stmt = select(WarehouseReturn).where(WarehouseReturn.status == ReturnStatus.PENDING)
        if warehouse_id is not None:
            stmt = stmt.where(WarehouseReturn.warehouse_id == warehouse_id)
        stmt = stmt.order_by(WarehouseReturn.requested_at.desc())
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    # ---------- Retirement ----------

    async def create_retirement(self, data: dict) -> AssetRetirement:
        ret = AssetRetirement(**data)
        self._session.add(ret)
        await self._session.flush()
        return ret

    async def get_retirement_by_id(self, retirement_id: uuid.UUID) -> Optional[AssetRetirement]:
        return await self._session.get(AssetRetirement, retirement_id)

    async def get_retirements_by_status(
        self, status: str, skip: int = 0, limit: int = 100
    ) -> List[AssetRetirement]:
        stmt = (
            select(AssetRetirement)
            .where(AssetRetirement.status == status)
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
