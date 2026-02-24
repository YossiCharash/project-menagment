from __future__ import annotations
from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    calendar_color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    calendar_date_display: Mapped[str] = mapped_column(String(20), default="gregorian")
    show_jewish_holidays: Mapped[bool] = mapped_column(Boolean, default=True)
    show_islamic_holidays: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(back_populates="preferences")
