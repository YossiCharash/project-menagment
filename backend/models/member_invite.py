from __future__ import annotations
from datetime import datetime, timedelta
from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
import secrets
import string

from backend.db.base import Base


class MemberInvite(Base):
    __tablename__ = "member_invites"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    invite_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    group_id: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    used_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])

    @classmethod
    def generate_invite_token(cls) -> str:
        """Generate a secure random invite token"""
        return secrets.token_urlsafe(32)

    @classmethod
    def create_invite(cls, email: str, full_name: str, created_by: int, group_id: int = None, expires_days: int = 7) -> "MemberInvite":
        """Create a new member invite"""
        invite_token = cls.generate_invite_token()
        expires_at = datetime.utcnow() + timedelta(days=expires_days)
        
        return cls(
            invite_token=invite_token,
            email=email,
            full_name=full_name,
            group_id=group_id,
            created_by=created_by,
            expires_at=expires_at
        )

    def is_expired(self) -> bool:
        """Check if the invite has expired"""
        return datetime.utcnow() > self.expires_at

    def is_valid(self) -> bool:
        """Check if the invite is valid (not used and not expired)"""
        return not self.is_used and not self.is_expired()
