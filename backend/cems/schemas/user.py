from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr

from backend.cems.models.user import UserRole  # CemsUserRole enum


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    cems_role: Optional[UserRole] = None
    cems_warehouse_id: Optional[int] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    cems_role: Optional[UserRole] = None
    cems_warehouse_id: Optional[int] = None
    is_active: Optional[bool] = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    created_at: datetime
