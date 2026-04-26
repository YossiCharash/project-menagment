import uuid as _uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.cems.models.base import CEMSBase, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from backend.cems.models.warehouse import Warehouse


class AssetCategory(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_asset_categories"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    warehouse_id: Mapped[Optional[_uuid.UUID]] = mapped_column(
        ForeignKey("cems_warehouses.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    warehouse: Mapped[Optional["Warehouse"]] = relationship(
        "Warehouse",
        foreign_keys=[warehouse_id],
        lazy="raise",
    )
