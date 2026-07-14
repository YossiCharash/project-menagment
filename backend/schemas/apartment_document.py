from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ApartmentDocumentOut(BaseModel):
    """A document (file in S3) attached to an apartment, with its description."""

    id: int
    apartment_id: int
    file_path: str
    file_name: str | None = None
    description: str | None = None
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)
