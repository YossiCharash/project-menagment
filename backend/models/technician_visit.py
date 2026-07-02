from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class TechnicianVisitStatus:
    """Technician visit status: בבניין / עזב."""
    INSIDE = "inside"
    LEFT = "left"


class TechnicianVisit(Base):
    """Technician entering an apartment (כניסת טכנאי) recorded at the reception desk."""
    __tablename__ = "technician_visits"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str | None] = mapped_column(String(255), default=None)  # תפקיד: חשמלאי / אינסטלטור
    phone: Mapped[str | None] = mapped_column(String(64), default=None)
    note: Mapped[str | None] = mapped_column(Text, default=None)  # הערות
    status: Mapped[str] = mapped_column(
        String(16), default=TechnicianVisitStatus.INSIDE, nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    left_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    apartment: Mapped["Apartment"] = relationship("Apartment", back_populates="technician_visits")
