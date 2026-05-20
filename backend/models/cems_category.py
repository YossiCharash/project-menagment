import uuid as _uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.cems_base import CEMSBase, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from backend.models.cems_warehouse import Warehouse


class AssetCategory(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_asset_categories"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    warehouse_id: Mapped[Optional[_uuid.UUID]] = mapped_column(
        ForeignKey("cems_warehouses.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    parent_id: Mapped[Optional[_uuid.UUID]] = mapped_column(
        ForeignKey("cems_asset_categories.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    image_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    warehouse: Mapped[Optional["Warehouse"]] = relationship(
        "Warehouse",
        foreign_keys=[warehouse_id],
        lazy="raise",
    )
    parent: Mapped[Optional["AssetCategory"]] = relationship(
        "AssetCategory",
        remote_side="AssetCategory.id",
        foreign_keys=[parent_id],
        lazy="raise",
    )
    children: Mapped[List["AssetCategory"]] = relationship(
        "AssetCategory",
        foreign_keys=[parent_id],
        lazy="raise",
    )
