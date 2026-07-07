"""Tests for the WhatsApp-style unread-reply indicator on tasks.

When someone posts a chat message (reply) on a task, every OTHER recipient
(assignee + participants) gets an unread ``task_message`` notification. The task
list endpoints surface that as ``TaskOut.has_unread_messages`` (a red dot in the
UI), and opening the task (``GET /tasks/{id}``) marks those notifications read so
the dot clears.

These tests exercise the end-to-end signal via the API plus the two new
``NotificationRepository`` helpers directly.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.user import User, UserRole
from backend.models.user_notification import NotificationType
from backend.core.security import hash_password
from backend.repositories.notification_repository import NotificationRepository


# ---------------------------------------------------------------------------
# Fixtures: a second member used as a task participant / reply author
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def other_member(test_db: AsyncSession) -> User:
    """Create and persist a second active member (the reply author)."""
    user = User(
        email="unread-other@test.com",
        password_hash=hash_password("testpass123"),
        full_name="Unread Other Member",
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
    """JWT access token for the reply-author member."""
    response = await test_client.post(
        "/api/v1/auth/login",
        json={"email": "unread-other@test.com", "password": "testpass123"},
    )
    assert response.status_code == 200, f"Other login failed: {response.text}"
    return response.json()["access_token"]


async def _create_task_with_participant(
    test_client: AsyncClient,
    member_token: str,
    member_user: User,
    other_member: User,
) -> int:
    """Task owned by ``member_user`` with ``other_member`` invited; return its id."""
    response = await test_client.post(
        "/api/v1/tasks/",
        headers={"Authorization": f"Bearer {member_token}"},
        json={
            "title": "Task with replies",
            "assigned_to_user_id": member_user.id,
            "participant_ids": [other_member.id],
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


async def _post_message(
    test_client: AsyncClient, token: str, task_id: int, text: str
) -> dict:
    """Post a chat message (multipart form) and return the created message JSON."""
    response = await test_client.post(
        f"/api/v1/tasks/{task_id}/messages",
        headers={"Authorization": f"Bearer {token}"},
        data={"message": text},
    )
    assert response.status_code in (200, 201), f"Posting message failed: {response.text}"
    return response.json()


async def _get_task_flag(test_client: AsyncClient, token: str, task_id: int) -> bool:
    """Return ``has_unread_messages`` for a task from the list endpoint."""
    response = await test_client.get(
        "/api/v1/tasks/", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, response.text
    match = next((task for task in response.json() if task["id"] == task_id), None)
    assert match is not None, f"Task {task_id} not present in list for this user"
    return match["has_unread_messages"]


@pytest.mark.api
@pytest.mark.asyncio
class TestTaskUnreadMessagesAPI:
    """End-to-end: a reply raises the recipient's dot; opening the task clears it."""

    async def test_reply_sets_unread_flag_for_recipient(
        self,
        test_client: AsyncClient,
        member_token: str,
        member_user: User,
        other_token: str,
        other_member: User,
    ):
        """After a participant replies, the assignee's task shows has_unread_messages."""
        task_id = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        assert await _get_task_flag(test_client, member_token, task_id) is False

        await _post_message(test_client, other_token, task_id, "reply from participant")

        assert await _get_task_flag(test_client, member_token, task_id) is True

    async def test_opening_task_clears_unread_flag(
        self,
        test_client: AsyncClient,
        member_token: str,
        member_user: User,
        other_token: str,
        other_member: User,
    ):
        """GET /tasks/{id} (reading the chat) clears the recipient's unread dot."""
        task_id = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        await _post_message(test_client, other_token, task_id, "please review")
        assert await _get_task_flag(test_client, member_token, task_id) is True

        opened = await test_client.get(
            f"/api/v1/tasks/{task_id}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert opened.status_code == 200, opened.text
        assert opened.json()["has_unread_messages"] is False

        assert await _get_task_flag(test_client, member_token, task_id) is False

    async def test_reply_author_has_no_unread_flag(
        self,
        test_client: AsyncClient,
        member_token: str,
        member_user: User,
        other_token: str,
        other_member: User,
    ):
        """The author of a reply never sees their own message as unread."""
        task_id = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        await _post_message(test_client, other_token, task_id, "authored by other")

        # The author is a participant, so the task appears in their list too.
        assert await _get_task_flag(test_client, other_token, task_id) is False


@pytest.mark.asyncio
class TestNotificationRepositoryUnreadHelpers:
    """Unit coverage for the two new NotificationRepository methods."""

    async def test_get_task_ids_with_unread_message_empty_input(
        self, test_db: AsyncSession
    ):
        """An empty task-id list short-circuits to an empty set (no query)."""
        repo = NotificationRepository(test_db)
        assert await repo.get_task_ids_with_unread_message(1, []) == set()

    async def test_helpers_reflect_and_clear_unread_state(
        self,
        test_client: AsyncClient,
        member_token: str,
        member_user: User,
        other_token: str,
        other_member: User,
        test_db: AsyncSession,
    ):
        """get_task_ids_with_unread_message flags the task; mark_task_messages_read clears it."""
        task_id = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        await _post_message(test_client, other_token, task_id, "ping")

        repo = NotificationRepository(test_db)
        unread = await repo.get_task_ids_with_unread_message(member_user.id, [task_id])
        assert task_id in unread

        await repo.mark_task_messages_read(member_user.id, task_id)
        await test_db.commit()

        cleared = await repo.get_task_ids_with_unread_message(member_user.id, [task_id])
        assert task_id not in cleared

        # The author never had an unread notification of this type for the task.
        author_unread = await repo.get_task_ids_with_unread_message(
            other_member.id, [task_id]
        )
        assert task_id not in author_unread
