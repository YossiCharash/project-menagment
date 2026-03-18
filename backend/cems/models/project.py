from typing import Optional

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.cems.models.base import CEMSBase, TimestampMixin, UUIDPrimaryKeyMixin


class CemsProject(UUIDPrimaryKeyMixin, TimestampMixin, CEMSBase):
    __tablename__ = "cems_projects"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)


# Backwards-compat alias so any existing import of ``Project`` still works.
Project = CemsProject
