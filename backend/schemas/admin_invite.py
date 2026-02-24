from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict, computed_field
from typing import Optional


class AdminInviteCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    expires_days: int = Field(default=7, ge=1, le=30)


class AdminInviteOut(BaseModel):
    id: int
    invite_code: str  # alias for invite_token on the unified Invite model
    email: str
    full_name: str
    created_by: Optional[int]
    is_used: bool
    used_at: Optional[datetime] = None
    expires_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def model_validate(cls, obj, *args, **kwargs):
        # Map invite_token → invite_code transparently
        if hasattr(obj, "invite_token") and not hasattr(obj, "invite_code"):
            obj.__dict__["invite_code"] = obj.invite_token
        return super().model_validate(obj, *args, **kwargs)


class AdminInviteUse(BaseModel):
    invite_code: str = Field(min_length=8, max_length=64)
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

    model_config = ConfigDict(from_attributes=True)
