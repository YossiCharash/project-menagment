from __future__ import annotations
from datetime import datetime, timedelta
from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
import secrets
import string

from backend.db.base import Base


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    verification_code: Mapped[str] = mapped_column(String(6), nullable=True, index=True)  # For code-based verification       
    verification_token: Mapped[str] = mapped_column(String(64), nullable=True, unique=True, index=True)  # For link-based verification
    verification_type: Mapped[str] = mapped_column(String(50))  # 'admin_register', 'member_register', 'password_reset'                                         
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)      
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)                                                                             

    # Additional data for registration
    full_name: Mapped[str] = mapped_column(String(255), nullable=True)
    group_id: Mapped[int] = mapped_column(nullable=True)
    role: Mapped[str] = mapped_column(String(50), nullable=True)

    @classmethod
    def generate_verification_code(cls) -> str:
        """Generate a 6-digit verification code"""
        return ''.join(secrets.choice(string.digits) for _ in range(6))
    
    @classmethod
    def generate_verification_token(cls) -> str:
        """Generate a secure verification token for links"""
        return secrets.token_urlsafe(32)

    @classmethod
    def create_verification(
        cls, 
        email: str, 
        verification_type: str,
        full_name: str = None,
        group_id: int = None,
        role: str = None,
        expires_minutes: int = 15
    ) -> "EmailVerification":
        """Create a new email verification"""
        verification_code = cls.generate_verification_code()
        expires_at = datetime.utcnow() + timedelta(minutes=expires_minutes)
        
        return cls(
            email=email,
            verification_code=verification_code,
            verification_type=verification_type,
            full_name=full_name,
            group_id=group_id,
            role=role,
            expires_at=expires_at
        )

    def is_expired(self) -> bool:
        """Check if the verification code has expired"""
        return datetime.utcnow() > self.expires_at

    def is_valid(self) -> bool:
        """Check if the verification code is valid (not used and not expired)"""
        return not self.is_verified and not self.is_expired()
