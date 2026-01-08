from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, Date, DateTime, ForeignKey, Numeric, Text, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    start_date: Mapped[datetime | None] = mapped_column(Date, default=None)
    end_date: Mapped[datetime | None] = mapped_column(Date, default=None)

    budget_monthly: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    budget_annual: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    # New fields
    num_residents: Mapped[int | None] = mapped_column(Integer, default=None)
    monthly_price_per_apartment: Mapped[float | None] = mapped_column(Numeric(10, 2), default=None)
    address: Mapped[str | None] = mapped_column(String(255), default=None)
    city: Mapped[str | None] = mapped_column(String(120), default=None)
    relation_project: Mapped[int | None] = mapped_column(Integer, default=None)
    image_url: Mapped[str | None] = mapped_column(String(500), default=None)
    contract_file_url: Mapped[str | None] = mapped_column(String(500), default=None)
    is_parent_project: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    manager_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    manager: Mapped["User | None"] = relationship(back_populates="projects")

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    recurring_templates: Mapped[list["RecurringTransactionTemplate"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    subprojects: Mapped[list["Subproject"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    budgets: Mapped[list["Budget"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    fund: Mapped["Fund | None"] = relationship(back_populates="project", cascade="all, delete-orphan", uselist=False)
    contract_periods: Mapped[list["ContractPeriod"]] = relationship(back_populates="project", cascade="all, delete-orphan")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
