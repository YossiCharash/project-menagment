import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.cems.models.base import CEMSBase, TimestampMixin, UUIDPrimaryKeyMixin, _utc_now

if TYPE_CHECKING:
    from backend.cems.models.project import CemsProject
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
    current_manager_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    current_manager: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[current_manager_id],
        primaryjoin="Warehouse.current_manager_id == User.id",
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
