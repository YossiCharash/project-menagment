from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

from backend.schemas.building import BuildingListItem


class BuildingProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class BuildingProjectCreate(BuildingProjectBase):
    pass


class BuildingProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class BuildingProjectListItem(BuildingProjectBase):
    """Project summary for list views (building count, no nested buildings)."""
    id: int
    created_at: datetime
    buildings_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class BuildingProjectOut(BuildingProjectBase):
    """Full project – nests its buildings."""
    id: int
    created_at: datetime
    buildings: list[BuildingListItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
