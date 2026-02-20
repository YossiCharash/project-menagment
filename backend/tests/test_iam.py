# [PermSys-Test-013]
"""Unit tests for the IAM permissions subsystem.

These tests validate the core permission engine logic, role resolution,
and decorator behavior using a real async SQLite database (in-memory).
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from backend.iam.enums import Action, ResourceType, GlobalRole, ProjectRole
from backend.iam.exceptions import PermissionDeniedError, RoleNotFoundError
from backend.iam.repository import (
    _GLOBAL_ROLE_POLICIES,
    _PROJECT_ROLE_POLICIES,
)


# ---------------------------------------------------------------------------
# Policy table consistency tests (no DB required)
# ---------------------------------------------------------------------------

class TestPolicyTables:
    """Verify that role policy tables are internally consistent."""

    def test_all_global_roles_have_policies(self):
        """Every GlobalRole enum member should have a policy entry."""
        for role in GlobalRole:
            assert role.value in _GLOBAL_ROLE_POLICIES, (
                f"Missing policy for global role: {role.value}"
            )

    def test_all_project_roles_have_policies(self):
        """Every ProjectRole enum member should have a policy entry."""
        for role in ProjectRole:
            assert role.value in _PROJECT_ROLE_POLICIES, (
                f"Missing policy for project role: {role.value}"
            )

    def test_super_admin_has_all_actions_on_all_resources(self):
        """SuperAdmin should be allowed every action on every resource type."""
        sa_policy = _GLOBAL_ROLE_POLICIES[GlobalRole.SUPER_ADMIN.value]
        for rt in ResourceType:
            assert rt.value in sa_policy, f"SuperAdmin missing resource: {rt.value}"
            for action in Action:
                assert action.value in sa_policy[rt.value], (
                    f"SuperAdmin missing {action.value} on {rt.value}"
                )

    def test_admin_cannot_delete_audit_logs(self):
        """Admin should only read audit logs, not delete or write them."""
        admin_policy = _GLOBAL_ROLE_POLICIES[GlobalRole.ADMIN.value]
        audit_actions = admin_policy.get(ResourceType.AUDIT_LOG.value, set())
        assert Action.READ.value in audit_actions
        assert Action.DELETE.value not in audit_actions
        assert Action.WRITE.value not in audit_actions

    def test_member_has_no_admin_invite_access(self):
        """Members should not be able to manage admin invites."""
        member_policy = _GLOBAL_ROLE_POLICIES[GlobalRole.MEMBER.value]
        admin_invite_actions = member_policy.get(ResourceType.ADMIN_INVITE.value, set())
        assert len(admin_invite_actions) == 0

    def test_project_viewer_is_read_only(self):
        """ProjectViewer should only have READ actions."""
        viewer_policy = _PROJECT_ROLE_POLICIES[ProjectRole.VIEWER.value]
        for rt, actions in viewer_policy.items():
            for a in actions:
                assert a == Action.READ.value, (
                    f"ProjectViewer has non-read action {a} on {rt}"
                )

    def test_project_manager_has_full_access_to_project(self):
        """ProjectManager should have all actions on the project resource."""
        mgr_policy = _PROJECT_ROLE_POLICIES[ProjectRole.MANAGER.value]
        project_actions = mgr_policy.get(ResourceType.PROJECT.value, set())
        for action in Action:
            assert action.value in project_actions, (
                f"ProjectManager missing {action.value} on project"
            )


# ---------------------------------------------------------------------------
# Enums tests
# ---------------------------------------------------------------------------

class TestEnums:
    """Verify enum values and extensibility."""

    def test_action_enum_has_core_actions(self):
        assert "read" in [a.value for a in Action]
        assert "write" in [a.value for a in Action]
        assert "delete" in [a.value for a in Action]
        assert "create" in [a.value for a in Action]

    def test_resource_type_has_core_resources(self):
        assert "project" in [r.value for r in ResourceType]
        assert "transaction" in [r.value for r in ResourceType]
        assert "task" in [r.value for r in ResourceType]
        assert "user" in [r.value for r in ResourceType]

    def test_global_role_maps_to_existing_user_roles(self):
        """Admin and Member should match the existing UserRole enum values."""
        assert GlobalRole.ADMIN.value == "Admin"
        assert GlobalRole.MEMBER.value == "Member"


# ---------------------------------------------------------------------------
# Exception tests
# ---------------------------------------------------------------------------

class TestExceptions:

    def test_permission_denied_error_includes_context(self):
        err = PermissionDeniedError(
            user_id=1,
            action="write",
            resource_type="project",
            resource_id=42,
        )
        assert "write" in str(err)
        assert "project" in str(err)
        assert err.user_id == 1
        assert err.resource_id == 42

    def test_role_not_found_error(self):
        err = RoleNotFoundError("FakeRole")
        assert "FakeRole" in str(err)
        assert err.role_name == "FakeRole"


# ---------------------------------------------------------------------------
# Engine unit tests (mocked DB)
# ---------------------------------------------------------------------------

class TestPermissionsEngineMocked:
    """Test the PermissionsEngine with mocked dependencies."""

    @pytest.mark.asyncio
    async def test_has_permission_returns_false_on_error(self):
        """has_permission must never raise -- returns False on errors."""
        from backend.iam.engine import PermissionsEngine

        mock_db = MagicMock()
        engine = PermissionsEngine(mock_db)

        # Make the provider raise
        engine._provider.has_permission = AsyncMock(side_effect=RuntimeError("boom"))

        result = await engine.has_permission(
            user_id=1, action="read", resource_type="project"
        )
        # The engine catches the error and returns False
        assert result is False

    @pytest.mark.asyncio
    async def test_check_permission_raises_on_denial(self):
        """check_permission should raise PermissionDeniedError when denied."""
        from backend.iam.engine import PermissionsEngine

        mock_db = MagicMock()
        engine = PermissionsEngine(mock_db)

        engine._provider.has_permission = AsyncMock(return_value=False)

        with pytest.raises(PermissionDeniedError):
            await engine.check_permission(
                user_id=1, action="delete", resource_type="project"
            )

    @pytest.mark.asyncio
    async def test_grant_project_role_rejects_invalid_role(self):
        """Granting an invalid role name should raise RoleNotFoundError."""
        from backend.iam.engine import PermissionsEngine

        mock_db = MagicMock()
        engine = PermissionsEngine(mock_db)

        with pytest.raises(RoleNotFoundError):
            await engine.grant_project_role(
                user_id=1, project_id=1, role="InvalidRole"
            )
