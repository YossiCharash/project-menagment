"""Tests for the Member-can-create-tasks-for-others feature.

Covers two changes:
1. The Member global role now has exactly `write` on the `task` resource
   (and nothing else) so Members can create tasks via the calendar.
2. `GET /users/for-tasks` returns all active users for every role so a
   Member can pick another person as assignee/participant.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from backend.iam.enums import Action, ResourceType, GlobalRole
from backend.iam.repository import _GLOBAL_ROLE_POLICIES, SQLAlchemyPermissionProvider
from backend.models.task import Task, TaskAttachment
from backend.models.user import User, UserRole
from backend.core.security import hash_password


# ---------------------------------------------------------------------------
# Extra fixture: a second member to be used as the assignee "other person"
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def other_member(test_db: AsyncSession) -> User:
    """Create and persist a second active member (the assignee target)."""
    user = User(
        email="other@test.com",
        password_hash=hash_password("testpass123"),
        full_name="Other Member",
        role=UserRole.MEMBER.value,
        is_active=True,
        email_verified=True,
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest_asyncio.fixture
async def stranger_member(test_db: AsyncSession) -> User:
    """A third member who is neither creator nor assignee of the test task."""
    user = User(
        email="stranger@test.com",
        password_hash=hash_password("testpass123"),
        full_name="Stranger Member",
        role=UserRole.MEMBER.value,
        is_active=True,
        email_verified=True,
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest_asyncio.fixture
async def stranger_token(test_client: AsyncClient, stranger_member: User) -> str:
    """JWT access token for the stranger member."""
    response = await test_client.post(
        "/api/v1/auth/login",
        json={"email": "stranger@test.com", "password": "testpass123"},
    )
    assert response.status_code == 200, f"Stranger login failed: {response.text}"
    return response.json()["access_token"]


# ---------------------------------------------------------------------------
# 1. Policy table: minimal grant (write on task only)
# ---------------------------------------------------------------------------

class TestMemberTaskPolicy:
    """Lock in the minimal Member grant: write on task, nothing else."""

    def test_member_has_write_on_task(self):
        """Member must be allowed to WRITE (create) tasks."""
        member_policy = _GLOBAL_ROLE_POLICIES[GlobalRole.MEMBER.value]
        task_actions = member_policy.get(ResourceType.TASK.value, set())
        assert Action.WRITE.value in task_actions

    def test_member_task_grant_is_write_only(self):
        """Member must NOT have read/update/delete on task -- only write.

        Update/delete are intentionally excluded so Members cannot edit or
        delete shared task labels, which are gated by the generic task resource.
        """
        member_policy = _GLOBAL_ROLE_POLICIES[GlobalRole.MEMBER.value]
        task_actions = member_policy.get(ResourceType.TASK.value, set())
        assert Action.READ.value not in task_actions
        assert Action.UPDATE.value not in task_actions
        assert Action.DELETE.value not in task_actions
        assert task_actions == {Action.WRITE.value}

    def test_member_has_no_permissions_on_other_resources(self):
        """Every resource other than task stays at an empty permission set."""
        member_policy = _GLOBAL_ROLE_POLICIES[GlobalRole.MEMBER.value]
        for resource_type in ResourceType:
            if resource_type == ResourceType.TASK:
                continue
            actions = member_policy.get(resource_type.value, set())
            assert actions == set(), (
                f"Member unexpectedly has {actions} on {resource_type.value}"
            )


# ---------------------------------------------------------------------------
# 2. Effective permissions through the engine / provider
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestMemberEffectivePermissions:
    """Verify the grant flows through get_user_permissions / has_permission."""

    async def test_member_effective_permissions_include_task_write_only(
        self, test_db: AsyncSession, member_user: User
    ):
        """A Member's aggregated permissions include write-on-task and exclude
        read/update/delete on task and write on other resources."""
        provider = SQLAlchemyPermissionProvider(test_db)
        permissions = await provider.get_user_permissions(member_user.id)

        task_actions = {
            permission["action"]
            for permission in permissions
            if permission["resource_type"] == ResourceType.TASK.value
        }
        assert task_actions == {Action.WRITE.value}

        # No write permission on any non-task resource.
        non_task_writes = [
            permission
            for permission in permissions
            if permission["resource_type"] != ResourceType.TASK.value
            and permission["action"] == Action.WRITE.value
        ]
        assert non_task_writes == []

    async def test_member_has_permission_write_task_true(
        self, test_db: AsyncSession, member_user: User
    ):
        provider = SQLAlchemyPermissionProvider(test_db)
        assert await provider.has_permission(
            member_user.id, Action.WRITE.value, ResourceType.TASK.value
        )

    async def test_member_has_permission_update_task_false(
        self, test_db: AsyncSession, member_user: User
    ):
        provider = SQLAlchemyPermissionProvider(test_db)
        assert not await provider.has_permission(
            member_user.id, Action.UPDATE.value, ResourceType.TASK.value
        )


# ---------------------------------------------------------------------------
# 3. End-to-end API behavior
# ---------------------------------------------------------------------------

@pytest.mark.api
@pytest.mark.asyncio
class TestMemberTaskCreationAPI:
    """A Member can create a task for another user via the API."""

    async def test_member_creates_task_for_other_user(
        self,
        test_client: AsyncClient,
        member_token: str,
        member_user: User,
        other_member: User,
    ):
        """POST /api/v1/tasks/ as a Member, assigned to a DIFFERENT user."""
        response = await test_client.post(
            "/api/v1/tasks/",
            headers={"Authorization": f"Bearer {member_token}"},
            json={
                "title": "Task for someone else",
                "assigned_to_user_id": other_member.id,
            },
        )
        assert response.status_code in (200, 201), (
            f"Member task creation failed: {response.text}"
        )
        data = response.json()
        assert data["assigned_to_user_id"] == other_member.id
        assert data["assigned_to_user_id"] != member_user.id
        assert data["title"] == "Task for someone else"

    async def test_for_tasks_member_sees_other_users(
        self,
        test_client: AsyncClient,
        member_token: str,
        member_user: User,
        other_member: User,
    ):
        """GET /users/for-tasks as a Member returns more than just themselves."""
        response = await test_client.get(
            "/api/v1/users/for-tasks",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert response.status_code == 200, response.text
        users = response.json()
        returned_ids = {entry["id"] for entry in users}
        assert member_user.id in returned_ids
        assert other_member.id in returned_ids
        assert len(returned_ids) > 1


# ---------------------------------------------------------------------------
# 4. Creator stamping + attachment-on-create unblock
# ---------------------------------------------------------------------------

# Smallest valid PNG (1x1 transparent pixel), used for multipart upload tests.
_TINY_PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6360000002000100" "05000100" "0d0a2db40000000049454e44ae426082"
)


@pytest.mark.api
@pytest.mark.asyncio
class TestMemberAttachmentOnCreate:
    """A Member who creates a task for someone else can attach files to it."""

    async def _create_task_for_other(
        self, test_client: AsyncClient, member_token: str, other_member: User
    ) -> int:
        """Create a task as the member, assigned to a different user; return its id."""
        response = await test_client.post(
            "/api/v1/tasks/",
            headers={"Authorization": f"Bearer {member_token}"},
            json={
                "title": "Task with attachment",
                "assigned_to_user_id": other_member.id,
            },
        )
        assert response.status_code in (200, 201), response.text
        return response.json()["id"]

    async def test_created_by_user_id_is_stamped(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        member_token: str,
        member_user: User,
        other_member: User,
    ):
        """The persisted task records the Member as its creator."""
        task_id = await self._create_task_for_other(test_client, member_token, other_member)
        result = await test_db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one()
        assert task.created_by_user_id == member_user.id
        assert task.assigned_to_user_id == other_member.id

    async def test_creator_can_upload_attachment(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        member_token: str,
        member_user: User,
        other_member: User,
    ):
        """A Member can upload an attachment to a task they created for someone else."""
        task_id = await self._create_task_for_other(test_client, member_token, other_member)
        response = await test_client.post(
            f"/api/v1/tasks/{task_id}/attachments",
            headers={"Authorization": f"Bearer {member_token}"},
            files={"file": ("note.png", _TINY_PNG_BYTES, "image/png")},
        )
        assert response.status_code in (200, 201), (
            f"Creator attachment upload failed: {response.text}"
        )
        data = response.json()
        assert data["file_name"] == "note.png"
        assert data["id"] is not None

        # Verify persistence.
        result = await test_db.execute(
            select(TaskAttachment).where(TaskAttachment.task_id == task_id)
        )
        attachments = list(result.scalars().all())
        assert len(attachments) == 1
        assert attachments[0].file_name == "note.png"

    async def test_non_creator_non_assignee_member_gets_403(
        self,
        test_client: AsyncClient,
        member_token: str,
        stranger_token: str,
        other_member: User,
    ):
        """A Member who is neither creator nor assignee cannot attach files (403)."""
        task_id = await self._create_task_for_other(test_client, member_token, other_member)
        response = await test_client.post(
            f"/api/v1/tasks/{task_id}/attachments",
            headers={"Authorization": f"Bearer {stranger_token}"},
            files={"file": ("note.png", _TINY_PNG_BYTES, "image/png")},
        )
        assert response.status_code == 403, (
            f"Expected 403 for unrelated member, got {response.status_code}: {response.text}"
        )


# ---------------------------------------------------------------------------
# 5. Attachment extension policy (audio recordings allowed; junk rejected)
# ---------------------------------------------------------------------------

# Tiny dummy payload for an "audio" upload. The validation path keys off the
# file extension, not the byte content, so any small blob exercises it.
_TINY_AUDIO_BYTES = b"\x1a\x45\xdf\xa3recording-bytes"


@pytest.mark.api
@pytest.mark.asyncio
class TestAttachmentExtensionPolicy:
    """Audio recordings (e.g. `.webm`) are accepted; unknown types raise 400.

    Both the task-attachment and chat-attachment endpoints share
    ``_save_upload_file`` / ``ALLOWED_ATTACHMENT_EXTENSIONS``, so validating one
    endpoint validates the shared policy.
    """

    async def _create_task_for_other(
        self, test_client: AsyncClient, member_token: str, other_member: User
    ) -> int:
        response = await test_client.post(
            "/api/v1/tasks/",
            headers={"Authorization": f"Bearer {member_token}"},
            json={
                "title": "Task with recording",
                "assigned_to_user_id": other_member.id,
            },
        )
        assert response.status_code in (200, 201), response.text
        return response.json()["id"]

    async def test_webm_audio_recording_is_accepted(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        member_token: str,
        other_member: User,
    ):
        """A `.webm` voice recording uploads successfully as a task attachment."""
        task_id = await self._create_task_for_other(test_client, member_token, other_member)
        response = await test_client.post(
            f"/api/v1/tasks/{task_id}/attachments",
            headers={"Authorization": f"Bearer {member_token}"},
            files={"file": ("recording-123.webm", _TINY_AUDIO_BYTES, "audio/webm")},
        )
        assert response.status_code in (200, 201), (
            f"Audio recording upload failed: {response.text}"
        )
        assert response.json()["file_name"] == "recording-123.webm"

        result = await test_db.execute(
            select(TaskAttachment).where(TaskAttachment.task_id == task_id)
        )
        attachments = list(result.scalars().all())
        assert len(attachments) == 1
        assert attachments[0].file_name == "recording-123.webm"

    async def test_disallowed_extension_is_rejected_with_400(
        self,
        test_client: AsyncClient,
        member_token: str,
        other_member: User,
    ):
        """An unsupported extension (e.g. `.exe`) is rejected with HTTP 400."""
        task_id = await self._create_task_for_other(test_client, member_token, other_member)
        response = await test_client.post(
            f"/api/v1/tasks/{task_id}/attachments",
            headers={"Authorization": f"Bearer {member_token}"},
            files={"file": ("malware.exe", b"MZ-not-allowed", "application/octet-stream")},
        )
        assert response.status_code == 400, (
            f"Expected 400 for disallowed extension, got {response.status_code}: {response.text}"
        )


# ---------------------------------------------------------------------------
# 6. S3 storage branch (when AWS_S3_BUCKET is configured)
# ---------------------------------------------------------------------------

_FAKE_S3_URL = (
    "https://bucket.s3.eu-central-1.amazonaws.com/task_attachments/deadbeef.png"
)


@pytest.mark.api
@pytest.mark.asyncio
class TestAttachmentS3Storage:
    """When ``AWS_S3_BUCKET`` is set, attachments are uploaded to S3 and the
    persisted ``file_path`` / returned ``file_url`` are the absolute S3 URL
    (not a ``/uploads/`` local path). No real AWS call is made — both the
    ``settings`` flag and ``S3Service`` are patched at the endpoint module.
    """

    async def _create_task_for_other(
        self, test_client: AsyncClient, member_token: str, other_member: User
    ) -> int:
        response = await test_client.post(
            "/api/v1/tasks/",
            headers={"Authorization": f"Bearer {member_token}"},
            json={
                "title": "Task with S3 attachment",
                "assigned_to_user_id": other_member.id,
            },
        )
        assert response.status_code in (200, 201), response.text
        return response.json()["id"]

    async def test_upload_uses_s3_and_stores_absolute_url(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        member_token: str,
        other_member: User,
        monkeypatch,
    ):
        """A PNG upload routes to S3 and the absolute URL is persisted/returned."""
        from unittest.mock import MagicMock, patch

        from backend.api.v1.endpoints import tasks as tasks_module

        # Force the S3 branch without requiring real AWS configuration.
        monkeypatch.setattr(
            tasks_module.settings, "AWS_S3_BUCKET", "bucket", raising=False
        )

        # Stub S3Service so constructing it needs no creds and upload_file
        # returns a known fake URL without any network call.
        fake_service = MagicMock()
        fake_service.upload_file.return_value = _FAKE_S3_URL

        task_id = await self._create_task_for_other(
            test_client, member_token, other_member
        )

        with patch.object(
            tasks_module, "S3Service", return_value=fake_service
        ) as service_cls:
            response = await test_client.post(
                f"/api/v1/tasks/{task_id}/attachments",
                headers={"Authorization": f"Bearer {member_token}"},
                files={"file": ("note.png", _TINY_PNG_BYTES, "image/png")},
            )

        assert response.status_code in (200, 201), (
            f"S3 attachment upload failed: {response.text}"
        )
        data = response.json()
        # Absolute S3 URL is returned as-is, NOT prefixed with /uploads/.
        assert data["file_url"] == _FAKE_S3_URL
        assert not data["file_url"].startswith("/uploads/")
        assert data["file_name"] == "note.png"

        # S3Service.upload_file was invoked with the task_attachments prefix.
        service_cls.assert_called()
        _, upload_kwargs = fake_service.upload_file.call_args
        assert upload_kwargs["prefix"] == "task_attachments"
        assert upload_kwargs["filename"] == "note.png"

        # The persisted file_path is the same absolute S3 URL.
        result = await test_db.execute(
            select(TaskAttachment).where(TaskAttachment.task_id == task_id)
        )
        attachments = list(result.scalars().all())
        assert len(attachments) == 1
        assert attachments[0].file_path == _FAKE_S3_URL
