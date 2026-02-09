"""API for group transaction drafts (שמירת עסקה קבוצתית כטיוטה)."""
import asyncio
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response

from backend.core.deps import DBSessionDep, get_current_user
from backend.models.group_transaction_draft import GroupTransactionDraft, GroupTransactionDraftDocument
from backend.schemas.group_transaction_draft import GroupTransactionDraftCreate, GroupTransactionDraftOut, GroupTransactionDraftUpdate
from backend.services.s3_service import S3Service

router = APIRouter()


def _content_disposition_filename(filename: str) -> str:
    """Build Content-Disposition value; use RFC 5987 for non-ASCII filenames (e.g. Hebrew)."""
    try:
        filename.encode("ascii")
        return f'attachment; filename="{filename}"'
    except UnicodeEncodeError:
        encoded = quote(filename, safe="")
        return f"attachment; filename=\"download\"; filename*=UTF-8''{encoded}"


@router.get("", response_model=list[GroupTransactionDraftOut])
async def list_drafts(db: DBSessionDep, user=Depends(get_current_user)):
    """List current user's group transaction drafts."""
    from sqlalchemy import select
    result = await db.execute(
        select(GroupTransactionDraft).where(GroupTransactionDraft.user_id == user.id).order_by(GroupTransactionDraft.updated_at.desc())
    )
    drafts = list(result.scalars().all())
    return drafts


@router.get("/{draft_id}", response_model=GroupTransactionDraftOut)
async def get_draft(draft_id: int, db: DBSessionDep, user=Depends(get_current_user)):
    """Get one draft by id (only own)."""
    from sqlalchemy import select
    result = await db.execute(
        select(GroupTransactionDraft).where(
            GroupTransactionDraft.id == draft_id,
            GroupTransactionDraft.user_id == user.id
        )
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@router.post("", response_model=GroupTransactionDraftOut)
async def create_draft(data: GroupTransactionDraftCreate, db: DBSessionDep, user=Depends(get_current_user)):
    """Save a new group transaction draft. Name is required; rows can be empty (e.g. for auto-save after partial failure)."""
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required for draft")
    rows = data.rows if data.rows is not None else []
    draft = GroupTransactionDraft(user_id=user.id, name=name, rows=rows)
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    return draft


@router.patch("/{draft_id}", response_model=GroupTransactionDraftOut)
async def update_draft(draft_id: int, data: GroupTransactionDraftUpdate, db: DBSessionDep, user=Depends(get_current_user)):
    """Update draft (only own)."""
    from sqlalchemy import select
    result = await db.execute(
        select(GroupTransactionDraft).where(
            GroupTransactionDraft.id == draft_id,
            GroupTransactionDraft.user_id == user.id
        )
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    if data.name is not None:
        draft.name = data.name
    if data.rows is not None:
        draft.rows = data.rows
    await db.commit()
    await db.refresh(draft)
    return draft


@router.post("/{draft_id}/documents", response_model=dict)
async def upload_draft_document(
    draft_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
    file: UploadFile = File(...),
    row_index: int = Form(...),
    sub_type: str | None = Form(None),
    sub_index: int | None = Form(None),
):
    """Upload a file for a draft row. row_index = index in draft.rows; sub_type='main'|'income'|'expense', sub_index for that array."""
    from sqlalchemy import select
    result = await db.execute(
        select(GroupTransactionDraft).where(
            GroupTransactionDraft.id == draft_id,
            GroupTransactionDraft.user_id == user.id
        )
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    s3 = S3Service()
    prefix = f"drafts/{draft_id}"
    await file.seek(0)
    file_url = await asyncio.to_thread(
        s3.upload_file,
        prefix=prefix,
        file_obj=file.file,
        filename=file.filename or "document",
        content_type=file.content_type,
    )
    doc = GroupTransactionDraftDocument(
        draft_id=draft_id,
        row_index=row_index,
        sub_type=sub_type or "main",
        sub_index=sub_index,
        file_path=file_url,
        original_filename=file.filename or "document",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return {
        "id": doc.id,
        "row_index": doc.row_index,
        "sub_type": doc.sub_type,
        "sub_index": doc.sub_index,
        "original_filename": doc.original_filename,
    }


@router.get("/{draft_id}/documents/{doc_id}/download")
async def download_draft_document(
    draft_id: int,
    doc_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """Download a draft document file (only if user owns the draft)."""
    from sqlalchemy import select
    result = await db.execute(
        select(GroupTransactionDraft).where(
            GroupTransactionDraft.id == draft_id,
            GroupTransactionDraft.user_id == user.id
        )
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    doc_result = await db.execute(
        select(GroupTransactionDraftDocument).where(
            GroupTransactionDraftDocument.id == doc_id,
            GroupTransactionDraftDocument.draft_id == draft_id,
        )
    )
    doc = doc_result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    s3 = S3Service()
    content = await asyncio.to_thread(s3.get_file_content, doc.file_path)
    if content is None:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": _content_disposition_filename(doc.original_filename or "download")},
    )


@router.delete("/{draft_id}")
async def delete_draft(draft_id: int, db: DBSessionDep, user=Depends(get_current_user)):
    """Delete draft (only own). Cascade deletes draft documents."""
    from sqlalchemy import select, delete
    result = await db.execute(
        select(GroupTransactionDraft).where(
            GroupTransactionDraft.id == draft_id,
            GroupTransactionDraft.user_id == user.id
        )
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    await db.execute(delete(GroupTransactionDraft).where(GroupTransactionDraft.id == draft_id))
    await db.commit()
    return {"ok": True}
