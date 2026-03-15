import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.cems.models.base import CEMSBase, TimestampMixin, UUIDPrimaryKeyMixin, _utc_now

if TYPE_CHECKING:
    from backend.cems.models.category import AssetCategory
    from backend.cems.models.project import Project
    from backend.cems.models.user import User
    from backend.cems.models.warehouse import Area


class AssetStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    IN_TRANSFER = "IN_TRANSFER"
    IN_WAREHOUSE = "IN_WAREHOUSE"
    RETIRED = "RETIRED"


class FixedAsset(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_fixed_assets"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    serial_number: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_asset_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    current_custodian_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    current_area_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_areas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[AssetStatus] = mapped_column(
        Enum(AssetStatus, name="cems_asset_status"),
        default=AssetStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    purchase_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    warranty_expiry: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    category: Mapped["AssetCategory"] = relationship("AssetCategory", lazy="joined")
    current_custodian: Mapped[Optional["User"]] = relationship("User", foreign_keys=[current_custodian_id])
    current_area: Mapped[Optional["Area"]] = relationship("Area", foreign_keys=[current_area_id])
    project: Mapped[Optional["Project"]] = relationship("Project", foreign_keys=[project_id])
    history: Mapped[List["AssetHistory"]] = relationship(
        "AssetHistory",
        back_populates="asset",
        cascade="all, delete-orphan",
        order_by="AssetHistory.timestamp.desc()",
    )


class AssetHistory(UUIDPrimaryKeyMixin, CEMSBase):
    __tablename__ = "cems_asset_history"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_fixed_assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_users.id", ondelete="SET NULL"),
        nullable=False,
    )
    from_custodian_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    to_custodian_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    from_area_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_areas.id", ondelete="SET NULL"),
        nullable=True,
    )
    to_area_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_areas.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)

    # Relationships
    asset: Mapped["FixedAsset"] = relationship("FixedAsset", back_populates="history")
    actor: Mapped["User"] = relationship("User", foreign_keys=[actor_id])
