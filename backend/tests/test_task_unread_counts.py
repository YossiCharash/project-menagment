"""Tests for the unread chat-message COUNT surfaced on tasks.

Each task card carries ``unread_messages_count`` (drives the numbered red badge)
and ``has_unread_messages`` (count > 0). The count rises with each message a
DIFFERENT user posts and resets to zero once the current user opens the task
(``GET /tasks/{id}``). ``GET /tasks/unread-summary`` sums the count across every
task the user is tied to (for the global nav badge).
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.user import User, UserRole
from backend.core.security import hash_password


@pytest_asyncio.fixture
async def other_member(test_db: AsyncSession) -> User:
    """A second active member who participates in the task and posts messages."""
    user = User(
        email="unread-count-other@test.com",
        password_hash=hash_password("testpass123"),
        full_name="Unread Count Other",
        role=UserRole.MEMBER.value,
        is_active=True,
        email_verified=True,
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest_asyncio.fixture
async def other_token(test_client: AsyncClient, other_member: User) -> str:
    response = await test_client.post(
        "/api/v1/auth/login",
        json={"email": "unread-count-other@test.com", "password": "testpass123"},
    )
    assert response.status_code == 200, f"Other login failed: {response.text}"
    return response.json()["access_token"]


async def _create_task_with_participant(
    test_client: AsyncClient, member_token: str, member_user: User, other_member: User
) -> int:
    response = await test_client.post(
        "/api/v1/tasks/",
        headers={"Authorization": f"Bearer {member_token}"},
        json={
            "title": "Task with unread counts",
            "assigned_to_user_id": member_user.id,
            "participant_ids": [other_member.id],
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


async def _post_message(test_client: AsyncClient, token: str, task_id: int, text: str) -> None:
    response = await test_client.post(
        f"/api/v1/tasks/{task_id}/messages",
        headers={"Authorization": f"Bearer {token}"},
        data={"message": text},
    )
    assert response.status_code in (200, 201), response.text


async def _task_count(test_client: AsyncClient, token: str, task_id: int) -> int:
    response = await test_client.get(
        "/api/v1/tasks/", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, response.text
    match = next((t for t in response.json() if t["id"] == task_id), None)
    assert match is not None, f"Task {task_id} not in list"
    return match["unread_messages_count"]


async def _summary_total(test_client: AsyncClient, token: str) -> int:
    response = await test_client.get(
        "/api/v1/tasks/unread-summary", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, response.text
    return response.json()["total_unread"]


@pytest.mark.api
@pytest.mark.asyncio
class TestTaskUnreadCounts:
    async def test_count_rises_with_others_messages(
        self, test_client, member_token, member_user, other_token, other_member
    ):
        task_id = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        assert await _task_count(test_client, member_token, task_id) == 0

        await _post_message(test_client, other_token, task_id, "one")
        await _post_message(test_client, other_token, task_id, "two")

        assert await _task_count(test_client, member_token, task_id) == 2

    async def test_own_messages_are_not_counted(
        self, test_client, member_token, member_user, other_member
    ):
        task_id = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        await _post_message(test_client, member_token, task_id, "mine 1")
        await _post_message(test_client, member_token, task_id, "mine 2")

        assert await _task_count(test_client, member_token, task_id) == 0

    async def test_opening_task_resets_count(
        self, test_client, member_token, member_user, other_token, other_member
    ):
        task_id = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        await _post_message(test_client, other_token, task_id, "unread")
        assert await _task_count(test_client, member_token, task_id) == 1

        opened = await test_client.get(
            f"/api/v1/tasks/{task_id}", headers={"Authorization": f"Bearer {member_token}"}
        )
        assert opened.status_code == 200, opened.text
        assert opened.json()["unread_messages_count"] == 0
        assert await _task_count(test_client, member_token, task_id) == 0

    async def test_unread_summary_aggregates_across_tasks(
        self, test_client, member_token, member_user, other_token, other_member
    ):
        assert await _summary_total(test_client, member_token) == 0

        first = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        second = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        await _post_message(test_client, other_token, first, "a")
        await _post_message(test_client, other_token, first, "b")
        await _post_message(test_client, other_token, second, "c")

        assert await _summary_total(test_client, member_token) == 3

        # The author of the replies has nothing unread of their own.
        assert await _summary_total(test_client, other_token) == 0
