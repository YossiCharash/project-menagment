import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column

# Re-use the project-wide declarative base so all CEMS tables
# are managed by the same metadata / engine as the rest of the app.
from backend.db.base import Base as CEMSBase  # noqa: F401 – re-exported for backwards compat


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


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
