import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.cems.models.base import CEMSBase, TimestampMixin, UUIDPrimaryKeyMixin, _utc_now

if TYPE_CHECKING:
    from backend.cems.models.category import AssetCategory
    from backend.cems.models.warehouse import Warehouse
    from backend.models.project import Project
    from backend.models.user import User


class ConsumableItem(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_consumable_items"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_asset_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=Decimal("0"), nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=False)
    low_stock_threshold: Mapped[Decimal] = mapped_column(
        Numeric(10, 4), default=Decimal("0"), nullable=False
    )
    reorder_quantity: Mapped[Decimal] = mapped_column(
        Numeric(10, 4), default=Decimal("0"), nullable=False
    )

    category: Mapped["AssetCategory"] = relationship("AssetCategory", lazy="joined")
    warehouse: Mapped["Warehouse"] = relationship("Warehouse", foreign_keys=[warehouse_id])


class AlertType(str, enum.Enum):
    LOW_STOCK = "LOW_STOCK"
    OUT_OF_STOCK = "OUT_OF_STOCK"


class ConsumptionLog(UUIDPrimaryKeyMixin, CEMSBase):
    __tablename__ = "cems_consumption_logs"

    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_consumable_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    consumed_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )
    project_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )
    quantity_consumed: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    consumed_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    item: Mapped["ConsumableItem"] = relationship("ConsumableItem")
    consumed_by: Mapped["User"] = relationship(
        "User",
        foreign_keys=[consumed_by_id],
        primaryjoin="ConsumptionLog.consumed_by_id == User.id",
    )
    project: Mapped[Optional["Project"]] = relationship("Project", foreign_keys=[project_id])


class StockAlert(UUIDPrimaryKeyMixin, CEMSBase):
    __tablename__ = "cems_stock_alerts"

    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_consumable_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    alert_type: Mapped[AlertType] = mapped_column(
        Enum(AlertType, name="cems_alert_type"),
        nullable=False,
    )
    quantity_at_alert: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)

    item: Mapped["ConsumableItem"] = relationship("ConsumableItem")
