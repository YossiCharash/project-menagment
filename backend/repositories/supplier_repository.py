from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.supplier import Supplier


class SupplierRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, supplier: Supplier) -> Supplier:
        self.db.add(supplier)
        await self.db.commit()
        await self.db.refresh(supplier)
        return supplier

    async def list(self) -> list[Supplier]:
        res = await self.db.execute(select(Supplier))
        return list(res.scalars().all())

    async def get(self, supplier_id: int) -> Supplier | None:
        res = await self.db.execute(select(Supplier).where(Supplier.id == supplier_id))
        return res.scalar_one_or_none()

    async def update(self, supplier: Supplier) -> Supplier:
        await self.db.commit()
        await self.db.refresh(supplier)
        return supplier

    async def delete(self, supplier: Supplier) -> None:
        await self.db.delete(supplier)
        await self.db.commit()
