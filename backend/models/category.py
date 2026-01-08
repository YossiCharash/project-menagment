from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, DateTime, Boolean, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), index=True)  # Removed unique constraint to allow same name under different parents
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Self-referential relationship for parent-child hierarchy
    parent: Mapped["Category | None"] = relationship("Category", remote_side=[id], back_populates="children")
    children: Mapped[list["Category"]] = relationship("Category", back_populates="parent", cascade="all, delete-orphan")

