from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class AdminInviteCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    expires_days: int = Field(default=7, ge=1, le=30)


class AdminInviteOut(BaseModel):
    id: int
    invite_code: str
    email: str
    full_name: str
    created_by: int
    is_used: bool
    used_at: Optional[datetime] = None
    expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class AdminInviteUse(BaseModel):
    invite_code: str = Field(min_length=8, max_length=8)
    password: str = Field(min_length=8, max_length=128)


class AdminInviteList(BaseModel):
    id: int
    invite_code: str
    email: str
    full_name: str
    is_used: bool
    used_at: Optional[datetime] = None
    expires_at: datetime
    created_at: datetime
    is_expired: bool

    class Config:
        from_attributes = True
