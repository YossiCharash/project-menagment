"""
Multi-tenant master database models.

These models live in the master database (bms_master) and track
all tenant organizations and CEO credentials. They use a separate
DeclarativeBase so their metadata can be created independently
of tenant-specific tables.
"""
from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column, DeclarativeBase


class MasterBase(DeclarativeBase):
    """Separate declarative base for master-database-only tables."""
    pass


class Tenant(MasterBase):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    db_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(
        String(50), default="active", index=True
    )  # "active", "suspended", "deleted"
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    last_accessed: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class CEOCredential(MasterBase):
    __tablename__ = "ceo_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
