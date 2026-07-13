"""Tests for assigning a single task to MULTIPLE users (co-owner assignees).

Covers the additive multi-assignee model:
- ``tasks.assigned_to_user_id`` stays the PRIMARY assignee (first of the set).
- ``task_assignees`` carries the full co-owner set.
- The API accepts ``assigned_to_user_ids`` (union'd with the primary), every
  assignee can see the task, reassignment is admin-gated, ``TaskOut`` exposes the
  full set, and every assignee receives an assignment notification.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.task import Task
from backend.models.user import User, UserRole
from backend.models.user_notification import UserNotification, NotificationType
from backend.core.security import hash_password


# ---------------------------------------------------------------------------
# Fixtures: two additional active members used as co-owner assignees
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def assignee_a(test_db: AsyncSession) -> User:
    """First co-owner assignee (also used as the primary)."""
    user = User(
        email="assignee_a@test.com",
        password_hash=hash_password("testpass123"),
        full_name="Assignee A",
        role=UserRole.MEMBER.value,
        is_active=True,
        email_verified=True,
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest_asyncio.fixture
async def assignee_b(test_db: AsyncSession) -> User:
    """Second co-owner assignee."""
    user = User(
        email="assignee_b@test.com",
        password_hash=hash_password("testpass123"),
        full_name="Assignee B",
        role=UserRole.MEMBER.value,
        is_active=True,
        email_verified=True,
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


async def _login_token(test_client: AsyncClient, email: str) -> str:
    response = await test_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "testpass123"},
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.text}"
    return response.json()["access_token"]


@pytest_asyncio.fixture
async def assignee_a_token(test_client: AsyncClient, assignee_a: User) -> str:
    return await _login_token(test_client, "assignee_a@test.com")


@pytest_asyncio.fixture
async def assignee_b_token(test_client: AsyncClient, assignee_b: User) -> str:
    return await _login_token(test_client, "assignee_b@test.com")


async def _create_multi_assignee_task(
    test_client: AsyncClient,
    admin_token: str,
    primary: User,
    others: list[User],
    title: str = "Shared task",
) -> dict:
    """Create a task (as admin) assigned to ``primary`` plus ``others``.

    Sends the full assignee id list (including the primary) via
    ``assigned_to_user_ids`` — mirroring the multi-select UI — and returns the
    created ``TaskOut`` JSON.
    """
    all_ids = [primary.id, *[user.id for user in others]]
    response = await test_client.post(
        "/api/v1/tasks/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "title": title,
            "assigned_to_user_id": primary.id,
            "assigned_to_user_ids": all_ids,
        },
    )
    assert response.status_code in (200, 201), f"Create failed: {response.text}"
    return response.json()


@pytest.mark.api
@pytest.mark.asyncio
class TestMultiAssigneeCreation:
    """Creating a task with several assignees persists the full set."""

    async def test_create_persists_all_assignees_primary_first(
        self,
        test_client: AsyncClient,
        admin_token: str,
        assignee_a: User,
        assignee_b: User,
    ):
        data = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_b]
        )
        # Primary stays the first id; full set carries both, in order.
        assert data["assigned_to_user_id"] == assignee_a.id
        assert data["assigned_to_user_ids"] == [assignee_a.id, assignee_b.id]
        returned_ids = [entry["user_id"] for entry in data["assignees"]]
        assert returned_ids == [assignee_a.id, assignee_b.id]

    async def test_taskout_assignees_carry_display_fields(
        self,
        test_client: AsyncClient,
        admin_token: str,
        assignee_a: User,
        assignee_b: User,
    ):
        data = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_b]
        )
        by_id = {entry["user_id"]: entry for entry in data["assignees"]}
        assert by_id[assignee_a.id]["full_name"] == "Assignee A"
        assert by_id[assignee_b.id]["full_name"] == "Assignee B"
        # A color is always resolved (explicit calendar_color or palette fallback).
        assert by_id[assignee_a.id]["color"]
        assert by_id[assignee_b.id]["color"]

    async def test_duplicate_ids_are_deduplicated(
        self,
        test_client: AsyncClient,
        admin_token: str,
        assignee_a: User,
        assignee_b: User,
    ):
        """Repeating the primary inside assigned_to_user_ids yields no duplicates."""
        data = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_a, assignee_b, assignee_b]
        )
        assert data["assigned_to_user_ids"] == [assignee_a.id, assignee_b.id]

    async def test_inactive_assignee_is_rejected(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        admin_token: str,
        assignee_a: User,
        assignee_b: User,
    ):
        """A non-existent id in the set fails the whole create with 404."""
        missing_id = assignee_b.id + 9999
        response = await test_client.post(
            "/api/v1/tasks/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "title": "Bad assignee",
                "assigned_to_user_id": assignee_a.id,
                "assigned_to_user_ids": [assignee_a.id, missing_id],
            },
        )
        assert response.status_code == 404, response.text


@pytest.mark.api
@pytest.mark.asyncio
class TestMultiAssigneeVisibility:
    """Every co-owner (not just the primary) sees the task in their list."""

    async def test_secondary_assignee_sees_task_in_list(
        self,
        test_client: AsyncClient,
        admin_token: str,
        assignee_a: User,
        assignee_b: User,
        assignee_b_token: str,
    ):
        created = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_b], title="Visible to B"
        )
        response = await test_client.get(
            "/api/v1/tasks/",
            headers={"Authorization": f"Bearer {assignee_b_token}"},
        )
        assert response.status_code == 200, response.text
        visible_ids = {task["id"] for task in response.json()}
        assert created["id"] in visible_ids

    async def test_secondary_assignee_can_open_task(
        self,
        test_client: AsyncClient,
        admin_token: str,
        assignee_a: User,
        assignee_b: User,
        assignee_b_token: str,
    ):
        created = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_b]
        )
        response = await test_client.get(
            f"/api/v1/tasks/{created['id']}",
            headers={"Authorization": f"Bearer {assignee_b_token}"},
        )
        assert response.status_code == 200, response.text


@pytest.mark.api
@pytest.mark.asyncio
class TestMultiAssigneeReassignment:
    """Reassignment replaces the whole set and is admin-gated."""

    async def test_admin_replaces_assignee_set(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        admin_token: str,
        assignee_a: User,
        assignee_b: User,
        member_user: User,
    ):
        created = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_b]
        )
        response = await test_client.put(
            f"/api/v1/tasks/{created['id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"assigned_to_user_ids": [assignee_b.id, member_user.id]},
        )
        assert response.status_code == 200, response.text
        data = response.json()
        # New primary is the first of the new set; the set is fully replaced.
        assert data["assigned_to_user_id"] == assignee_b.id
        assert data["assigned_to_user_ids"] == [assignee_b.id, member_user.id]

        # Join-table membership reflects the replacement (A dropped).
        task = (
            await test_db.execute(select(Task).where(Task.id == created["id"]))
        ).scalar_one()
        persisted_ids = {user.id for user in task.assignees}
        assert persisted_ids == {assignee_b.id, member_user.id}

    async def test_non_admin_cannot_reassign(
        self,
        test_client: AsyncClient,
        admin_token: str,
        assignee_a: User,
        assignee_a_token: str,
        assignee_b: User,
    ):
        """A member (even an assignee) is blocked from reassigning the set."""
        created = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_b]
        )
        response = await test_client.put(
            f"/api/v1/tasks/{created['id']}",
            headers={"Authorization": f"Bearer {assignee_a_token}"},
            json={"assigned_to_user_ids": [assignee_a.id]},
        )
        assert response.status_code == 403, response.text


@pytest.mark.api
@pytest.mark.asyncio
class TestAssigneeCanEdit:
    """Any assignee (primary or co-owner) — not just an admin — may edit a task."""

    async def test_primary_assignee_can_edit_title(
        self,
        test_client: AsyncClient,
        admin_token: str,
        assignee_a: User,
        assignee_a_token: str,
        assignee_b: User,
    ):
        """The primary assignee (a Member) can edit the task's fields."""
        created = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_b]
        )
        response = await test_client.put(
            f"/api/v1/tasks/{created['id']}",
            headers={"Authorization": f"Bearer {assignee_a_token}"},
            json={"title": "Edited by primary assignee"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["title"] == "Edited by primary assignee"

    async def test_co_assignee_can_edit_status(
        self,
        test_client: AsyncClient,
        admin_token: str,
        assignee_a: User,
        assignee_b: User,
        assignee_b_token: str,
    ):
        """A co-owner assignee (not the primary) can also edit the task."""
        created = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_b]
        )
        response = await test_client.put(
            f"/api/v1/tasks/{created['id']}",
            headers={"Authorization": f"Bearer {assignee_b_token}"},
            json={"status": "in_progress"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "in_progress"

    async def test_assignee_edit_may_resend_unchanged_assignee_set(
        self,
        test_client: AsyncClient,
        admin_token: str,
        assignee_a: User,
        assignee_a_token: str,
        assignee_b: User,
    ):
        """The edit form re-sends the current assignees; that must not 403.

        A genuine reassignment is blocked (see ``test_non_admin_cannot_reassign``),
        but re-sending the SAME set (as the edit modal always does) is accepted and
        the assignee set is left unchanged.
        """
        created = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_b]
        )
        response = await test_client.put(
            f"/api/v1/tasks/{created['id']}",
            headers={"Authorization": f"Bearer {assignee_a_token}"},
            json={
                "title": "Edited, assignees untouched",
                "assigned_to_user_id": assignee_a.id,
                "assigned_to_user_ids": [assignee_a.id, assignee_b.id],
            },
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["title"] == "Edited, assignees untouched"
        assert set(data["assigned_to_user_ids"]) == {assignee_a.id, assignee_b.id}

    async def test_non_assignee_member_cannot_edit(
        self,
        test_client: AsyncClient,
        admin_token: str,
        assignee_a: User,
        assignee_b: User,
        member_user: User,
        member_token: str,
    ):
        """A Member who is neither an assignee nor an admin cannot edit (403)."""
        created = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_b]
        )
        response = await test_client.put(
            f"/api/v1/tasks/{created['id']}",
            headers={"Authorization": f"Bearer {member_token}"},
            json={"title": "Should be rejected"},
        )
        assert response.status_code == 403, response.text


@pytest.mark.api
@pytest.mark.asyncio
class TestMultiAssigneeNotifications:
    """Every co-owner assignee receives an assignment notification."""

    async def test_all_assignees_notified_on_create(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        admin_token: str,
        assignee_a: User,
        assignee_b: User,
    ):
        created = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_b]
        )
        rows = (
            await test_db.execute(
                select(UserNotification).where(
                    UserNotification.task_id == created["id"],
                    UserNotification.type == NotificationType.TASK_ASSIGNMENT,
                )
            )
        ).scalars().all()
        notified_ids = {row.user_id for row in rows}
        assert assignee_a.id in notified_ids
        assert assignee_b.id in notified_ids


@pytest.mark.api
@pytest.mark.asyncio
class TestMultiAssigneeOrderingAndValidation:
    """Regression coverage for primary-first ordering and empty-set rejection."""

    async def test_primary_is_first_even_when_it_has_a_higher_id(
        self,
        test_client: AsyncClient,
        admin_token: str,
        assignee_a: User,
        assignee_b: User,
    ):
        """`assigned_to_user_ids[0]` must be the primary regardless of join order.

        The `task_assignees` join has no inherent order, so a naive read can come
        back id-sorted. Make the HIGHER-id user the primary to prove the API pins
        it first (the frontend treats index 0 as the primary).
        """
        primary, extra = (
            (assignee_b, assignee_a) if assignee_b.id > assignee_a.id else (assignee_a, assignee_b)
        )
        data = await _create_multi_assignee_task(test_client, admin_token, primary, [extra])
        assert data["assigned_to_user_id"] == primary.id
        assert data["assigned_to_user_ids"][0] == primary.id
        assert [entry["user_id"] for entry in data["assignees"]][0] == primary.id

    async def test_update_with_empty_assignee_set_is_rejected(
        self,
        test_client: AsyncClient,
        admin_token: str,
        assignee_a: User,
        assignee_b: User,
    ):
        """An admin PUT with an empty `assigned_to_user_ids` returns 400, not 500."""
        created = await _create_multi_assignee_task(
            test_client, admin_token, assignee_a, [assignee_b]
        )
        response = await test_client.put(
            f"/api/v1/tasks/{created['id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"assigned_to_user_ids": []},
        )
        assert response.status_code == 400, response.text
