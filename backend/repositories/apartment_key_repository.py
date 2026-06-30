from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.models.apartment_key import ApartmentKey, KeyTransfer


class ApartmentKeyRepository:
    """Data access for apartment keys (מפתחות) and their transfer log."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, key_id: int) -> ApartmentKey | None:
        result = await self.db.execute(
            select(ApartmentKey)
            .options(selectinload(ApartmentKey.transfers))
            .where(ApartmentKey.id == key_id)
        )
        return result.scalar_one_or_none()

    async def list_by_apartment(self, apartment_id: int) -> List[ApartmentKey]:
        result = await self.db.execute(
            select(ApartmentKey)
            .options(selectinload(ApartmentKey.transfers))
            .where(ApartmentKey.apartment_id == apartment_id)
            .order_by(ApartmentKey.label, ApartmentKey.id)
        )
        return list(result.scalars().all())

    async def create(self, key: ApartmentKey) -> ApartmentKey:
        self.db.add(key)
        await self.db.commit()
        await self.db.refresh(key)
        return key

    async def update(self, key: ApartmentKey) -> ApartmentKey:
        await self.db.commit()
        await self.db.refresh(key)
        return key

    async def delete(self, key: ApartmentKey) -> None:
        await self.db.delete(key)
        await self.db.commit()

    async def add_transfer(self, transfer: KeyTransfer) -> KeyTransfer:
        self.db.add(transfer)
        await self.db.commit()
        await self.db.refresh(transfer)
        return transfer


class KeyTransferRepository:
    """Data access for the key-transfer journal (יומן מסירת מפתחות)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_by_key(self, key_id: int) -> List[KeyTransfer]:
        result = await self.db.execute(
            select(KeyTransfer)
            .where(KeyTransfer.key_id == key_id)
            .order_by(KeyTransfer.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, transfer: KeyTransfer) -> KeyTransfer:
        self.db.add(transfer)
        await self.db.commit()
        await self.db.refresh(transfer)
        return transfer
