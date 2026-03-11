# [PermSys-Core-012]
"""FastAPI endpoints for IAM administration.

These endpoints expose role management, permission checks, and audit log
queries. All mutating operations require Admin or SuperAdmin global roles.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.core.deps import DBSessionDep, get_current_user, require_admin
from backend.iam.engine import PermissionsEngine
from backend.iam.enums import ProjectRole
from backend.iam.schemas import (
    ProjectRoleAssignmentCreate,
    ProjectRoleAssignmentOut,
    PermissionCheckRequest,
    PermissionCheckResponse,
    UserPermissionsSummary,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Permission check
# ---------------------------------------------------------------------------

@router.post("/check", response_model=PermissionCheckResponse)
async def check_permission(
    body: PermissionCheckRequest,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """Check if a user has a specific permission.

    Any authenticated user can check their own permissions. Admins can
    check permissions for any user.
    """
    # Non-admin users can only check their own permissions
    if user.role != "Admin" and body.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only check your own permissions",
        )

    engine = PermissionsEngine(db)
    allowed = await engine.has_permission(
        user_id=body.user_id,
        action=body.action,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        project_id=body.project_id,
    )
    return PermissionCheckResponse(
        allowed=allowed,
        user_id=body.user_id,
        action=body.action,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
    )


# ---------------------------------------------------------------------------
# User permissions summary
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}/permissions")
async def get_user_permissions(
    user_id: int,
    db: DBSessionDep,
    project_id: int | None = Query(None),
    user=Depends(get_current_user),
):
    """Get all effective permissions for a user.

    Non-admins can only view their own permissions.
    """
    if user.role != "Admin" and user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own permissions",
        )

    engine = PermissionsEngine(db)
    roles = await engine.get_user_roles(user_id, project_id)
    permissions = await engine.get_user_permissions(user_id, project_id)

    return {
        "user_id": user_id,
        "global_role": roles.get("global_role"),
        "project_roles": roles.get("project_roles", []),
        "permissions": permissions,
    }


# ---------------------------------------------------------------------------
# Project role assignments
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/roles", status_code=status.HTTP_201_CREATED)
async def assign_project_role(
    project_id: int,
    body: ProjectRoleAssignmentCreate,
    db: DBSessionDep,
    admin=Depends(require_admin()),
):
    """Assign a project role to a user. Admin only."""
    engine = PermissionsEngine(db)
    await engine.grant_project_role(
        user_id=body.user_id,
        project_id=project_id,
        role=body.role,
        actor_user_id=admin.id,
    )
    return {
        "message": f"Role {body.role} assigned to user {body.user_id} on project {project_id}",
        "user_id": body.user_id,
        "project_id": project_id,
        "role": body.role,
    }


@router.delete("/projects/{project_id}/roles/{user_id}")
async def revoke_project_role(
    project_id: int,
    user_id: int,
    role: str = Query(..., description="Role to revoke"),
    db: DBSessionDep = None,
    admin=Depends(require_admin()),
):
    """Revoke a project role from a user. Admin only."""
    engine = PermissionsEngine(db)
    await engine.revoke_project_role(
        user_id=user_id,
        project_id=project_id,
        role=role,
        actor_user_id=admin.id,
    )
    return {"message": f"Role {role} revoked from user {user_id} on project {project_id}"}


@router.get("/projects/{project_id}/members")
async def get_project_members(
    project_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """Get all members and their roles for a project."""
    engine = PermissionsEngine(db)
    members = await engine.get_project_members(project_id)
    return {"project_id": project_id, "members": members}


# ---------------------------------------------------------------------------
# Resource-level permissions
# ---------------------------------------------------------------------------

@router.post("/resource-policies")
async def grant_resource_permission(
    user_id: int = Query(...),
    resource_type: str = Query(...),
    resource_id: str = Query(...),
    action: str = Query(...),
    db: DBSessionDep = None,
    admin=Depends(require_admin()),
):
    """Grant or override a resource-level permission. Admin only."""
    engine = PermissionsEngine(db)
    await engine.grant_resource_permission(
        user_id=user_id,
        resource_type=resource_type,
        resource_id=resource_id,
        action=action,
        actor_user_id=admin.id,
    )
    return {
        "message": "Resource permission granted",
        "user_id": user_id,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "action": action,
        "effect": "allow",
    }


@router.delete("/resource-policies")
async def revoke_resource_permission(
    user_id: int = Query(...),
    resource_type: str = Query(...),
    resource_id: str = Query(...),
    action: str = Query(...),
    db: DBSessionDep = None,
    admin=Depends(require_admin()),
):
    """Revoke a resource-level permission. Admin only."""
    engine = PermissionsEngine(db)
    await engine.revoke_resource_permission(
        user_id=user_id,
        resource_type=resource_type,
        resource_id=resource_id,
        action=action,
        actor_user_id=admin.id,
    )
    return {"message": "Resource permission revoked"}


# ---------------------------------------------------------------------------
# Available roles reference
# ---------------------------------------------------------------------------

@router.get("/roles")
async def list_available_roles(user=Depends(get_current_user)):
    """List all available role definitions in the system."""
    from backend.iam.enums import GlobalRole, ProjectRole, Action, ResourceType

    return {
        "global_roles": [{"name": r.value, "key": r.name} for r in GlobalRole],
        "project_roles": [{"name": r.value, "key": r.name} for r in ProjectRole],
        "actions": [{"name": a.value, "key": a.name} for a in Action],
        "resource_types": [{"name": rt.value, "key": rt.name} for rt in ResourceType],
    }
