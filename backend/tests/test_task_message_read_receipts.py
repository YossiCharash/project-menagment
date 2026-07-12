"""Tests for WhatsApp-style read receipts (✓ sent / ✓✓ read) on task messages.

Each task chat message carries ``read_by_all``: it is False until every OTHER
recipient (assignees + participants) has read the chat up to that message, and
True once they all have. Reading is recorded when a user lists the chat
(``GET /tasks/{id}/messages``). The author reading their own chat never flips
their own messages to "read".
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
    """Create and persist a second active member (a task participant)."""
    user = User(
        email="receipt-other@test.com",
        password_hash=hash_password("testpass123"),
        full_name="Receipt Other Member",
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
    """JWT access token for the second member."""
    response = await test_client.post(
        "/api/v1/auth/login",
        json={"email": "receipt-other@test.com", "password": "testpass123"},
    )
    assert response.status_code == 200, f"Other login failed: {response.text}"
    return response.json()["access_token"]


async def _create_task_with_participant(
    test_client: AsyncClient, member_token: str, member_user: User, other_member: User
) -> int:
    """Task owned by ``member_user`` with ``other_member`` invited; return its id."""
    response = await test_client.post(
        "/api/v1/tasks/",
        headers={"Authorization": f"Bearer {member_token}"},
        json={
            "title": "Task with read receipts",
            "assigned_to_user_id": member_user.id,
            "participant_ids": [other_member.id],
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


async def _post_message(test_client: AsyncClient, token: str, task_id: int, text: str) -> dict:
    """Post a chat message (multipart form) and return the created message JSON."""
    response = await test_client.post(
        f"/api/v1/tasks/{task_id}/messages",
        headers={"Authorization": f"Bearer {token}"},
        data={"message": text},
    )
    assert response.status_code in (200, 201), f"Posting message failed: {response.text}"
    return response.json()


async def _list_messages(test_client: AsyncClient, token: str, task_id: int) -> list[dict]:
    """List messages for a task as the given user (also records them as read)."""
    response = await test_client.get(
        f"/api/v1/tasks/{task_id}/messages",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.api
@pytest.mark.asyncio
class TestTaskMessageReadReceipts:
    """A message flips to read_by_all only after every other recipient reads it."""

    async def test_message_unread_until_other_recipient_reads(
        self,
        test_client: AsyncClient,
        member_token: str,
        member_user: User,
        other_token: str,
        other_member: User,
    ):
        task_id = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        created = await _post_message(test_client, member_token, task_id, "hello there")
        assert created["read_by_all"] is False

        # Author re-reading their own chat must NOT mark it read by others.
        author_view = await _list_messages(test_client, member_token, task_id)
        assert author_view[0]["read_by_all"] is False

        # The participant reads the chat, then the author sees the blue double-check.
        await _list_messages(test_client, other_token, task_id)
        after = await _list_messages(test_client, member_token, task_id)
        assert after[0]["read_by_all"] is True

    async def test_new_message_after_read_is_unread_again(
        self,
        test_client: AsyncClient,
        member_token: str,
        member_user: User,
        other_token: str,
        other_member: User,
    ):
        """A message sent after the recipient last read stays unread until they re-read."""
        task_id = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        await _post_message(test_client, member_token, task_id, "first")
        await _list_messages(test_client, other_token, task_id)  # participant reads

        await _post_message(test_client, member_token, task_id, "second")
        messages = await _list_messages(test_client, member_token, task_id)
        by_text = {m["message"]: m["read_by_all"] for m in messages}
        assert by_text["first"] is True
        assert by_text["second"] is False
