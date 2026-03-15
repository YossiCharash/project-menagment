import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.cems.models.base import CEMSBase, TimestampMixin, UUIDPrimaryKeyMixin, _utc_now

if TYPE_CHECKING:
    from backend.cems.models.fixed_asset import FixedAsset
    from backend.cems.models.user import User


class RetirementStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class AssetRetirement(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_asset_retirements"

    asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_fixed_assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requested_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    approved_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    disposal_method: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[RetirementStatus] = mapped_column(
        Enum(RetirementStatus, name="cems_retirement_status"),
        default=RetirementStatus.PENDING,
        nullable=False,
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    asset: Mapped["FixedAsset"] = relationship("FixedAsset", foreign_keys=[asset_id])
    requested_by: Mapped["User"] = relationship("User", foreign_keys=[requested_by_id])
    approved_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[approved_by_id])
