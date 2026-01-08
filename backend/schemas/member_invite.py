from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class MemberInviteCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    group_id: Optional[int] = None
    expires_days: int = Field(default=7, ge=1, le=30)


class MemberInviteOut(BaseModel):
    id: int
    invite_token: str
    email: str
    full_name: str
    group_id: Optional[int]
    created_by: int
    is_used: bool
    used_at: Optional[datetime]
    expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class MemberInviteList(BaseModel):
    id: int
    email: str
    full_name: str
    group_id: Optional[int]
    is_used: bool
    is_expired: bool
    expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class MemberInviteUse(BaseModel):
    invite_token: str
    password: str = Field(min_length=8, max_length=128)
