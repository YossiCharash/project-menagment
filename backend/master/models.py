"""
Master-only database models — stored in the super-admin (master) DB only.
Uses a separate DeclarativeBase (MasterBase) so that init_database() for tenant
DBs never creates these tables in tenant databases.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, String, DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class MasterBase(DeclarativeBase):
    pass


class Tenant(MasterBase):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    admin_email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    admin_name: Mapped[str] = mapped_column(String(255))
    db_url: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(50), default="provisioning")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    provisioned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # FK to the super-admin user who created this tenant (nullable for system-created)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
