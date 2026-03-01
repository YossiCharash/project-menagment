from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.document import Document


class DocumentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, doc: Document) -> Document:
        self.db.add(doc)
        await self.db.commit()
        await self.db.refresh(doc)
        return doc

    async def get_by_id(self, doc_id: int) -> Document | None:
        res = await self.db.execute(select(Document).where(Document.id == doc_id))
        return res.scalar_one_or_none()

    async def list_by_entity(self, entity_type: str, entity_id: int) -> list[Document]:
        res = await self.db.execute(
            select(Document).where(
                Document.entity_type == entity_type,
                Document.entity_id == entity_id,
            )
        )
        return list(res.scalars().all())

    async def list_by_supplier(self, supplier_id: int) -> list[Document]:
        return await self.list_by_entity("supplier", supplier_id)

    async def get_by_transaction_id(self, transaction_id: int) -> list[Document]:
        res = await self.db.execute(
            select(Document).where(Document.transaction_id == transaction_id)
        )
        return list(res.scalars().all())

    async def list_by_project(self, project_id: int) -> list[Document]:
        return await self.list_by_entity("project", project_id)

    async def update(self, doc: Document) -> Document:
        await self.db.commit()
        await self.db.refresh(doc)
        return doc

    async def delete(self, doc: Document) -> None:
        await self.db.delete(doc)
        await self.db.commit()
