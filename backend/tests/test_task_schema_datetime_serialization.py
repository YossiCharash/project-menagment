"""Unit tests for UTC 'Z' datetime serialization on task output schemas.

Backend stores task timestamps as UTC (often naive). The output schemas must
emit every datetime as UTC ISO-8601 ending in 'Z' so the frontend converts to
local (Israel) time correctly and uniformly. See `to_utc_z` in
`backend/schemas/task.py`.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.schemas.task import (
    TaskChecklistItemOut,
    TaskMessageOut,
    TaskOut,
)


def _build_task_out(**overrides) -> TaskOut:
    """Build a minimal valid TaskOut, overriding specific fields."""
    base = dict(
        id=1,
        title="task",
        status="pending",
        event_type="task",
        assigned_to_user_id=1,
        unique_tag="tag-1",
        created_at=datetime(2026, 6, 25, 15, 52, 8),
        updated_at=datetime(2026, 6, 25, 15, 52, 8),
    )
    base.update(overrides)
    return TaskOut(**base)


def test_naive_datetime_serializes_to_z_without_shifting_digits():
    """A NAIVE datetime is treated as UTC: digits unchanged, 'Z' appended."""
    task = _build_task_out(
        assignee_acknowledged_at=datetime(2026, 6, 25, 15, 52, 8),
    )

    dumped = task.model_dump(mode="json")

    assert dumped["assignee_acknowledged_at"] == "2026-06-25T15:52:08Z"


def test_aware_non_utc_datetime_is_converted_to_utc_z():
    """A tz-aware +02:00 datetime is shifted to UTC and ends in 'Z'."""
    israel = timezone(timedelta(hours=2))
    task = _build_task_out(
        assignee_acknowledged_at=datetime(2026, 6, 25, 17, 52, 8, tzinfo=israel),
    )

    dumped = task.model_dump(mode="json")

    # 17:52 +02:00 == 15:52 UTC
    assert dumped["assignee_acknowledged_at"] == "2026-06-25T15:52:08Z"


def test_none_optional_datetime_serializes_to_null():
    """Optional datetime fields left as None must stay None/null."""
    task = _build_task_out(
        assignee_acknowledged_at=None,
        assignee_viewed_at=None,
        archived_at=None,
        completed_at=None,
    )

    dumped = task.model_dump(mode="json")

    assert dumped["assignee_acknowledged_at"] is None
    assert dumped["assignee_viewed_at"] is None
    assert dumped["archived_at"] is None
    assert dumped["completed_at"] is None


def test_audit_timestamp_fields_end_in_z():
    """Backend-generated audit timestamps on TaskOut are normalized to 'Z'."""
    moment = datetime(2026, 6, 25, 15, 52, 8)
    task = _build_task_out(
        assignee_acknowledged_at=moment,
        assignee_viewed_at=moment,
        archived_at=moment,
        completed_at=moment,
    )

    dumped = task.model_dump(mode="json")

    for field in (
        "created_at",
        "updated_at",
        "assignee_acknowledged_at",
        "assignee_viewed_at",
        "archived_at",
        "completed_at",
    ):
        assert dumped[field].endswith("Z"), field


def test_start_end_time_are_wall_clock_without_z():
    """start_time/end_time are naive local wall-clock: emitted WITHOUT 'Z'/offset.

    They must keep the exact digits the user scheduled so the frontend parses
    them as local time. Appending 'Z' would shift an all-day task's 00:00–23:59
    to 03:00–02:59 local and surface a bogus time range.
    """
    task = _build_task_out(
        start_time=datetime(2026, 6, 25, 0, 0, 0),
        end_time=datetime(2026, 6, 25, 23, 59, 59),
    )

    dumped = task.model_dump(mode="json")

    assert dumped["start_time"] == "2026-06-25T00:00:00"
    assert dumped["end_time"] == "2026-06-25T23:59:59"
    assert not dumped["start_time"].endswith("Z")
    assert not dumped["end_time"].endswith("Z")


def test_task_message_out_created_at_normalized_to_z():
    israel = timezone(timedelta(hours=2))
    message = TaskMessageOut(
        id=1,
        task_id=1,
        user_id=1,
        full_name="Alice",
        message="hello",
        created_at=datetime(2026, 6, 25, 17, 52, 8, tzinfo=israel),
    )

    dumped = message.model_dump(mode="json")

    assert dumped["created_at"] == "2026-06-25T15:52:08Z"


def test_task_checklist_item_out_datetimes_normalized_to_z():
    item = TaskChecklistItemOut(
        id=1,
        task_id=1,
        text="step",
        is_completed=False,
        sort_order=0,
        created_at=datetime(2026, 6, 25, 15, 52, 8),
        handled_at=datetime(2026, 6, 25, 15, 52, 8),
    )

    dumped = item.model_dump(mode="json")

    assert dumped["created_at"] == "2026-06-25T15:52:08Z"
    assert dumped["handled_at"] == "2026-06-25T15:52:08Z"


def test_task_checklist_item_out_handled_at_none_stays_none():
    item = TaskChecklistItemOut(
        id=1,
        task_id=1,
        text="step",
        is_completed=False,
        sort_order=0,
        created_at=datetime(2026, 6, 25, 15, 52, 8),
        handled_at=None,
    )

    dumped = item.model_dump(mode="json")

    assert dumped["handled_at"] is None
