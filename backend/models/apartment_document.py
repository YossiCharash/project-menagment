from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class ApartmentDocument(Base):
    """A document (מסמך) attached to an apartment's private personal area (אזור אישי).

    These files live behind the admin-password gate on the reception desk
    apartment card, alongside the private details/notes, so they are never
    returned by the normal apartment detail payload.
    """
    __tablename__ = "apartment_documents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    apartment_id: Mapped[int] = mapped_column(
        ForeignKey("apartments.id", ondelete="CASCADE"), index=True
    )
    file_path: Mapped[str] = mapped_column(String(1000))  # full storage URL
    filename: Mapped[str | None] = mapped_column(String(500), default=None)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    uploaded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, default=None
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    apartment: Mapped["Apartment"] = relationship("Apartment", back_populates="documents")
