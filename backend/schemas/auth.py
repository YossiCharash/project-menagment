from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime
import re


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: Optional[str] = None
    requires_password_change: Optional[bool] = False


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    remember_me: bool = False


class RefreshTokenInput(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordReset(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        if not re.match(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$', v):
            raise ValueError('Password must contain at least one uppercase letter, one lowercase letter, and one number')
        return v


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        if not re.match(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$', v):
            raise ValueError('Password must contain at least one uppercase letter, one lowercase letter, and one number')
        return v


class ResetPasswordWithToken(BaseModel):
    token: str
    temp_password: Optional[str] = None
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        if not re.match(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$', v):
            raise ValueError('Password must contain at least one uppercase letter, one lowercase letter, and one number')
        return v



class UserProfile(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
