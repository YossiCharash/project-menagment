from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class AuthorizedVehicleBase(BaseModel):
    plate: str = Field(min_length=1, max_length=32)
    model: str | None = None
    owner_name: str = Field(min_length=1, max_length=255)
    parking_spot: str | None = None


class AuthorizedVehicleCreate(AuthorizedVehicleBase):
    apartment_id: int


class AuthorizedVehicleUpdate(BaseModel):
    plate: str | None = Field(default=None, min_length=1, max_length=32)
    model: str | None = None
    owner_name: str | None = Field(default=None, min_length=1, max_length=255)
    parking_spot: str | None = None


class AuthorizedVehicleOut(AuthorizedVehicleBase):
    id: int
    apartment_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
