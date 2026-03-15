import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class CEMSBase(DeclarativeBase):
    """Separate declarative base for the CEMS module.

    Keeps CEMS tables isolated from the main BMS schema while still
    allowing Alembic or raw DDL to manage them independently.
    """

    pass


class TimestampMixin:
    """Mixin that adds created_at / updated_at columns to any model."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=_utc_now,
        onupdate=_utc_now,
        nullable=False,
    )


class UUIDPrimaryKeyMixin:
    """Mixin that provides a UUID primary key column."""

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
