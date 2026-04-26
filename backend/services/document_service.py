"""
Transaction document service.

Encapsulates the rules and I/O orchestration for documents attached to
transactions: listing (including the legacy ``transaction.file_path``
fallback row), attaching a new file via S3, updating the description, and
removing a document (both from the DB and from S3).

All data access is mediated by repositories; all S3 I/O goes through
:class:`backend.services.s3_service.S3Service`. Services raise domain
exceptions from :mod:`backend.services.exceptions`; endpoints translate
those to HTTP status codes.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.models.document import Document
from backend.models.transaction import Transaction
from backend.repositories.document_repository import DocumentRepository
from backend.repositories.transaction_repository import TransactionRepository
from backend.schemas.transaction import TransactionDocumentOut
from backend.services.exceptions import (
    EntityNotFoundError,
    ValidationError,
)
from backend.services.s3_service import S3Service


logger = logging.getLogger(__name__)

# User-facing messages. Kept verbatim with the pre-refactor endpoint.
TRANSACTION_NOT_FOUND_MSG = "Transaction not found"
DOCUMENT_NOT_FOUND_MSG = "Document not found"
DOCUMENT_NOT_ON_TRANSACTION_MSG = "Document does not belong to this transaction"
DEFAULT_UPLOAD_FILENAME = "supplier-document"
S3_UPLOAD_PREFIX = "transactions"
TRANSACTION_ENTITY_TYPE = "transaction"


class DocumentService:
    """All transaction-document business rules and orchestration."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._transactions = TransactionRepository(db)
        self._documents = DocumentRepository(db)

    # ------------------------------------------------------------------
    # List
    # ------------------------------------------------------------------

    async def list_documents_for_transaction(
        self, tx_id: int
    ) -> list[TransactionDocumentOut]:
        """Return all documents attached to the transaction, plus legacy fallback."""
        tx = await self._load_transaction_or_raise(tx_id)
        docs = await self._documents.list_documents_by_transaction_id(tx_id)
        dtos = self._build_document_dtos(docs)
        return self._merge_legacy_transaction_file_path(dtos, tx)

    # ------------------------------------------------------------------
    # Attach
    # ------------------------------------------------------------------

    async def attach_document_to_transaction(
        self,
        tx_id: int,
        file: UploadFile,
    ) -> TransactionDocumentOut:
        """Upload the file to S3 and persist a Document row linked to the transaction."""
        tx = await self._load_transaction_or_raise(tx_id)
        file_url = await self._upload_file_to_s3(file)
        doc = await self._persist_document_record(tx, file_url)
        return self._build_document_dto(doc, tx_id)

    # ------------------------------------------------------------------
    # Update description
    # ------------------------------------------------------------------

    async def update_document_description(
        self, tx_id: int, doc_id: int, description: str | None
    ) -> TransactionDocumentOut:
        """Update the ``description`` on a transaction document."""
        await self._load_transaction_or_raise(tx_id)
        doc = await self._load_document_for_transaction_or_raise(doc_id, tx_id)
        doc.description = self._sanitize_description(description)
        await self._documents.update_document(doc)
        return self._build_document_dto(doc, tx_id)

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def remove_document_from_transaction(
        self, tx_id: int, doc_id: int
    ) -> None:
        """Remove the document from DB and, on best-effort, from S3."""
        await self._load_transaction_or_raise(tx_id)
        doc = await self._load_document_or_raise(doc_id)
        self._verify_document_belongs_to_transaction(doc, tx_id)
        file_path = doc.file_path
        await self._documents.delete_document(doc)
        await self._try_delete_file_from_s3(file_path)

    # ==================================================================
    # Private helpers — each does one thing
    # ==================================================================

    async def _load_transaction_or_raise(self, tx_id: int) -> Transaction:
        tx = await self._transactions.get_by_id(tx_id)
        if not tx:
            raise EntityNotFoundError(TRANSACTION_NOT_FOUND_MSG)
        return tx

    async def _load_document_or_raise(self, doc_id: int) -> Document:
        doc = await self._documents.get_document_by_id(doc_id)
        if not doc:
            raise EntityNotFoundError(DOCUMENT_NOT_FOUND_MSG)
        return doc

    async def _load_document_for_transaction_or_raise(
        self, doc_id: int, tx_id: int
    ) -> Document:
        """Load the doc and verify it belongs to the transaction in one step.

        Preserves the legacy endpoint behaviour where a mismatched document
        returned 404 (not 400) on the description-update path.
        """
        doc = await self._documents.get_document_by_id(doc_id)
        if (
            not doc
            or doc.entity_type != TRANSACTION_ENTITY_TYPE
            or doc.entity_id != tx_id
        ):
            raise EntityNotFoundError(DOCUMENT_NOT_FOUND_MSG)
        return doc

    @staticmethod
    def _verify_document_belongs_to_transaction(doc: Document, tx_id: int) -> None:
        if doc.entity_type != TRANSACTION_ENTITY_TYPE or doc.entity_id != tx_id:
            raise ValidationError(DOCUMENT_NOT_ON_TRANSACTION_MSG)

    @staticmethod
    def _sanitize_description(description: str | None) -> str | None:
        if description is None:
            return None
        stripped = description.strip()
        return stripped or None

    async def _upload_file_to_s3(self, file: UploadFile) -> str:
        s3 = S3Service()
        await file.seek(0)
        return await asyncio.to_thread(
            s3.upload_file,
            prefix=S3_UPLOAD_PREFIX,
            file_obj=file.file,
            filename=file.filename or DEFAULT_UPLOAD_FILENAME,
            content_type=file.content_type,
        )

    async def _persist_document_record(
        self, tx: Transaction, file_url: str
    ) -> Document:
        doc = Document(
            transaction_id=tx.id,
            entity_type=TRANSACTION_ENTITY_TYPE,
            entity_id=tx.id,
            supplier_id=tx.supplier_id,
            file_path=file_url,
            source_table="transaction",
            source_id=tx.id,
        )
        return await self._documents.insert_document(doc)

    async def _try_delete_file_from_s3(self, file_path: str | None) -> None:
        if not self._looks_like_s3_url(file_path):
            return
        try:
            s3 = S3Service()
            await asyncio.to_thread(s3.delete_file, file_path)
        except Exception:  # noqa: BLE001 — document already removed from DB; S3 is best-effort
            logger.warning("מחיקת קובץ מ-S3 נכשלה", exc_info=True)

    @staticmethod
    def _looks_like_s3_url(file_path: str | None) -> bool:
        if not file_path:
            return False
        lowered = file_path.lower()
        if "s3" in lowered or "amazonaws.com" in file_path:
            return True
        base_url = settings.AWS_S3_BASE_URL
        return bool(base_url and file_path.startswith(base_url))

    # --- DTO builders --------------------------------------------------

    @staticmethod
    def _build_document_dto(doc: Document, tx_id: int) -> TransactionDocumentOut:
        return TransactionDocumentOut(
            id=doc.id,
            transaction_id=tx_id,
            file_path=doc.file_path,
            description=doc.description,
            uploaded_at=doc.uploaded_at,
            supplier_id=doc.supplier_id,
        )

    def _build_document_dtos(
        self, docs: list[Document]
    ) -> list[TransactionDocumentOut]:
        return [
            TransactionDocumentOut(
                id=doc.id,
                transaction_id=doc.entity_id,
                file_path=doc.file_path,
                description=doc.description,
                uploaded_at=doc.uploaded_at,
                supplier_id=doc.supplier_id,
            )
            for doc in docs
        ]

    @staticmethod
    def _merge_legacy_transaction_file_path(
        dtos: list[TransactionDocumentOut], tx: Transaction
    ) -> list[TransactionDocumentOut]:
        if not tx.file_path:
            return dtos
        existing_paths = {d.file_path for d in dtos}
        if tx.file_path in existing_paths:
            return dtos
        dtos.append(
            TransactionDocumentOut(
                id=None,
                transaction_id=tx.id,
                file_path=tx.file_path,
                description=None,
                uploaded_at=None,
                supplier_id=None,
            )
        )
        return dtos
