from __future__ import annotations
from datetime import date, datetime, timezone
from sqlalchemy import String, DateTime, Date, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class Tenant(Base):
    """Tenant/resident (דייר) currently or previously living in an apartment."""
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))  # איש קשר 1 — שם
    phone: Mapped[str | None] = mapped_column(String(50), default=None)  # איש קשר 1 — טלפון
    email: Mapped[str | None] = mapped_column(String(255), default=None)  # איש קשר 1 — דוא״ל
    name_2: Mapped[str | None] = mapped_column(String(255), default=None)  # איש קשר 2 — שם
    phone_2: Mapped[str | None] = mapped_column(String(50), default=None)  # איש קשר 2 — טלפון
    email_2: Mapped[str | None] = mapped_column(String(255), default=None)  # איש קשר 2 — דוא״ל
    move_in_date: Mapped[date | None] = mapped_column(Date, default=None)
    move_out_date: Mapped[date | None] = mapped_column(Date, default=None)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    apartment: Mapped["Apartment"] = relationship("Apartment", back_populates="tenants")
