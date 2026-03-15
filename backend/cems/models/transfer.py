import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.cems.models.base import CEMSBase, TimestampMixin, UUIDPrimaryKeyMixin, _utc_now

if TYPE_CHECKING:
    from backend.cems.models.fixed_asset import FixedAsset
    from backend.cems.models.signature import Signature
    from backend.cems.models.user import User
    from backend.cems.models.warehouse import Area, Warehouse


class TransferStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    COMPLETED = "COMPLETED"


class ReturnStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class Transfer(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_transfers"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_fixed_assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    to_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    from_area_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_areas.id", ondelete="SET NULL"),
        nullable=True,
    )
    to_area_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_areas.id", ondelete="SET NULL"),
        nullable=True,
    )
    initiated_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    initiated_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)
    status: Mapped[TransferStatus] = mapped_column(
        Enum(TransferStatus, name="cems_transfer_status"),
        default=TransferStatus.PENDING,
        nullable=False,
        index=True,
    )
    recipient_signature_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_signatures.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    asset: Mapped["FixedAsset"] = relationship("FixedAsset", foreign_keys=[asset_id])
    from_user: Mapped["User"] = relationship("User", foreign_keys=[from_user_id])
    to_user: Mapped["User"] = relationship("User", foreign_keys=[to_user_id])
    initiated_by: Mapped["User"] = relationship("User", foreign_keys=[initiated_by_id])
    from_area: Mapped[Optional["Area"]] = relationship("Area", foreign_keys=[from_area_id])
    to_area: Mapped[Optional["Area"]] = relationship("Area", foreign_keys=[to_area_id])
    recipient_signature: Mapped[Optional["Signature"]] = relationship(
        "Signature", foreign_keys=[recipient_signature_id]
    )


class WarehouseReturn(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_warehouse_returns"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_fixed_assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    returned_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_warehouses.id", ondelete="CASCADE"),
        nullable=False,
    )
    return_area_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_areas.id", ondelete="SET NULL"),
        nullable=True,
    )
    manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[ReturnStatus] = mapped_column(
        Enum(ReturnStatus, name="cems_return_status"),
        default=ReturnStatus.PENDING,
        nullable=False,
    )
    manager_signature_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_signatures.id", ondelete="SET NULL"),
        nullable=True,
    )
    return_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    asset: Mapped["FixedAsset"] = relationship("FixedAsset", foreign_keys=[asset_id])
    returned_by: Mapped["User"] = relationship("User", foreign_keys=[returned_by_id])
    warehouse: Mapped["Warehouse"] = relationship("Warehouse", foreign_keys=[warehouse_id])
    return_area: Mapped[Optional["Area"]] = relationship("Area", foreign_keys=[return_area_id])
    manager: Mapped[Optional["User"]] = relationship("User", foreign_keys=[manager_id])
    manager_signature: Mapped[Optional["Signature"]] = relationship(
        "Signature", foreign_keys=[manager_signature_id]
    )
