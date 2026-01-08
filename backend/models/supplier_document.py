from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class SupplierDocument(Base):
    __tablename__ = "supplier_documents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True, index=True)
    supplier: Mapped["Supplier | None"] = relationship(back_populates="documents")

    transaction_id: Mapped[int | None] = mapped_column(ForeignKey("transactions.id"), nullable=True, index=True)
    transaction: Mapped["Transaction | None"] = relationship("Transaction", back_populates="documents", lazy="selectin")

    file_path: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, default=None)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
