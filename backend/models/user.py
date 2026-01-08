from __future__ import annotations
from datetime import datetime
from enum import Enum
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class UserRole(str, Enum):
    ADMIN = "Admin"
    MEMBER = "Member"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)    
    full_name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Nullable for OAuth users
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    role: Mapped[str] = mapped_column(String(50), default=UserRole.MEMBER.value, index=True)                                                                    
    group_id: Mapped[int | None] = mapped_column(nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    requires_password_change: Mapped[bool] = mapped_column(Boolean, default=False)
    # OAuth fields
    oauth_provider: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)  # 'google', 'facebook', etc.
    oauth_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)  # Provider's user ID
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    projects: Mapped[list["Project"]] = relationship(back_populates="manager")
