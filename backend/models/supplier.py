from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, DateTime, Boolean, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.associationproxy import association_proxy

from backend.db.base import Base
from backend.models.category import Category


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), default=None)
    phone: Mapped[str | None] = mapped_column(String(50), default=None)
    
    # Category Relationship
    # category column is now an Integer FK, but we map it to 'category_id' in python model
    # to avoid conflict with the relationship or proxies if needed, but per request 'category'
    # should be the relationship. Let's match Transaction pattern:
    category_id: Mapped[int | None] = mapped_column("category", ForeignKey("categories.id"), nullable=True, index=True)
    category: Mapped["Category | None"] = relationship(lazy="selectin")
    
    annual_budget: Mapped[float | None] = mapped_column(Numeric(14, 2), default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    documents: Mapped[list["SupplierDocument"]] = relationship(back_populates="supplier", cascade="all, delete-orphan")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="supplier", lazy="selectin")
