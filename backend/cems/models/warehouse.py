import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.cems.models.base import CEMSBase, TimestampMixin, UUIDPrimaryKeyMixin, _utc_now

if TYPE_CHECKING:
    from backend.cems.models.user import User


class Warehouse(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_warehouses"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    current_manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationship: the user currently managing this warehouse
    current_manager: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[current_manager_id],
    )
    areas: Mapped[List["Area"]] = relationship(
        "Area",
        back_populates="warehouse",
        cascade="all, delete-orphan",
    )
    manager_history: Mapped[List["ManagerHistory"]] = relationship(
        "ManagerHistory",
        back_populates="warehouse",
        cascade="all, delete-orphan",
    )


class Area(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_areas"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_warehouses.id", ondelete="CASCADE"),
        nullable=False,
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    warehouse: Mapped["Warehouse"] = relationship(
        "Warehouse",
        back_populates="areas",
    )


class ManagerHistory(UUIDPrimaryKeyMixin, CEMSBase):
    __tablename__ = "cems_manager_history"

    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_warehouses.id", ondelete="CASCADE"),
        nullable=False,
    )
    previous_manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    new_manager_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    changed_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    warehouse: Mapped["Warehouse"] = relationship(
        "Warehouse",
        back_populates="manager_history",
    )
    previous_manager: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[previous_manager_id],
    )
    new_manager: Mapped["User"] = relationship(
        "User",
        foreign_keys=[new_manager_id],
    )
    changed_by: Mapped["User"] = relationship(
        "User",
        foreign_keys=[changed_by_id],
    )
