from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(30), index=True)
    # entity_type values:
    #   'supplier'            — linked to a supplier
    #   'transaction'         — linked to a transaction
    #   'project'             — linked to a project
    #   'unforeseen_expense'  — linked to an UnforeseenTransactionLine (expense)
    #   'unforeseen_income'   — linked to an UnforeseenTransactionLine (income)
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    file_path: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, default=None)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    source_table: Mapped[str] = mapped_column(String(30), default="")
    source_id: Mapped[int] = mapped_column(Integer, default=0)
