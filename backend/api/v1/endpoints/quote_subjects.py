from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.deps import DBSessionDep, get_current_user, require_admin
from backend.core.security import verify_password
from backend.models import QuoteSubject, QuoteProject
from backend.repositories.quote_subject_repository import QuoteSubjectRepository
from backend.repositories.quote_project_repository import QuoteProjectRepository
from backend.repositories.user_repository import UserRepository
from backend.schemas.quote_subject import QuoteSubjectCreate, QuoteSubjectUpdate, QuoteSubjectOut

router = APIRouter()


class DeleteQuoteSubjectRequest(BaseModel):
    password: str


@router.get("/", response_model=list[QuoteSubjectOut])
async def list_quote_subjects(
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    repo = QuoteSubjectRepository(db)
    items = await repo.list()
    return [QuoteSubjectOut.model_validate(s) for s in items]


@router.get("/{quote_subject_id}", response_model=QuoteSubjectOut)
async def get_quote_subject(
    quote_subject_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    repo = QuoteSubjectRepository(db)
    qs = await repo.get(quote_subject_id)
    if not qs:
        raise HTTPException(status_code=404, detail="Quote subject not found")
    return QuoteSubjectOut.model_validate(qs)


@router.post("/", response_model=QuoteSubjectOut)
async def create_quote_subject(
    db: DBSessionDep,
    data: QuoteSubjectCreate,
    user=Depends(get_current_user),
):
    qs = QuoteSubject(
        address=data.address,
        num_apartments=data.num_apartments,
        num_buildings=data.num_buildings,
        notes=data.notes,
    )
    repo = QuoteSubjectRepository(db)
    created = await repo.create(qs)
    return QuoteSubjectOut.model_validate(created)


@router.put("/{quote_subject_id}", response_model=QuoteSubjectOut)
async def update_quote_subject(
    quote_subject_id: int,
    db: DBSessionDep,
    data: QuoteSubjectUpdate,
    user=Depends(get_current_user),
):
    repo = QuoteSubjectRepository(db)
    qs = await repo.get(quote_subject_id)
    if not qs:
        raise HTTPException(status_code=404, detail="Quote subject not found")
    if data.address is not None:
        qs.address = data.address
    if data.num_apartments is not None:
        qs.num_apartments = data.num_apartments
    if data.num_buildings is not None:
        qs.num_buildings = data.num_buildings
    if data.notes is not None:
        qs.notes = data.notes
    updated = await repo.update(qs)
    await db.commit()
    await db.refresh(updated)
    return QuoteSubjectOut.model_validate(updated)


@router.delete("/{quote_subject_id}", status_code=204)
async def delete_quote_subject(
    quote_subject_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """Delete quote subject only if it has no quotes. For deletion with quotes use POST .../delete with admin password."""
    repo = QuoteSubjectRepository(db)
    qs = await repo.get(quote_subject_id)
    if not qs:
        raise HTTPException(status_code=404, detail="Quote subject not found")
    qp_repo = QuoteProjectRepository(db)
    quotes = await qp_repo.list(quote_subject_id=quote_subject_id)
    if quotes:
        raise HTTPException(
            status_code=400,
            detail="לא ניתן למחוק פרויקט שיש בו הצעות. השתמש במחיקה עם סיסמת מנהל.",
        )
    await repo.delete(qs)


@router.post("/{quote_subject_id}/delete", status_code=204)
async def delete_quote_subject_with_password(
    quote_subject_id: int,
    body: DeleteQuoteSubjectRequest,
    db: DBSessionDep,
    user=Depends(require_admin()),
):
    """מחיקת פרויקט והצעות המחיר שבתוכו – רק מנהל, עם אימות סיסמה. לא ניתן לשחזר."""
    user_repo = UserRepository(db)
    db_user = await user_repo.get_by_id(user.id)
    if not db_user or not db_user.password_hash:
        raise HTTPException(status_code=400, detail="משתמש לא נמצא או מתחבר דרך OAuth")
    if not verify_password(body.password, db_user.password_hash):
        raise HTTPException(status_code=400, detail="סיסמה שגויה")

    subject_repo = QuoteSubjectRepository(db)
    qs = await subject_repo.get(quote_subject_id)
    if not qs:
        raise HTTPException(status_code=404, detail="Quote subject not found")

    qp_repo = QuoteProjectRepository(db)
    quotes = await qp_repo.list(quote_subject_id=quote_subject_id)
    for qp in quotes:
        await db.delete(qp)
    await db.delete(qs)
    await db.commit()
