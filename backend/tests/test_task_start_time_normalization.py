"""Unit tests for task start_time/end_time write-side normalization.

``start_time``/``end_time`` are stored as naive Israel local wall-clock (see the
serializer note in ``backend/schemas/task.py``) and read back that way — the
reception grid's ``count_open_by_apartment_ids`` compares them against
Israel-local now. A tz-aware value from an API client must therefore be
converted to Israel local, NOT UTC, so every stored value uses one convention.
"""
from __future__ import annotations

from datetime import datetime, timezone

from backend.api.v1.endpoints.tasks import _to_naive_israel_local, _to_naive_utc
from backend.repositories.task_repository import ISRAEL_TZ


def test_tz_aware_value_is_converted_to_israel_local_not_utc():
    """A tz-aware datetime becomes naive Israel wall-clock, differing from the
    old naive-UTC behavior by the Israel offset."""
    aware = datetime(2026, 8, 9, 12, 0, 0, tzinfo=timezone.utc)

    result = _to_naive_israel_local(aware)

    assert result.tzinfo is None
    assert result == aware.astimezone(ISRAEL_TZ).replace(tzinfo=None)
    # This is the whole point of the fix: it must NOT store naive UTC.
    assert result != _to_naive_utc(aware)


def test_naive_value_is_left_unchanged():
    """The frontend already sends naive wall-clock; it must pass through as-is."""
    naive = datetime(2026, 8, 9, 14, 0, 0)

    assert _to_naive_israel_local(naive) == naive


def test_none_returns_none():
    assert _to_naive_israel_local(None) is None
