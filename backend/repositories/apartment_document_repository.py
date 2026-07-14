from __future__ import annotations
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.apartment_document import ApartmentDocument
from backend.repositories.base import BaseRepository


class ApartmentDocumentRepository(BaseRepository[ApartmentDocument]):
    """Data access for apartment personal-area documents (מסמכים)."""

    model = ApartmentDocument

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def list_by_apartment(self, apartment_id: int) -> list[ApartmentDocument]:
        result = await self.db.execute(
            select(ApartmentDocument)
            .where(ApartmentDocument.apartment_id == apartment_id)
            .order_by(ApartmentDocument.uploaded_at.desc(), ApartmentDocument.id.desc())
        )
        return list(result.scalars().all())
