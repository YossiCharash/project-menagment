"""Model for saving group transaction drafts (עסקה קבוצתית כטיוטה)."""
from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class GroupTransactionDraft(Base):
    """Stores a draft of group transactions (rows as JSON). Documents stored in GroupTransactionDraftDocument."""
    __tablename__ = "group_transaction_drafts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str | None] = mapped_column(nullable=True)  # required when saving from UI
    rows: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)  # list of row payloads (no File objects)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="selectin")
    documents: Mapped[list["GroupTransactionDraftDocument"]] = relationship(
        "GroupTransactionDraftDocument", back_populates="draft", cascade="all, delete-orphan", lazy="selectin"
    )


class GroupTransactionDraftDocument(Base):
    """A file attached to a draft row (stored in S3). row_index = index in draft.rows; sub_type='main'|'income'|'expense', sub_index for income/expense."""
    __tablename__ = "group_transaction_draft_documents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("group_transaction_drafts.id", ondelete="CASCADE"), index=True, nullable=False)
    row_index: Mapped[int] = mapped_column(nullable=False)  # index in draft.rows
    sub_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # 'main' | 'income' | 'expense'
    sub_index: Mapped[int | None] = mapped_column(nullable=True)  # for income/expense: index in that array
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)

    draft: Mapped["GroupTransactionDraft"] = relationship("GroupTransactionDraft", back_populates="documents")
