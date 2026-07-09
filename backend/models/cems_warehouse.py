import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.cems_base import CEMSBase, TimestampMixin, UUIDPrimaryKeyMixin, _utc_now

if TYPE_CHECKING:
    from backend.models.cems_project import CemsProject
    from backend.models.user import User


class WarehouseProject(CEMSBase):
    """Junction table for the many-to-many relationship between Warehouse and CemsProject."""
    __tablename__ = "cems_warehouse_projects"

    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_warehouses.id", ondelete="CASCADE"), primary_key=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_projects.id", ondelete="CASCADE"), primary_key=True
    )


class Warehouse(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_warehouses"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_manager_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Self-referential hierarchy: a sub-warehouse points at its parent so
    # sub-warehouses under a project are distinguishable from top-level ones.
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_warehouses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    current_manager: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[current_manager_id],
        primaryjoin="Warehouse.current_manager_id == User.id",
    )
    # `remote_side` marks the "one" side of the self-referential FK so
    # SQLAlchemy knows `parent` resolves to the row whose id == parent_id.
    # `lazy="raise"` prevents accidental async lazy-loads (MissingGreenlet);
    # callers eager-load via selectinload(Warehouse.parent).
    parent: Mapped[Optional["Warehouse"]] = relationship(
        "Warehouse",
        remote_side="Warehouse.id",
        foreign_keys=[parent_id],
        back_populates="children",
        lazy="raise",
    )
    children: Mapped[List["Warehouse"]] = relationship(
        "Warehouse",
        back_populates="parent",
        foreign_keys=[parent_id],
        lazy="raise",
    )
    projects: Mapped[List["CemsProject"]] = relationship(
        "CemsProject",
        secondary="cems_warehouse_projects",
        lazy="selectin",
    )
    manager_history: Mapped[List["ManagerHistory"]] = relationship(
        "ManagerHistory",
        back_populates="warehouse",
        cascade="all, delete-orphan",
    )


class ManagerHistory(UUIDPrimaryKeyMixin, CEMSBase):
    __tablename__ = "cems_manager_history"

    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cems_warehouses.id", ondelete="CASCADE"),
        nullable=False,
    )
    previous_manager_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    new_manager_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    changed_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    warehouse: Mapped["Warehouse"] = relationship(
        "Warehouse",
        back_populates="manager_history",
    )
    previous_manager: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[previous_manager_id],
        primaryjoin="ManagerHistory.previous_manager_id == User.id",
    )
    new_manager: Mapped["User"] = relationship(
        "User",
        foreign_keys=[new_manager_id],
        primaryjoin="ManagerHistory.new_manager_id == User.id",
    )
    changed_by: Mapped["User"] = relationship(
        "User",
        foreign_keys=[changed_by_id],
        primaryjoin="ManagerHistory.changed_by_id == User.id",
    )
