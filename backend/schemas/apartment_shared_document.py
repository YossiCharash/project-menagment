from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ApartmentSharedDocumentOut(BaseModel):
    """A shared document (file in S3) shown on the apartment's details tab."""

    id: int
    apartment_id: int
    file_path: str
    file_name: str | None = None
    description: str | None = None
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)
