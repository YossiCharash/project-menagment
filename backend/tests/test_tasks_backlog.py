"""Tests for the broadened backlog definition in ``TaskRepository.list_backlog``.

The backlog now includes a task when:
- it has no date (``start_time IS NULL``) AND its status is ``pending``, OR
- it was explicitly flagged ``is_backlog == True``,

while archived and completed tasks are always excluded.

These tests write ``Task`` rows directly through the shared ``test_db`` session
(one session per test is shared with ``test_client`` requests) and then hit
``GET /api/v1/tasks/backlog`` as an Admin, so every task is visible regardless of
the per-user visibility rules. Membership is asserted by task title.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.task import Task, TaskStatus
from backend.models.user import User


async def _returned_titles(test_client: AsyncClient, admin_token: str) -> set[str]:
    """Call the backlog endpoint as Admin and return the set of task titles."""
    response = await test_client.get(
        "/api/v1/tasks/backlog",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200, response.text
    return {task["title"] for task in response.json()}


@pytest.mark.api
@pytest.mark.asyncio
class TestBacklogDefinition:
    """Lock in the broadened backlog membership rules."""

    async def test_no_date_pending_unflagged_task_is_returned(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        admin_token: str,
        member_user: User,
    ):
        """Regression: a no-date, pending, un-flagged task now appears in the backlog."""
        test_db.add(
            Task(
                title="backlog-nodate-pending-unflagged",
                start_time=None,
                status=TaskStatus.PENDING,
                is_backlog=False,
                is_archived=False,
                assigned_to_user_id=member_user.id,
            )
        )
        await test_db.commit()

        titles = await _returned_titles(test_client, admin_token)
        assert "backlog-nodate-pending-unflagged" in titles

    async def test_no_date_in_progress_task_is_not_returned(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        admin_token: str,
        member_user: User,
    ):
        """A no-date task that is in progress (already started) is excluded."""
        test_db.add(
            Task(
                title="backlog-nodate-inprogress",
                start_time=None,
                status=TaskStatus.IN_PROGRESS,
                is_backlog=False,
                is_archived=False,
                assigned_to_user_id=member_user.id,
            )
        )
        await test_db.commit()

        titles = await _returned_titles(test_client, admin_token)
        assert "backlog-nodate-inprogress" not in titles

    async def test_no_date_completed_task_is_not_returned(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        admin_token: str,
        member_user: User,
    ):
        """A no-date completed task is excluded (completed tasks never show)."""
        test_db.add(
            Task(
                title="backlog-nodate-completed",
                start_time=None,
                status=TaskStatus.COMPLETED,
                is_backlog=False,
                is_archived=False,
                assigned_to_user_id=member_user.id,
            )
        )
        await test_db.commit()

        titles = await _returned_titles(test_client, admin_token)
        assert "backlog-nodate-completed" not in titles

    async def test_explicitly_flagged_task_with_start_time_is_returned(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        admin_token: str,
        member_user: User,
    ):
        """An explicitly flagged task is returned even if it has a start_time."""
        from datetime import datetime

        test_db.add(
            Task(
                title="backlog-flagged-with-date",
                start_time=datetime(2026, 1, 1, 9, 0, 0),
                status=TaskStatus.PENDING,
                is_backlog=True,
                is_archived=False,
                assigned_to_user_id=member_user.id,
            )
        )
        await test_db.commit()

        titles = await _returned_titles(test_client, admin_token)
        assert "backlog-flagged-with-date" in titles

    async def test_dated_pending_unflagged_task_is_not_returned(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        admin_token: str,
        member_user: User,
    ):
        """A dated, pending, un-flagged task is NOT backlog (it is scheduled)."""
        from datetime import datetime

        test_db.add(
            Task(
                title="backlog-dated-pending-unflagged",
                start_time=datetime(2026, 2, 1, 10, 0, 0),
                status=TaskStatus.PENDING,
                is_backlog=False,
                is_archived=False,
                assigned_to_user_id=member_user.id,
            )
        )
        await test_db.commit()

        titles = await _returned_titles(test_client, admin_token)
        assert "backlog-dated-pending-unflagged" not in titles

    async def test_archived_no_date_pending_task_is_not_returned(
        self,
        test_client: AsyncClient,
        test_db: AsyncSession,
        admin_token: str,
        member_user: User,
    ):
        """An archived no-date pending task is excluded (archived never shows)."""
        test_db.add(
            Task(
                title="backlog-archived-nodate-pending",
                start_time=None,
                status=TaskStatus.PENDING,
                is_backlog=False,
                is_archived=True,
                assigned_to_user_id=member_user.id,
            )
        )
        await test_db.commit()

        titles = await _returned_titles(test_client, admin_token)
        assert "backlog-archived-nodate-pending" not in titles
