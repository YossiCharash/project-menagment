from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class ClientVisitStatus:
    """Client arrival status: נמצא בדירה / יצא."""
    PRESENT = "present"
    LEFT = "left"


class ClientVisit(Base):
    """A client arriving at an apartment (הגעת לקוח) recorded at the reception desk.

    An apartment is considered occupied (מאוכלסת) while it has at least one
    visit with status ``present``. ``expected_until`` is an optional scheduled
    end: once it passes, the visit is auto-flipped to ``left`` and the apartment
    becomes vacant (פנויה).
    """
    __tablename__ = "client_visits"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id"), index=True)
    name: Mapped[str | None] = mapped_column(String(255), default=None)  # שם הלקוח (אופציונלי)
    arrived_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    expected_until: Mapped[datetime | None] = mapped_column(DateTime, default=None)  # עד מתי (אופציונלי)
    note: Mapped[str | None] = mapped_column(Text, default=None)  # הערות
    status: Mapped[str] = mapped_column(
        String(16), default=ClientVisitStatus.PRESENT, nullable=False, index=True
    )
    left_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    apartment: Mapped["Apartment"] = relationship("Apartment", back_populates="client_visits")
