# [PermSys-Schema-005]
"""SQLAlchemy ORM models for IAM persistence.

These models extend the existing ``Base`` declarative base used by the rest
of the application. They store:

- ProjectRoleAssignment: which user holds which role within which project
- ResourcePolicy: fine-grained per-resource permission overrides
- PermissionAuditLog: immutable log of permission changes

All tables use integer PKs to stay consistent with the existing schema
(the BMS project uses auto-increment int PKs, not UUIDs).
"""

from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy import (
    String,
    Integer,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class ProjectRoleAssignment(Base):
    """Maps a user to a role within a specific project.

    A user may have at most one role per project (enforced by unique
    constraint).  This is the core table for project-level RBAC.
    """

    __tablename__ = "iam_project_role_assignments"
    __table_args__ = (
        UniqueConstraint("user_id", "project_id", name="uq_iam_user_project_role"),
        Index("ix_iam_pra_user", "user_id"),
        Index("ix_iam_pra_project", "project_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    assigned_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )


class ResourcePolicy(Base):
    """Fine-grained permission override for a specific resource instance.

    Example: allow user 7 to WRITE transaction 42, even though their
    project role would normally only grant READ.

    Extension point: add rows here for new resource types (e.g.
    ``resource_type='comment'``) without any schema migration beyond the
    new rows themselves.
    """

    __tablename__ = "iam_resource_policies"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "resource_type", "resource_id", "action",
            name="uq_iam_resource_policy",
        ),
        Index("ix_iam_rp_user", "user_id"),
        Index("ix_iam_rp_resource", "resource_type", "resource_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    effect: Mapped[str] = mapped_column(
        String(16), nullable=False, default="allow"
    )  # "allow" or "deny"

    granted_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )


class PermissionAuditLog(Base):
    """Immutable audit trail for every permission change.

    Records grants, revocations, and policy modifications so that security
    reviews can trace who changed what and when.
    """

    __tablename__ = "iam_permission_audit_log"
    __table_args__ = (
        Index("ix_iam_pal_user", "actor_user_id"),
        Index("ix_iam_pal_target", "target_user_id"),
        Index("ix_iam_pal_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    target_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )
