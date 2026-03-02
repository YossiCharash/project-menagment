from __future__ import annotations
from datetime import datetime, date, timezone
from enum import Enum
from sqlalchemy import String, Date, DateTime, ForeignKey, Numeric, Text, Boolean, Integer, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class UnforeseenTransactionStatus(str, Enum):
    DRAFT = "draft"
    WAITING_FOR_APPROVAL = "waiting_for_approval"
    EXECUTED = "executed"


class UnforeseenTransaction(Base):
    __tablename__ = "unforeseen_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    project: Mapped["Project"] = relationship(back_populates="unforeseen_transactions")

    contract_period_id: Mapped[int | None] = mapped_column(ForeignKey("contract_periods.id"), nullable=True, index=True)
    contract_period: Mapped["ContractPeriod | None"] = relationship()

    # Income - what the project manager charges the project
    income_amount: Mapped[float] = mapped_column(Numeric(18, 6), default=0)

    # Status tracking
    status: Mapped[str] = mapped_column(SAEnum(UnforeseenTransactionStatus, name="unforeseen_transaction_status", create_constraint=True, native_enum=True), default=UnforeseenTransactionStatus.DRAFT, index=True)

    # Description/notes
    description: Mapped[str | None] = mapped_column(Text, default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)

    # Transaction date
    transaction_date: Mapped[date] = mapped_column(Date, index=True, default=date.today)

    # Unified lines (replaces separate expenses / incomes relationships)
    lines: Mapped[list["UnforeseenTransactionLine"]] = relationship(
        back_populates="unforeseen_transaction",
        cascade="all, delete-orphan",
        lazy="selectin"
    )

    # User who created this
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_by_user: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_user_id], lazy="selectin")

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    # Link to the regular transaction created when executed
    resulting_transaction_id: Mapped[int | None] = mapped_column(ForeignKey("transactions.id"), nullable=True, index=True)
    resulting_transaction: Mapped["Transaction | None"] = relationship("Transaction", foreign_keys=[resulting_transaction_id])

    # ── convenience properties for backward compatibility ────────────────────
    @property
    def expenses(self):
        return [l for l in self.lines if l.line_type == "expense"]

    @property
    def incomes(self):
        return [l for l in self.lines if l.line_type == "income"]


class UnforeseenTransactionLine(Base):
    __tablename__ = "unforeseen_transaction_lines"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    unforeseen_transaction_id: Mapped[int] = mapped_column(
        ForeignKey("unforeseen_transactions.id", ondelete="CASCADE"), index=True
    )
    unforeseen_transaction: Mapped["UnforeseenTransaction"] = relationship(back_populates="lines")

    line_type: Mapped[str] = mapped_column(String(10), index=True)  # 'expense' or 'income'
    amount: Mapped[float] = mapped_column(Numeric(14, 2))
    description: Mapped[str | None] = mapped_column(Text, default=None)

    # Documents for this line via direct FK
    documents: Mapped[list["Document"]] = relationship(
        "Document",
        primaryjoin="Document.unforeseen_transaction_line_id == UnforeseenTransactionLine.id",
        foreign_keys="Document.unforeseen_transaction_line_id",
        lazy="selectin",
        viewonly=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    source_table: Mapped[str] = mapped_column(String(50), default="")
    source_id: Mapped[int] = mapped_column(Integer, default=0)
