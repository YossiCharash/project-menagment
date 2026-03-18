import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.cems.models.base import CEMSBase, TimestampMixin, UUIDPrimaryKeyMixin, _utc_now

if TYPE_CHECKING:
    from backend.models.user import User


class DocumentType(str, enum.Enum):
    WARRANTY = "WARRANTY"
    INVOICE = "INVOICE"
    OTHER = "OTHER"


class CemsDocument(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_documents"

    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    document_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, name="cems_document_type"),
        nullable=False,
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    uploaded_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    uploaded_by: Mapped["User"] = relationship(
        "User",
        foreign_keys=[uploaded_by_id],
        primaryjoin="CemsDocument.uploaded_by_id == User.id",
    )


# Backwards-compat alias so existing code using ``Document`` keeps working.
Document = CemsDocument
