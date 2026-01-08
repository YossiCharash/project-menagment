from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
from typing import Literal


class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    role: Literal["Admin", "Member"] = "Member"
    is_active: bool = True
    group_id: int | None = None


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    role: Literal["Admin", "Member"] | None = None
    is_active: bool | None = None
    group_id: int | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserOut(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AdminRegister(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class MemberRegister(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    group_id: int


class AdminCreateUser(BaseModel):
    """Schema for admin creating a new user - temporary password will be generated and sent via email"""
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    role: Literal["Admin", "Member"] = "Member"