import os
import uuid
from functools import lru_cache
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.v1.cems_deps import get_current_user, get_db, require_any_cems_role, require_admin_or_manager, _is_cems_admin
from backend.models.cems_document import Document, DocumentType
from backend.models.cems_user import User
from backend.core.config import settings
from backend.services.cems_photo_storage import store_photo
from backend.services.s3_service import S3Service
from pydantic import BaseModel, ConfigDict, computed_field
from datetime import date, datetime


router = APIRouter(prefix="/documents", tags=["CEMS Documents"])

# The storage prefix (S3 key prefix / local sub-directory) for CEMS documents.
_DOCUMENTS_PREFIX = "cems_documents"


# ---------- File handling constants & helpers ----------

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"}
MAX_SIZE_MB = 20


@lru_cache(maxsize=1)
def _s3_service() -> S3Service:
    """Cached S3 client used to sign/delete document links (build is expensive)."""
    return S3Service()


def _resolve_document_url(stored_path: str | None) -> str:
    """Resolve a stored document path to a URL the browser can actually fetch.

    Mirrors the task-attachment resolver: S3 objects are private, so the stored
    (unsigned) URL is signed here at read time into a short-lived link. Legacy
    local paths are served under ``/uploads/``. Without this, documents kept on
    the ephemeral container disk (rather than S3) cannot be attached or served
    on the deployed host.
    """
    path = stored_path or ""
    if not path:
        return ""
    if path.startswith("http://") or path.startswith("https://"):
        if settings.AWS_S3_BUCKET:
            return _s3_service().generate_presigned_url(path)
        return path
    if path.startswith("/"):
        return path
    return f"/uploads/{path}"


def _validate_extension(filename: str) -> str:
    """Return the lower-cased extension or raise HTTP 400 if disallowed."""
    ext = (os.path.splitext(filename or "")[1] or "").lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"סוג קובץ לא נתמך. מותרים: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    return ext


def _validate_file_size(content: bytes) -> None:
    """Raise HTTP 400 if the file exceeds the maximum allowed size."""
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"גודל קובץ מקסימלי: {MAX_SIZE_MB} MB",
        )


# ---------- Schemas (co-located because Document is a leaf entity) ----------

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
        return _resolve_document_url(self.file_path)


# ---------- Endpoints ----------

@router.get("", response_model=List[DocumentRead])
async def list_documents(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
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
    """Upload a file and create a CemsDocument record.

    The file is persisted via the shared S3-or-disk storage helper (S3 when
    ``AWS_S3_BUCKET`` is configured, local disk otherwise) so documents behave
    exactly like asset/consumable photos and survive on a container host whose
    local filesystem is ephemeral.
    """
    _validate_extension(file.filename or "")
    content = await file.read()
    _validate_file_size(content)

    stored_path = store_photo(
        prefix=_DOCUMENTS_PREFIX,
        existing_url=None,
        file_bytes=content,
        filename=file.filename,
        content_type=file.content_type,
    )

    doc = Document(
        entity_type=entity_type,
        entity_id=entity_id,
        document_type=document_type,
        filename=file.filename or "file",
        file_path=stored_path,
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
):
    """Serve the file for a document (local disk) or redirect to its signed S3 URL."""
    doc = await db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    # S3-stored documents: redirect to a short-lived signed URL.
    if doc.file_path.startswith("http://") or doc.file_path.startswith("https://"):
        target = (
            _s3_service().generate_presigned_url(doc.file_path)
            if settings.AWS_S3_BUCKET
            else doc.file_path
        )
        return RedirectResponse(target)

    base = settings.FILE_UPLOAD_DIR
    if not os.path.isabs(base):
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        base = os.path.abspath(os.path.join(backend_dir, base))
    full_path = os.path.join(base, doc.file_path)

    if not os.path.isfile(full_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk.")

    return FileResponse(full_path, filename=doc.filename, media_type="application/octet-stream")


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> None:
    doc = await db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if not _is_cems_admin(current_user) and doc.uploaded_by_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the uploader or an admin can delete this document.",
        )

    # Remove the stored file (S3 object or local disk); best-effort so a
    # storage hiccup never blocks removing the DB record.
    if doc.file_path.startswith("http://") or doc.file_path.startswith("https://"):
        if settings.AWS_S3_BUCKET:
            try:
                _s3_service().delete_file(doc.file_path)
            except Exception:
                pass
    else:
        base = settings.FILE_UPLOAD_DIR
        if not os.path.isabs(base):
            backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            base = os.path.abspath(os.path.join(backend_dir, base))
        full_path = os.path.join(base, doc.file_path)
        if os.path.isfile(full_path):
            try:
                os.remove(full_path)
            except OSError:
                pass

    await db.delete(doc)
    await db.flush()
