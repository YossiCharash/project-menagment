from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(30), index=True)

    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    file_path: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, default=None)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    source_table: Mapped[str] = mapped_column(String(30), default="")
    source_id: Mapped[int] = mapped_column(Integer, default=0)

    # Direct FK to transactions table (nullable for non-transaction documents)
    transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        default=None,
    )

    # Direct FK to unforeseen_transaction_lines table (nullable for non-unforeseen documents)
    unforeseen_transaction_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("unforeseen_transaction_lines.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        default=None,
    )
