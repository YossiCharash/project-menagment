from datetime import datetime, date
from pydantic import BaseModel, Field, field_serializer, ConfigDict
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.schemas.quote_line import QuoteLineOut
    from backend.schemas.quote_building import QuoteBuildingOut


class QuoteProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    parent_id: int | None = None
    project_id: int | None = None
    expected_start_date: date | None = None
    expected_income: float | None = None
    expected_expenses: float | None = None
    num_residents: int | None = None

    @field_serializer("expected_start_date", mode="plain")
    def serialize_date(self, v: date | None) -> str | None:
        if v is None:
            return None
        return v.isoformat()


class QuoteProjectCreate(QuoteProjectBase):
    pass


class QuoteProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    parent_id: int | None = None
    project_id: int | None = None
    expected_start_date: date | None = None
    expected_income: float | None = None
    expected_expenses: float | None = None
    num_residents: int | None = None


class QuoteLineOutNested(BaseModel):
    id: int
    quote_structure_item_id: int
    quote_structure_item_name: str = ""
    amount: float | None
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class QuoteProjectOut(QuoteProjectBase):
    id: int
    status: str  # draft | approved
    converted_project_id: int | None
    created_at: datetime
    updated_at: datetime
    quote_lines: list[QuoteLineOutNested] = Field(default_factory=list)
    quote_buildings: list["QuoteBuildingOut"] = Field(default_factory=list)
    children_count: int = 0

    model_config = ConfigDict(from_attributes=True)


# Resolve forward ref: QuoteBuildingOut must be in module namespace for list["QuoteBuildingOut"]
from backend.schemas.quote_building import QuoteBuildingOut  # noqa: E402

QuoteProjectOut.model_rebuild()
