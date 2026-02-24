from __future__ import annotations
from datetime import datetime, timedelta, timezone
from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
import secrets
import string

from backend.db.base import Base


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    invite_type: Mapped[str] = mapped_column(String(10), index=True)  # 'admin' or 'member'
    invite_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    group_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    source_table: Mapped[str] = mapped_column(String(20), default="")
    source_id: Mapped[int] = mapped_column(Integer, default=0)

    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])

    # ── helpers (same logic as old AdminInvite / MemberInvite) ──────────────

    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at

    def is_valid(self) -> bool:
        return not self.is_used and not self.is_expired()

    # ── class factories ──────────────────────────────────────────────────────

    @classmethod
    def _generate_admin_code(cls) -> str:
        return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))

    @classmethod
    def create_admin_invite(cls, email: str, full_name: str, created_by: int, expires_days: int = 7) -> "Invite":
        token = cls._generate_admin_code()
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=expires_days)
        return cls(
            invite_type="admin",
            invite_token=token,
            email=email,
            full_name=full_name,
            created_by=created_by,
            expires_at=expires_at,
            source_table="invites",
            source_id=0,
        )

    @classmethod
    def create_member_invite(cls, email: str, full_name: str, created_by: int,
                             group_id: int | None = None, expires_days: int = 7) -> "Invite":
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=expires_days)
        return cls(
            invite_type="member",
            invite_token=token,
            email=email,
            full_name=full_name,
            group_id=group_id,
            created_by=created_by,
            expires_at=expires_at,
            source_table="invites",
            source_id=0,
        )
