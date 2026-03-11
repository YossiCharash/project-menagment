# [PermSys-Core-008]
"""Core PermissionsEngine -- the primary facade for all IAM operations.

The engine orchestrates the PermissionProvider and RoleRepository
abstractions.  Business logic (endpoints, services) should interact with
the IAM subsystem exclusively through this class.

Usage:
    engine = PermissionsEngine(db)
    if await engine.has_permission(user_id, "write", "transaction", project_id=5):
        ...
"""

from __future__ import annotations

import json
import logging
from typing import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from backend.iam.interfaces import PermissionProvider, RoleRepository
from backend.iam.repository import (
    SQLAlchemyPermissionProvider,
    SQLAlchemyRoleRepository,
)
from backend.iam.models import PermissionAuditLog, ResourcePolicy
from backend.iam.enums import Action, ResourceType, GlobalRole, ProjectRole
from backend.iam.exceptions import (
    PermissionDeniedError,
    RoleNotFoundError,
    InvalidAssignmentError,
)

logger = logging.getLogger(__name__)


class PermissionsEngine:
    """High-level IAM facade.

    All public methods are async and safe to call from FastAPI endpoints.
    The ``has_permission`` method guarantees it will never raise -- it
    returns ``False`` on any internal error, as specified by the interface
    contract.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._provider: PermissionProvider = SQLAlchemyPermissionProvider(db)
        self._roles: RoleRepository = SQLAlchemyRoleRepository(db)

    # ------------------------------------------------------------------
    # Permission checks
    # ------------------------------------------------------------------

    async def has_permission(
        self,
        user_id: int,
        action: str,
        resource_type: str,
        *,
        resource_id: int | str | None = None,
        project_id: int | None = None,
    ) -> bool:
        """Check whether a user is allowed to perform an action.

        Args:
            user_id: ID of the subject (user).
            action: The action string (e.g. ``"read"``, ``"write"``).
            resource_type: The resource category (e.g. ``"project"``).
            resource_id: Optional specific resource instance.
            project_id: Optional project scope for project-level roles.

        Returns:
            True if permitted, False otherwise. Never raises.
        """
        # Self-profile: users can always update their own profile fields
        if (
            resource_type == "user"
            and action in ("update", "read")
            and resource_id is not None
            and str(resource_id) == str(user_id)
        ):
            return True

        try:
            domain = str(project_id) if project_id is not None else None
            return await self._provider.has_permission(
                user_id=user_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                domain=domain,
            )
        except Exception:
            logger.exception(
                "Error checking permission for user=%d action=%s resource=%s",
                user_id, action, resource_type,
            )
            return False

    async def check_permission(
        self,
        user_id: int,
        action: str,
        resource_type: str,
        *,
        resource_id: int | str | None = None,
        project_id: int | None = None,
    ) -> None:
        """Like ``has_permission`` but raises ``PermissionDeniedError`` on denial.

        Use this in service-layer code where you want to short-circuit
        execution when a user lacks the required permission.
        """
        allowed = await self.has_permission(
            user_id,
            action,
            resource_type,
            resource_id=resource_id,
            project_id=project_id,
        )
        if not allowed:
            raise PermissionDeniedError(
                user_id=user_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
            )

    # ------------------------------------------------------------------
    # Role management
    # ------------------------------------------------------------------

    async def get_user_roles(
        self, user_id: int, project_id: int | None = None
    ) -> dict[str, str | list[dict[str, str | int]]]:
        """Return a summary of all roles held by a user.

        Returns:
            A dict with ``global_role`` (str | None) and ``project_roles``
            (list of dicts with ``project_id`` and ``role``).
        """
        global_role = await self._roles.get_user_global_role(user_id)
        project_roles = await self._roles.get_user_project_roles(
            user_id, project_id
        )
        return {
            "global_role": global_role,
            "project_roles": project_roles,
        }

    async def grant_project_role(
        self,
        user_id: int,
        project_id: int,
        role: str,
        *,
        actor_user_id: int | None = None,
    ) -> None:
        """Assign a project-scoped role to a user.

        Args:
            user_id: Target user.
            project_id: Target project.
            role: Role name (must be a valid ProjectRole value).
            actor_user_id: User performing the grant (for audit logging).

        Raises:
            RoleNotFoundError: If the role string is not a valid ProjectRole.
        """
        valid_roles = {r.value for r in ProjectRole}
        if role not in valid_roles:
            raise RoleNotFoundError(role)

        await self._roles.assign_project_role(user_id, project_id, role)

        # Audit
        await self._audit(
            actor_user_id=actor_user_id,
            target_user_id=user_id,
            action="grant_project_role",
            detail=json.dumps({"project_id": project_id, "role": role}),
        )
        logger.info(
            "Granted role %s to user %d on project %d (by user %s)",
            role, user_id, project_id, actor_user_id,
        )

    async def revoke_project_role(
        self,
        user_id: int,
        project_id: int,
        role: str,
        *,
        actor_user_id: int | None = None,
    ) -> None:
        """Revoke a project-scoped role from a user.

        Args:
            user_id: Target user.
            project_id: Target project.
            role: Role name to revoke.
            actor_user_id: User performing the revocation (for audit logging).
        """
        await self._roles.revoke_project_role(user_id, project_id, role)

        await self._audit(
            actor_user_id=actor_user_id,
            target_user_id=user_id,
            action="revoke_project_role",
            detail=json.dumps({"project_id": project_id, "role": role}),
        )
        logger.info(
            "Revoked role %s from user %d on project %d (by user %s)",
            role, user_id, project_id, actor_user_id,
        )

    async def get_project_members(
        self, project_id: int
    ) -> Sequence[dict[str, str | int]]:
        """Return all members (with their roles) for a project."""
        return await self._roles.get_project_members(project_id)

    # ------------------------------------------------------------------
    # Resource-level policies
    # ------------------------------------------------------------------

    async def grant_resource_permission(
        self,
        user_id: int,
        resource_type: str,
        resource_id: int | str,
        action: str,
        *,
        actor_user_id: int | None = None,
    ) -> None:
        """Create an explicit resource-level permission override."""
        from sqlalchemy import select, and_

        existing = await self._db.execute(
            select(ResourcePolicy).where(
                and_(
                    ResourcePolicy.user_id == user_id,
                    ResourcePolicy.resource_type == resource_type,
                    ResourcePolicy.resource_id == str(resource_id),
                    ResourcePolicy.action == action,
                )
            )
        )
        policy = existing.scalar_one_or_none()
        if policy:
            policy.effect = "allow"
        else:
            self._db.add(
                ResourcePolicy(
                    user_id=user_id,
                    resource_type=resource_type,
                    resource_id=str(resource_id),
                    action=action,
                    effect="allow",
                    granted_by=actor_user_id,
                )
            )
        await self._db.flush()

        await self._audit(
            actor_user_id=actor_user_id,
            target_user_id=user_id,
            action="grant_resource_allow",
            detail=json.dumps(
                {
                    "resource_type": resource_type,
                    "resource_id": str(resource_id),
                    "action": action,
                    "effect": "allow",
                }
            ),
        )

    async def revoke_resource_permission(
        self,
        user_id: int,
        resource_type: str,
        resource_id: int | str,
        action: str,
        *,
        actor_user_id: int | None = None,
    ) -> None:
        """Remove an explicit resource-level permission override."""
        from sqlalchemy import delete as sa_delete, and_

        await self._db.execute(
            sa_delete(ResourcePolicy).where(
                and_(
                    ResourcePolicy.user_id == user_id,
                    ResourcePolicy.resource_type == resource_type,
                    ResourcePolicy.resource_id == str(resource_id),
                    ResourcePolicy.action == action,
                )
            )
        )
        await self._db.flush()

        await self._audit(
            actor_user_id=actor_user_id,
            target_user_id=user_id,
            action="revoke_resource_permission",
            detail=json.dumps(
                {
                    "resource_type": resource_type,
                    "resource_id": str(resource_id),
                    "action": action,
                }
            ),
        )

    # ------------------------------------------------------------------
    # Permissions summary
    # ------------------------------------------------------------------

    async def get_user_permissions(
        self, user_id: int, project_id: int | None = None
    ) -> list[dict[str, str]]:
        """Return all effective permissions for a user."""
        domain = str(project_id) if project_id is not None else None
        return await self._provider.get_user_permissions(user_id, domain)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _audit(
        self,
        *,
        actor_user_id: int | None,
        target_user_id: int | None,
        action: str,
        detail: str | None = None,
    ) -> None:
        """Write an entry to the permission audit log."""
        self._db.add(
            PermissionAuditLog(
                actor_user_id=actor_user_id,
                target_user_id=target_user_id,
                action=action,
                detail=detail,
            )
        )
        await self._db.flush()
