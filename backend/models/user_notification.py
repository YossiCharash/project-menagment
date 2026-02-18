"""User notification model – messages, instructions, and task reminders per user."""
from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import Index, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class NotificationType:
    """Notification type: הוראה, משימה חדשה, תזכורת, כללי."""
    INSTRUCTION = "instruction"
    TASK_ASSIGNMENT = "task_assignment"
    TASK_REMINDER = "task_reminder"
    GENERAL = "general"


class UserNotification(Base):
    __tablename__ = "user_notifications"
    __table_args__ = (
        Index("ix_user_notifications_user_read", "user_id", "read_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    type: Mapped[str] = mapped_column(
        String(32), default=NotificationType.GENERAL, nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    user: Mapped["User"] = relationship(
        "User", back_populates="notifications", foreign_keys=[user_id]
    )
    from_user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[from_user_id], lazy="selectin"
    )
    task: Mapped["Task | None"] = relationship(
        "Task", foreign_keys=[task_id], lazy="selectin"
    )
