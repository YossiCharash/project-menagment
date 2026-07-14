from __future__ import annotations
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.apartment import Apartment
from backend.models.apartment_document import ApartmentDocument
from backend.repositories.apartment_repository import ApartmentRepository
from backend.repositories.apartment_document_repository import ApartmentDocumentRepository
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


class PersonalAreaService:
    """Business logic for an apartment's personal area (אזור אישי).

    The personal area is the admin-password-gated section of the reception desk
    apartment card. It owns the private free-text fields and the attached
    documents; the admin-password check itself is enforced at the endpoint.
    """

    # The private free-text fields the personal-area update endpoint may touch.
    PRIVATE_TEXT_FIELDS = ("private_details", "private_notes")

    def __init__(self, db: AsyncSession):
        self.db = db
        self.apartments = ApartmentRepository(db)
        self.documents = ApartmentDocumentRepository(db)

    @staticmethod
    def _normalize(raw_value: str | None) -> str | None:
        return (raw_value or "").strip() or None

    async def _get_apartment(self, apartment_id: int) -> Apartment:
        apartment = await self.apartments.get(apartment_id)
        if not apartment:
            raise ValueError(
                BuildingReceptionErrorMessages.apartment_not_found_by_id(apartment_id)
            )
        return apartment

    async def ensure_apartment(self, apartment_id: int) -> None:
        """Validate the apartment exists (raises ValueError otherwise); loads no documents."""
        await self._get_apartment(apartment_id)

    async def get_personal_area(self, apartment_id: int) -> tuple[Apartment, list[ApartmentDocument]]:
        apartment = await self._get_apartment(apartment_id)
        documents = await self.documents.list_by_apartment(apartment_id)
        return apartment, documents

    async def update_private_fields(
        self, apartment_id: int, changes: dict
    ) -> tuple[Apartment, list[ApartmentDocument]]:
        """Apply a partial update: only keys present in ``changes`` are written.

        An omitted field keeps its stored value; an explicit empty string clears it
        to None (mirrors ApartmentService's optional-text handling).
        """
        apartment = await self._get_apartment(apartment_id)
        for field in self.PRIVATE_TEXT_FIELDS:
            if field in changes:
                setattr(apartment, field, self._normalize(changes[field]))
        await self.apartments.update(apartment)
        documents = await self.documents.list_by_apartment(apartment_id)
        return apartment, documents

    async def add_document(
        self,
        apartment_id: int,
        *,
        file_path: str,
        filename: str | None,
        description: str | None,
        uploaded_by_id: int | None,
    ) -> ApartmentDocument:
        await self._get_apartment(apartment_id)  # validates existence
        document = ApartmentDocument(
            apartment_id=apartment_id,
            file_path=file_path,
            filename=filename,
            description=self._normalize(description),
            uploaded_by_id=uploaded_by_id,
        )
        return await self.documents.create(document)

    async def delete_document(self, apartment_id: int, document_id: int) -> str:
        """Delete a document and return its stored file path for storage cleanup."""
        document = await self.documents.get_by_id(document_id)
        if not document or document.apartment_id != apartment_id:
            raise ValueError(BuildingReceptionErrorMessages.DOCUMENT_NOT_FOUND)
        file_path = document.file_path
        await self.documents.delete(document)
        return file_path
