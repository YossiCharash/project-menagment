import os
import uuid
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, computed_field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.v1.cems_deps import (
    _is_cems_admin,
    get_current_user,
    get_db,
    require_admin_or_manager,
    require_any_cems_role,
)
from backend.configurations.cems.file_uploads import (
    ALLOWED_DOCUMENT_EXTENSIONS,
    DEFAULT_DOCUMENT_FILENAME,
    DOCUMENT_PREFIX,
    MAX_DOCUMENT_BYTES,
    MAX_DOCUMENT_SIZE_MB,
)
from backend.configurations.cems.pagination import (
    DEFAULT_LIMIT,
    DEFAULT_SKIP,
    MAX_LIMIT,
    MIN_LIMIT,
)
from backend.core.exceptions.cems import (
    DocumentDeleteForbiddenError,
    DocumentNotFoundError,
    FileNotOnDiskError,
    FileTooLargeError,
    UnsupportedFileExtensionError,
)
from backend.models.cems_document import Document, DocumentType
from backend.models.cems_user import User
from backend.services.cems_photo_storage import PhotoStorage

router = APIRouter(prefix="/documents", tags=["CEMS Documents"])


_DANGEROUS_FILENAME_CHARS = ("/", "\\", "\0", "..")


class _DocumentFileValidator:
    """Encapsulates document file validation and on-disk path handling."""

    @staticmethod
    def sanitize_filename(raw_name: str) -> str:
        safe = (raw_name or DEFAULT_DOCUMENT_FILENAME).strip() or DEFAULT_DOCUMENT_FILENAME
        for ch in _DANGEROUS_FILENAME_CHARS:
            safe = safe.replace(ch, "_")
        return safe

    @staticmethod
    def validate_extension(filename: str) -> str:
        ext = (os.path.splitext(filename or "")[1] or "").lower()
        if ext not in ALLOWED_DOCUMENT_EXTENSIONS:
            raise UnsupportedFileExtensionError(ALLOWED_DOCUMENT_EXTENSIONS)
        return ext

    @staticmethod
    def validate_size(content: bytes) -> None:
        if len(content) > MAX_DOCUMENT_BYTES:
            raise FileTooLargeError(MAX_DOCUMENT_SIZE_MB)

    @staticmethod
    def ensure_documents_dir() -> str:
        return PhotoStorage.ensure_local_dir(DOCUMENT_PREFIX)

    @staticmethod
    def resolve_full_path(relative_path: str) -> str:
        return os.path.join(PhotoStorage.resolve_upload_base(), relative_path)


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    document_type: DocumentType
    filename: str
    file_path: str
    uploaded_by_id: int
    uploaded_at: datetime
    expiry_date: Optional[date]
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def file_url(self) -> str:
        return f"/uploads/{self.file_path}"


@router.get("", response_model=List[DocumentRead])
async def list_documents(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(DEFAULT_SKIP, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=MIN_LIMIT, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> List[DocumentRead]:
    stmt = select(Document)
    if entity_type:
        stmt = stmt.where(Document.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(Document.entity_id == entity_id)
    stmt = stmt.order_by(Document.uploaded_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    docs = list(result.scalars().all())
    return [DocumentRead.model_validate(d) for d in docs]


@router.post("/upload", response_model=DocumentRead, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    entity_type: str = Form(...),
    entity_id: uuid.UUID = Form(...),
    document_type: DocumentType = Form(...),
    expiry_date: Optional[date] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> DocumentRead:
    """Upload a file and create a CemsDocument record."""
    _DocumentFileValidator.validate_extension(file.filename or "")
    content = await file.read()
    _DocumentFileValidator.validate_size(content)

    safe_name = _DocumentFileValidator.sanitize_filename(file.filename or DEFAULT_DOCUMENT_FILENAME)
    stored_name = f"{uuid.uuid4().hex}_{safe_name}"

    docs_dir = _DocumentFileValidator.ensure_documents_dir()
    full_path = os.path.join(docs_dir, stored_name)
    with open(full_path, "wb") as fh:
        fh.write(content)

    relative_path = f"{DOCUMENT_PREFIX}/{stored_name}"
    doc = Document(
        entity_type=entity_type,
        entity_id=entity_id,
        document_type=document_type,
        filename=file.filename or stored_name,
        file_path=relative_path,
        uploaded_by_id=current_user.id,
        expiry_date=expiry_date,
    )
    db.add(doc)
    await db.flush()

    return DocumentRead.model_validate(doc)


@router.get("/{document_id}/download")
async def download_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_cems_role),
) -> FileResponse:
    doc = await db.get(Document, document_id)
    if doc is None:
        raise DocumentNotFoundError()

    full_path = _DocumentFileValidator.resolve_full_path(doc.file_path)

    if not os.path.isfile(full_path):
        raise FileNotOnDiskError()

    return FileResponse(full_path, filename=doc.filename, media_type="application/octet-stream")


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> None:
    doc = await db.get(Document, document_id)
    if doc is None:
        raise DocumentNotFoundError()
    if not _is_cems_admin(current_user) and doc.uploaded_by_id != current_user.id:
        raise DocumentDeleteForbiddenError()

    full_path = _DocumentFileValidator.resolve_full_path(doc.file_path)
    if os.path.isfile(full_path):
        try:
            os.remove(full_path)
        except OSError:
            # Best-effort cleanup: if disk removal fails, still delete the DB row.
            pass

    await db.delete(doc)
    await db.flush()
