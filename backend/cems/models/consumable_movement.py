import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.cems.models.base import CEMSBase, UUIDPrimaryKeyMixin, _utc_now

if TYPE_CHECKING:
    from backend.cems.models.consumable import ConsumableItem
    from backend.cems.models.warehouse import Warehouse
    from backend.models.user import User


class ConsumableMovementAction(str, enum.Enum):
    MOVE = "MOVE"
    TRANSFER_OUT = "TRANSFER_OUT"
    TRANSFER_IN = "TRANSFER_IN"


class ConsumableMovementLog(UUIDPrimaryKeyMixin, CEMSBase):
    __tablename__ = "cems_consumable_movement_logs"

    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_consumable_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_warehouse_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_warehouses.id", ondelete="SET NULL"),
        nullable=True,
    )
    to_warehouse_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_warehouses.id", ondelete="SET NULL"),
        nullable=True,
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    action: Mapped[ConsumableMovementAction] = mapped_column(
        Enum(ConsumableMovementAction, name="cems_consumable_movement_action"),
        nullable=False,
    )
    actor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    moved_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utc_now, nullable=False, index=True
    )

    item: Mapped["ConsumableItem"] = relationship("ConsumableItem", lazy="raise")
    from_warehouse: Mapped[Optional["Warehouse"]] = relationship(
        "Warehouse", foreign_keys=[from_warehouse_id], lazy="raise"
    )
    to_warehouse: Mapped[Optional["Warehouse"]] = relationship(
        "Warehouse", foreign_keys=[to_warehouse_id], lazy="raise"
    )
    actor: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[actor_id], lazy="raise"
    )
