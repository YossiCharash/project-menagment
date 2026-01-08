from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.supplier_document import SupplierDocument


class SupplierDocumentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, doc: SupplierDocument) -> SupplierDocument:
        self.db.add(doc)
        await self.db.commit()
        await self.db.refresh(doc)
        return doc

    async def list_by_supplier(self, supplier_id: int) -> list[SupplierDocument]:
        res = await self.db.execute(select(SupplierDocument).where(SupplierDocument.supplier_id == supplier_id))
        return list(res.scalars().all())

    async def get_by_transaction_id(self, transaction_id: int) -> list[SupplierDocument]:
        res = await self.db.execute(select(SupplierDocument).where(SupplierDocument.transaction_id == transaction_id))
        return list(res.scalars().all())

    async def update(self, doc: SupplierDocument) -> SupplierDocument:
        await self.db.commit()
        await self.db.refresh(doc)
        return doc

    async def get_by_id(self, doc_id: int) -> SupplierDocument | None:
        res = await self.db.execute(select(SupplierDocument).where(SupplierDocument.id == doc_id))
        return res.scalar_one_or_none()

    async def delete(self, doc: SupplierDocument) -> None:
        await self.db.delete(doc)
        await self.db.commit()