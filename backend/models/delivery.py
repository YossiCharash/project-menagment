from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class DeliveryStatus:
    """Delivery status: ממתין לאיסוף / נמסר."""
    PENDING = "pending"
    DELIVERED = "delivered"


class Delivery(Base):
    """Package/delivery (משלוח) held at the reception desk for an apartment."""
    __tablename__ = "deliveries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str | None] = mapped_column(String(64), default=None)  # סוג: חבילה / מכתב / פרחים
    meta: Mapped[str | None] = mapped_column(Text, default=None)  # פרטים נוספים
    status: Mapped[str] = mapped_column(
        String(16), default=DeliveryStatus.PENDING, nullable=False, index=True
    )
    received_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    apartment: Mapped["Apartment"] = relationship("Apartment", back_populates="deliveries")
