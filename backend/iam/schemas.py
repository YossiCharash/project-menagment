# [PermSys-Schema-006]
"""Pydantic v2 DTOs for the IAM subsystem.

These schemas define the request/response shapes for permission-related
API operations. They are intentionally decoupled from the ORM models so
that the API contract can evolve independently.
"""

from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Role assignment DTOs
# ---------------------------------------------------------------------------

class ProjectRoleAssignmentCreate(BaseModel):
    """Request body for assigning a project role."""

    user_id: int
    project_id: int
    role: str = Field(..., min_length=1, max_length=64)

    model_config = ConfigDict(from_attributes=True)


class ProjectRoleAssignmentOut(BaseModel):
    """Response body for a project role assignment."""

    id: int
    user_id: int
    project_id: int
    role: str
    assigned_by: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectRoleAssignmentUpdate(BaseModel):
    """Request body for updating a project role."""

    role: str = Field(..., min_length=1, max_length=64)


# ---------------------------------------------------------------------------
# Resource policy DTOs
# ---------------------------------------------------------------------------

class ResourcePolicyCreate(BaseModel):
    """Request body for creating a resource-level policy override."""

    user_id: int
    resource_type: str = Field(..., min_length=1, max_length=64)
    resource_id: str = Field(..., min_length=1, max_length=128)
    action: str = Field(..., min_length=1, max_length=64)

    model_config = ConfigDict(from_attributes=True)


class ResourcePolicyOut(BaseModel):
    """Response body for a resource policy."""

    id: int
    user_id: int
    resource_type: str
    resource_id: str
    action: str
    effect: str
    granted_by: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Permission check DTOs
# ---------------------------------------------------------------------------

class PermissionCheckRequest(BaseModel):
    """Request body for a permission check."""

    user_id: int
    action: str
    resource_type: str
    resource_id: int | str | None = None
    project_id: int | None = None


class PermissionCheckResponse(BaseModel):
    """Response body for a permission check."""

    allowed: bool
    user_id: int
    action: str
    resource_type: str
    resource_id: int | str | None = None
    reason: str | None = None


# ---------------------------------------------------------------------------
# User permissions summary
# ---------------------------------------------------------------------------

class UserPermissionsSummary(BaseModel):
    """Summary of a user's roles and permissions across the system."""

    user_id: int
    global_role: str | None = None
    project_roles: list[ProjectRoleAssignmentOut] = []
    resource_policies: list[ResourcePolicyOut] = []


# ---------------------------------------------------------------------------
# Audit log DTO
# ---------------------------------------------------------------------------

class PermissionAuditLogOut(BaseModel):
    """Response body for a permission audit log entry."""

    id: int
    actor_user_id: int | None = None
    target_user_id: int | None = None
    action: str
    detail: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
