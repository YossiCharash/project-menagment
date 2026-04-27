"""Schemas for group transaction drafts."""
from datetime import datetime
from pydantic import BaseModel


class GroupTransactionDraftCreate(BaseModel):
    name: str  # required
    rows: list[dict]  # each item: same shape as frontend TransactionRow (no File objects)


class GroupTransactionDraftUpdate(BaseModel):
    name: str | None = None
    rows: list[dict] | None = None


class GroupTransactionDraftBulkDelete(BaseModel):
    """Body for POST /group-transaction-drafts/bulk-delete.

    `ids = None` (or field omitted) means "delete all of current user's drafts".
    `ids = []` is a no-op (returns 0).
    """
    ids: list[int] | None = None


class GroupTransactionDraftBulkDeleteResult(BaseModel):
    deleted_count: int


class GroupTransactionDraftDocumentOut(BaseModel):
    """Document metadata (file_path excluded for security)."""
    id: int
    row_index: int
    sub_type: str | None
    sub_index: int | None
    original_filename: str

    class Config:
        from_attributes = True


class GroupTransactionDraftOut(BaseModel):
    id: int
    user_id: int
    name: str | None
    rows: list[dict]
    documents: list[GroupTransactionDraftDocumentOut] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
