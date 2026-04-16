from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.supplier import Supplier
from backend.models.transaction import Transaction


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

    async def list_suppliers_by_category_id(self, category_id: int) -> list[Supplier]:
        """Return all suppliers whose ``category_id`` equals the given id."""
        query = select(Supplier).where(Supplier.category_id == category_id)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count_total_transactions_for_suppliers(self, supplier_ids: list[int]) -> int:
        """Count transactions whose ``supplier_id`` is in the given list. Returns 0 if empty."""
        if not supplier_ids:
            return 0
        query = select(func.count(Transaction.id)).where(
            Transaction.supplier_id.in_(supplier_ids)
        )
        result = await self.db.execute(query)
        return int(result.scalar_one() or 0)

    async def count_transactions_per_supplier_ids(
        self, supplier_ids: list[int]
    ) -> dict[int, int]:
        """Map ``supplier_id`` -> transaction count via a single GROUP BY query.

        Suppliers with zero transactions are NOT present in the dict; callers
        should use ``dict.get(id, 0)``. Returns ``{}`` if ``supplier_ids`` is empty.
        """
        if not supplier_ids:
            return {}
        query = (
            select(Transaction.supplier_id, func.count(Transaction.id).label("tx_count"))
            .where(Transaction.supplier_id.in_(supplier_ids))
            .group_by(Transaction.supplier_id)
        )
        result = await self.db.execute(query)
        return {row.supplier_id: int(row.tx_count) for row in result.all()}

    async def set_category_id_to_null_for_suppliers(
        self, supplier_ids: list[int]
    ) -> None:
        """Bulk-clear ``category_id`` on the given suppliers. No-op if list empty."""
        if not supplier_ids:
            return
        query = (
            update(Supplier)
            .where(Supplier.id.in_(supplier_ids))
            .values(category_id=None)
        )
        await self.db.execute(query)
        await self.db.commit()
