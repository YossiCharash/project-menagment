import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.cems_base import CEMSBase, UUIDPrimaryKeyMixin, _utc_now

if TYPE_CHECKING:
    from backend.models.cems_consumable import ConsumableItem
    from backend.models.user import User


class ReorderStatus(str, enum.Enum):
    PENDING = "PENDING"
    ORDERED = "ORDERED"
    RECEIVED = "RECEIVED"
    CANCELLED = "CANCELLED"


class ReorderRequest(UUIDPrimaryKeyMixin, CEMSBase):
    """Tracks the lifecycle of a consumable reorder: request -> ordered -> received."""

    __tablename__ = "cems_reorder_requests"

    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_consumable_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requested_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )
    quantity_requested: Mapped[Decimal] = mapped_column(
        Numeric(10, 4), nullable=False
    )
    supplier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[ReorderStatus] = mapped_column(
        Enum(ReorderStatus, name="cems_reorder_status"),
        default=ReorderStatus.PENDING,
        nullable=False,
        index=True,
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utc_now, nullable=False
    )
    ordered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    received_by_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    quantity_received: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 4), nullable=True
    )

    # ── Relationships ────────────────────────────────────────────────────────
    item: Mapped["ConsumableItem"] = relationship(
        "ConsumableItem", foreign_keys=[item_id], lazy="raise"
    )
    requested_by: Mapped["User"] = relationship(
        "User",
        foreign_keys=[requested_by_id],
        primaryjoin="ReorderRequest.requested_by_id == User.id",
        lazy="raise",
    )
    received_by: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[received_by_id],
        primaryjoin="ReorderRequest.received_by_id == User.id",
        lazy="raise",
    )
