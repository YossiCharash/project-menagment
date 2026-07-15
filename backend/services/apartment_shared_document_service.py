"""Apartment document service (מסמכי דירה).

Encapsulates the rules and I/O orchestration for documents attached to an
apartment: listing, attaching a new file via S3 (with a free-text description),
removing a document (DB + best-effort S3), and purging every document when the
apartment itself is deleted.

Apartment documents reuse the polymorphic ``documents`` table with
``entity_type == "apartment"`` and ``entity_id == apartment_id`` (no dedicated
FK column), mirroring how project documents are stored. All S3 I/O goes through
:class:`backend.services.s3_service.S3Service`; domain errors are raised as
``ValueError`` with Hebrew messages, which the endpoints translate to HTTP 4xx.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages
from backend.models.document import Document
from backend.repositories.apartment_repository import ApartmentRepository
from backend.repositories.document_repository import DocumentRepository
from backend.schemas.apartment_shared_document import ApartmentSharedDocumentOut
from backend.services.s3_service import S3Service


logger = logging.getLogger(__name__)

APARTMENT_ENTITY_TYPE = "apartment"
DEFAULT_UPLOAD_FILENAME = "apartment-document"


class ApartmentSharedDocumentService:
    """Business rules for shared apartment documents (public details tab)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._apartments = ApartmentRepository(db)
        self._documents = DocumentRepository(db)

    # ------------------------------------------------------------------
    # List
    # ------------------------------------------------------------------

    async def list_documents(self, apartment_id: int) -> list[ApartmentSharedDocumentOut]:
        """Return every document attached to the apartment."""
        await self._ensure_apartment_exists(apartment_id)
        docs = await self._documents.list_by_apartment(apartment_id)
        return [self._build_document_dto(doc) for doc in docs]

    # ------------------------------------------------------------------
    # Attach
    # ------------------------------------------------------------------

    async def attach_document(
        self, apartment_id: int, file: UploadFile, description: str | None
    ) -> ApartmentSharedDocumentOut:
        """Upload the file to S3 and persist a Document row for the apartment."""
        await self._ensure_apartment_exists(apartment_id)
        file_url = await self._upload_file_to_s3(apartment_id, file)
        doc = await self._persist_document_record(
            apartment_id,
            file_url,
            self._sanitize_description(description),
            self._sanitize_filename(file.filename),
        )
        return self._build_document_dto(doc)

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def remove_document(self, apartment_id: int, document_id: int) -> None:
        """Remove one apartment document from DB and, best-effort, from S3."""
        await self._ensure_apartment_exists(apartment_id)
        doc = await self._load_document_for_apartment_or_raise(document_id, apartment_id)
        file_path = doc.file_path
        await self._documents.delete(doc)
        await self._try_delete_file_from_s3(file_path)

    async def delete_all_for_apartment(self, apartment_id: int) -> None:
        """Purge every document of an apartment (DB + best-effort S3).

        Called when the apartment itself is deleted, because the ``documents``
        view-only relationship carries no DB cascade of its own.
        """
        docs = await self._documents.list_by_apartment(apartment_id)
        for doc in docs:
            file_path = doc.file_path
            await self._documents.delete(doc)
            await self._try_delete_file_from_s3(file_path)

    # ==================================================================
    # Private helpers — each does one thing
    # ==================================================================

    async def _ensure_apartment_exists(self, apartment_id: int) -> None:
        apartment = await self._apartments.get(apartment_id)
        if not apartment:
            raise ValueError(
                BuildingReceptionErrorMessages.apartment_not_found_by_id(apartment_id)
            )

    async def _load_document_for_apartment_or_raise(
        self, document_id: int, apartment_id: int
    ) -> Document:
        doc = await self._documents.get_by_id(document_id)
        if not doc:
            raise ValueError(
                BuildingReceptionErrorMessages.shared_document_not_found_by_id(document_id)
            )
        if doc.entity_type != APARTMENT_ENTITY_TYPE or doc.entity_id != apartment_id:
            raise ValueError(BuildingReceptionErrorMessages.SHARED_DOCUMENT_NOT_ON_APARTMENT)
        return doc

    @staticmethod
    def _sanitize_description(description: str | None) -> str | None:
        if description is None:
            return None
        stripped = description.strip()
        return stripped or None

    @staticmethod
    def _sanitize_filename(filename: str | None) -> str | None:
        """Trim the uploaded filename to the stored column width, empty -> None."""
        if filename is None:
            return None
        stripped = filename.strip()
        return stripped[:255] or None

    async def _upload_file_to_s3(self, apartment_id: int, file: UploadFile) -> str:
        s3 = S3Service()
        await file.seek(0)
        return await asyncio.to_thread(
            s3.upload_file,
            prefix=f"apartments/{apartment_id}/documents",
            file_obj=file.file,
            filename=file.filename or DEFAULT_UPLOAD_FILENAME,
            content_type=file.content_type,
        )

    async def _persist_document_record(
        self,
        apartment_id: int,
        file_url: str,
        description: str | None,
        file_name: str | None,
    ) -> Document:
        doc = Document(
            entity_type=APARTMENT_ENTITY_TYPE,
            entity_id=apartment_id,
            file_path=file_url,
            file_name=file_name,
            description=description,
            source_table=APARTMENT_ENTITY_TYPE,
            source_id=apartment_id,
        )
        return await self._documents.create(doc)

    async def _try_delete_file_from_s3(self, file_path: str | None) -> None:
        if not self._looks_like_s3_url(file_path):
            return
        try:
            s3 = S3Service()
            await asyncio.to_thread(s3.delete_file, file_path)
        except Exception:  # noqa: BLE001 — row already gone; S3 cleanup is best-effort
            logger.warning("מחיקת מסמך דירה מ-S3 נכשלה", exc_info=True)

    @staticmethod
    def _looks_like_s3_url(file_path: str | None) -> bool:
        if not file_path:
            return False
        lowered = file_path.lower()
        if "s3" in lowered or "amazonaws.com" in file_path:
            return True
        base_url = settings.AWS_S3_BASE_URL
        return bool(base_url and file_path.startswith(base_url))

    @staticmethod
    def _build_document_dto(doc: Document) -> ApartmentSharedDocumentOut:
        return ApartmentSharedDocumentOut(
            id=doc.id,
            apartment_id=doc.entity_id,
            file_path=doc.file_path,
            file_name=doc.file_name,
            description=doc.description,
            uploaded_at=doc.uploaded_at,
        )
