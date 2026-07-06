"""Tests for the calendar/task bugfixes.

Covers two backend fixes:

* Bug 2a: An Admin filtering the calendar by a given user
  (``GET /api/v1/tasks/?assigned_to_user_id=<userX>``) must see tasks where
  userX is only an invited *participant* (the task being assigned to someone
  else) -- not just tasks userX owns.
* Bug 3: The Member *creator* of a task assigned to another user can archive it
  (``POST /api/v1/tasks/{id}/archive``), while an unrelated Member cannot (403).
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.task import Task, TaskParticipant
from backend.models.user import User, UserRole
from backend.repositories.task_repository import TaskRepository
from backend.core.security import hash_password


# ---------------------------------------------------------------------------
# Extra fixtures: a second and third member (assignee target + unrelated user).
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def other_member(test_db: AsyncSession) -> User:
    """A second active member, used as the assignee "other person"."""
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
    """A third member who is neither creator nor assignee nor participant."""
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
# Bug 2a: Admin "filter by user" must include participant-only tasks.
# ---------------------------------------------------------------------------

@pytest.mark.api
@pytest.mark.asyncio
class TestAdminFilterIncludesParticipantTasks:
    """Admin filtering by a user sees tasks that user merely attends."""

    async def test_repository_list_by_assigned_user_includes_participant(
        self,
        test_db: AsyncSession,
        member_user: User,
        other_member: User,
    ):
        """Repository-level: a task owned by other_member with member_user as a
        participant appears when filtering by member_user's id (assigned_to path)."""
        task = Task(
            title="Owned by other, member is participant",
            assigned_to_user_id=other_member.id,
            created_by_user_id=other_member.id,
        )
        test_db.add(task)
        await test_db.flush()
        test_db.add(TaskParticipant(task_id=task.id, user_id=member_user.id))
        await test_db.commit()

        repo = TaskRepository(test_db)
        tasks = await repo.list(assigned_to_user_id=member_user.id)
        task_ids = {t.id for t in tasks}
        assert task.id in task_ids, (
            "participant-only task missing from assigned_to_user_id filter"
        )

    async def test_admin_filter_returns_participant_task_via_api(
        self,
        test_client: AsyncClient,
        admin_token: str,
        member_token: str,
        member_user: User,
        other_member: User,
    ):
        """End-to-end: Admin listing tasks filtered by member_user sees a task
        assigned to other_member where member_user is only a participant."""
        # A member creates a task assigned to other_member, inviting member_user.
        create = await test_client.post(
            "/api/v1/tasks/",
            headers={"Authorization": f"Bearer {member_token}"},
            json={
                "title": "Participant visibility task",
                "assigned_to_user_id": other_member.id,
                "participant_ids": [member_user.id],
            },
        )
        assert create.status_code in (200, 201), create.text
        task_id = create.json()["id"]

        response = await test_client.get(
            f"/api/v1/tasks/?assigned_to_user_id={member_user.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200, response.text
        returned_ids = {task["id"] for task in response.json()}
        assert task_id in returned_ids, (
            "Admin filtering by participant did not return the participant task"
        )


# ---------------------------------------------------------------------------
# Bug 3: creator can archive; unrelated member cannot.
# ---------------------------------------------------------------------------

@pytest.mark.api
@pytest.mark.asyncio
class TestArchiveByCreator:
    """A Member who created a task for someone else can archive it (200);
    an unrelated Member is rejected (403)."""

    async def _create_task_for_other(
        self, test_client: AsyncClient, member_token: str, other_member: User
    ) -> int:
        response = await test_client.post(
            "/api/v1/tasks/",
            headers={"Authorization": f"Bearer {member_token}"},
            json={
                "title": "Task to archive",
                "assigned_to_user_id": other_member.id,
            },
        )
        assert response.status_code in (200, 201), response.text
        return response.json()["id"]

    async def test_creator_can_archive_task_assigned_to_other(
        self,
        test_client: AsyncClient,
        member_token: str,
        other_member: User,
    ):
        """The Member creator archives a task assigned to another user (200)."""
        task_id = await self._create_task_for_other(test_client, member_token, other_member)
        response = await test_client.post(
            f"/api/v1/tasks/{task_id}/archive",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert response.status_code == 200, (
            f"Creator archive failed: {response.text}"
        )
        assert response.json()["is_archived"] is True

    async def test_unrelated_member_cannot_archive(
        self,
        test_client: AsyncClient,
        member_token: str,
        stranger_token: str,
        other_member: User,
    ):
        """A Member who is neither creator nor assignee gets 403 archiving."""
        task_id = await self._create_task_for_other(test_client, member_token, other_member)
        response = await test_client.post(
            f"/api/v1/tasks/{task_id}/archive",
            headers={"Authorization": f"Bearer {stranger_token}"},
        )
        assert response.status_code == 403, (
            f"Expected 403 for unrelated member, got {response.status_code}: {response.text}"
        )
