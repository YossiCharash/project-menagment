from __future__ import annotations
from datetime import datetime, timedelta
from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
import secrets
import string

from backend.db.base import Base


class AdminInvite(Base):
    __tablename__ = "admin_invites"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    invite_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    used_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])

    @classmethod
    def generate_invite_code(cls) -> str:
        """Generate a secure random invite code"""
        return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))

    @classmethod
    def create_invite(cls, email: str, full_name: str, created_by: int, expires_days: int = 7) -> "AdminInvite":
        """Create a new admin invite"""
        invite_code = cls.generate_invite_code()
        expires_at = datetime.utcnow() + timedelta(days=expires_days)
        
        return cls(
            invite_code=invite_code,
            email=email,
            full_name=full_name,
            created_by=created_by,
            expires_at=expires_at
        )

    def is_expired(self) -> bool:
        """Check if the invite has expired"""
        return datetime.utcnow() > self.expires_at

    def is_valid(self) -> bool:
        """Check if the invite is valid (not used and not expired)"""
        return not self.is_used and not self.is_expired()
