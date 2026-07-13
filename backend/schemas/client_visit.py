from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class ClientVisitBase(BaseModel):
    name: str | None = None
    arrived_at: datetime  # מתי הלקוח מגיע (חובה)
    expected_until: datetime | None = None  # עד מתי (אופציונלי)
    note: str | None = None


class ClientVisitCreate(ClientVisitBase):
    apartment_id: int


class ClientVisitUpdate(BaseModel):
    name: str | None = None
    arrived_at: datetime | None = None
    expected_until: datetime | None = None
    note: str | None = None
    status: str | None = Field(default=None, pattern="^(present|left)$")


class ClientVisitOut(ClientVisitBase):
    id: int
    apartment_id: int
    status: str  # present | left
    left_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
