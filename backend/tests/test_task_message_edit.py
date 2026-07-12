"""Tests for WhatsApp-style editing of a task chat message.

Only the original author may edit a message (``PATCH /tasks/{id}/messages/{mid}``);
the new text must be non-empty, and a successful edit stamps ``edited_at`` so the
UI can show a "נערך" label.
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
    """A second member who is a participant but NOT the message author."""
    user = User(
        email="edit-other@test.com",
        password_hash=hash_password("testpass123"),
        full_name="Edit Other Member",
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
        json={"email": "edit-other@test.com", "password": "testpass123"},
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
            "title": "Task for editing",
            "assigned_to_user_id": member_user.id,
            "participant_ids": [other_member.id],
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


async def _post_message(test_client: AsyncClient, token: str, task_id: int, text: str) -> dict:
    response = await test_client.post(
        f"/api/v1/tasks/{task_id}/messages",
        headers={"Authorization": f"Bearer {token}"},
        data={"message": text},
    )
    assert response.status_code in (200, 201), response.text
    return response.json()


@pytest.mark.api
@pytest.mark.asyncio
class TestTaskMessageEdit:
    async def test_author_can_edit_message(
        self,
        test_client: AsyncClient,
        member_token: str,
        member_user: User,
        other_member: User,
    ):
        task_id = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        created = await _post_message(test_client, member_token, task_id, "original text")
        assert created["edited_at"] is None

        response = await test_client.patch(
            f"/api/v1/tasks/{task_id}/messages/{created['id']}",
            headers={"Authorization": f"Bearer {member_token}"},
            json={"message": "edited text"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["message"] == "edited text"
        assert body["edited_at"] is not None

    async def test_non_author_cannot_edit(
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
        created = await _post_message(test_client, member_token, task_id, "author only")

        # other_member is a participant (can access the task) but is not the author.
        response = await test_client.patch(
            f"/api/v1/tasks/{task_id}/messages/{created['id']}",
            headers={"Authorization": f"Bearer {other_token}"},
            json={"message": "hijacked"},
        )
        assert response.status_code == 403, response.text

    async def test_empty_edit_is_rejected(
        self,
        test_client: AsyncClient,
        member_token: str,
        member_user: User,
        other_member: User,
    ):
        task_id = await _create_task_with_participant(
            test_client, member_token, member_user, other_member
        )
        created = await _post_message(test_client, member_token, task_id, "keep me")

        response = await test_client.patch(
            f"/api/v1/tasks/{task_id}/messages/{created['id']}",
            headers={"Authorization": f"Bearer {member_token}"},
            json={"message": "   "},
        )
        assert response.status_code == 400, response.text
