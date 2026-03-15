import enum
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.cems.models.base import CEMSBase, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from backend.cems.models.warehouse import Warehouse


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    EMPLOYEE = "EMPLOYEE"


class User(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="cems_user_role"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    warehouse_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cems_warehouses.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )

    # Relationship: the warehouse this user is assigned to (as manager)
    managed_warehouse: Mapped[Optional["Warehouse"]] = relationship(
        "Warehouse",
        foreign_keys=[warehouse_id],
    )
