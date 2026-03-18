import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.cems.models.base import CEMSBase, UUIDPrimaryKeyMixin, _utc_now

if TYPE_CHECKING:
    from backend.models.user import User


class SignatureType(str, enum.Enum):
    TRANSFER_RECEIPT = "TRANSFER_RECEIPT"
    WAREHOUSE_RETURN = "WAREHOUSE_RETURN"
    RETIREMENT_APPROVAL = "RETIREMENT_APPROVAL"


class Signature(UUIDPrimaryKeyMixin, CEMSBase):
    __tablename__ = "cems_signatures"

    signer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    signature_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    signed_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)
    signature_type: Mapped[SignatureType] = mapped_column(
        Enum(SignatureType, name="cems_signature_type"),
        nullable=False,
    )
    reference_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)

    signer: Mapped["User"] = relationship(
        "User",
        foreign_keys=[signer_id],
        primaryjoin="Signature.signer_id == User.id",
    )
