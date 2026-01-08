from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class EmailVerificationRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    verification_type: str = Field(pattern="^(admin_register|member_register)$")


class EmailVerificationConfirm(BaseModel):
    email: Optional[EmailStr] = None  # Optional when using token
    verification_code: Optional[str] = Field(None, min_length=6, max_length=6)  # For code-based verification
    verification_token: Optional[str] = None  # For link-based verification
    password: str = Field(min_length=8, max_length=128)


class EmailVerificationOut(BaseModel):
    id: int
    email: str
    verification_type: str
    is_verified: bool
    verified_at: Optional[datetime] = None
    expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class EmailVerificationStatus(BaseModel):
    email: str
    verification_sent: bool
    message: str
