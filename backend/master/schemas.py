from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class TenantCreate(BaseModel):
    slug: str
    admin_email: str
    admin_name: str
    admin_password: str
    db_url: str

    @field_validator("slug")
    @classmethod
    def slug_format(cls, v: str) -> str:
        import re
        if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", v):
            raise ValueError(
                "slug must be lowercase alphanumeric with hyphens (e.g. 'admin-cohen')"
            )
        return v


class TenantOut(BaseModel):
    id: int
    slug: str
    admin_email: str
    admin_name: str
    status: str
    created_at: datetime
    provisioned_at: Optional[datetime] = None
    created_by: Optional[int] = None

    model_config = {"from_attributes": True}


class TenantList(BaseModel):
    tenants: list[TenantOut]
    total: int
