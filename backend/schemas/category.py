from datetime import datetime
from pydantic import BaseModel, Field, field_validator
from typing import Any


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    parent_id: int | None = Field(default=None, description="ID of parent category for subcategories")
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate category name - trim whitespace"""
        if not v or not v.strip():
            raise ValueError('שם הקטגוריה לא יכול להיות ריק')
        return v.strip()


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    is_active: bool | None = None


class CategoryOut(CategoryBase):
    id: int
    parent_id: int | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    # Include children for hierarchical display
    children: list["CategoryOut"] = Field(default_factory=list)

    class Config:
        from_attributes = True


# Update forward reference
CategoryOut.model_rebuild()

