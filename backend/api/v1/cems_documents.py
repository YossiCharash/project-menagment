import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.v1.cems_deps import get_current_user, get_db, require_any_cems_role, require_admin_or_manager, _is_cems_admin
from backend.models.cems_document import Document, DocumentType
from backend.models.cems_user import User
from backend.core.config import settings
from pydantic import BaseModel, ConfigDict, computed_field
from datetime import date, datetime


router = APIRouter(prefix="/documents", tags=["CEMS Documents"])


# ---------- File handling constants & helpers ----------

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"}
MAX_SIZE_MB = 20


def _get_cems_docs_dir() -> str:
    """Return the absolute path to the cems_documents upload directory, creating it if needed."""
    base = settings.FILE_UPLOAD_DIR
    if not os.path.isabs(base):
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        base = os.path.abspath(os.path.join(backend_dir, base))
    d = os.path.join(base, "cems_documents")
    os.makedirs(d, exist_ok=True)
    return d


def _sanitize_filename(raw_name: str) -> str:
    """Strip dangerous characters from an uploaded filename."""
    safe = (raw_name or "file").strip() or "file"
    for ch in ["/", "\\", "\0", ".."]:
        safe = safe.replace(ch, "_")
    return safe


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
        return f"/uploads/{self.file_path}"


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
    """Upload a file and create a CemsDocument record."""
    _validate_extension(file.filename or "")
    content = await file.read()
    _validate_file_size(content)

    safe_name = _sanitize_filename(file.filename or "file")
    unique_prefix = uuid.uuid4().hex
    stored_name = f"{unique_prefix}_{safe_name}"

    docs_dir = _get_cems_docs_dir()
    full_path = os.path.join(docs_dir, stored_name)
    with open(full_path, "wb") as f:
        f.write(content)

    relative_path = f"cems_documents/{stored_name}"
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
    """Serve the physical file for a given document record."""
    doc = await db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

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

    # Remove the physical file from disk
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
