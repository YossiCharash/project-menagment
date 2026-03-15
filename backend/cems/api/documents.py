import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import get_current_user, get_db
from backend.cems.models.document import Document, DocumentType
from backend.cems.models.user import User
from backend.cems.models.base import _utc_now
from pydantic import BaseModel, ConfigDict
from datetime import date, datetime


router = APIRouter(prefix="/documents", tags=["CEMS Documents"])


# ---------- Schemas (co-located because Document is a leaf entity) ----------

class DocumentCreate(BaseModel):
    entity_type: str
    entity_id: uuid.UUID
    document_type: DocumentType
    filename: str
    file_path: str
    expiry_date: Optional[date] = None


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    document_type: DocumentType
    filename: str
    file_path: str
    uploaded_by_id: uuid.UUID
    uploaded_at: datetime
    expiry_date: Optional[date]
    created_at: datetime
    updated_at: datetime


# ---------- Endpoints ----------

@router.get("", response_model=List[DocumentRead])
async def list_documents(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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


@router.post("", response_model=DocumentRead, status_code=201)
async def create_document(
    payload: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentRead:
    doc = Document(
        **payload.model_dump(),
        uploaded_by_id=current_user.id,
    )
    db.add(doc)
    await db.flush()
    return DocumentRead.model_validate(doc)


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    doc = await db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    await db.delete(doc)
    await db.flush()
