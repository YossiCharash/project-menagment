from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class ActivityKind:
    """Type of activity recorded on an apartment timeline (יומן פעילות)."""
    TENANT_CHANGED = "tenant_changed"
    KEY_OUT = "key_out"
    KEY_IN = "key_in"
    DELIVERY = "delivery"
    TECHNICIAN = "technician"
    CLIENT = "client"
    TASK = "task"


class ApartmentActivity(Base):
    """Single timeline entry (פעילות) for an apartment – audit/history feed."""
    __tablename__ = "apartment_activities"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    apartment: Mapped["Apartment"] = relationship("Apartment", back_populates="activities")
