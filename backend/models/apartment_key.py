from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class KeyHolder:
    """Where a physical key currently is: בדלפק / בחוץ."""
    IN_DESK = "in_desk"
    OUT = "out"


class KeyDirection:
    """Direction of a key transfer: מסירה החוצה / החזרה."""
    OUT = "out"
    RETURN = "return"


class ApartmentKey(Base):
    """Physical key (מפתח) belonging to an apartment, tracked at the reception desk."""
    __tablename__ = "apartment_keys"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id"), index=True)
    label: Mapped[str] = mapped_column(String(255))
    holder: Mapped[str] = mapped_column(
        String(16), default=KeyHolder.IN_DESK, nullable=False, index=True
    )
    holder_name: Mapped[str | None] = mapped_column(String(255), default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    apartment: Mapped["Apartment"] = relationship("Apartment", back_populates="keys")
    transfers: Mapped[list["KeyTransfer"]] = relationship(
        "KeyTransfer",
        back_populates="key",
        cascade="all, delete-orphan",
        order_by="KeyTransfer.created_at.desc()",
    )


class KeyTransfer(Base):
    """A single hand-out or return event for an apartment key (יומן מסירת מפתח)."""
    __tablename__ = "apartment_key_transfers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    key_id: Mapped[int] = mapped_column(ForeignKey("apartment_keys.id"), index=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    counterparty_name: Mapped[str] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(Text, default=None)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    key: Mapped["ApartmentKey"] = relationship("ApartmentKey", back_populates="transfers")
