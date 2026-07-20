"""Tests for task attachment URL resolution.

Attachments live in a private S3 bucket, so the URL handed to the browser must
be signed at read time. Previously the raw (unsigned) S3 URL stored in the DB
was returned as-is, which a browser cannot fetch — every attachment rendered as
"file not found". These tests pin the signing behaviour and the local-path
fallbacks.
"""
from unittest.mock import MagicMock, patch

import pytest

from backend.api.v1.endpoints.tasks import _attachment_file_url, _s3_service


S3_STORED_URL = "https://project-menager-files.s3.us-east-1.amazonaws.com/task_attachments/abc.pdf"
SIGNED_URL = f"{S3_STORED_URL}?X-Amz-Signature=deadbeef&X-Amz-Expires=3600"


@pytest.fixture(autouse=True)
def clear_s3_client_cache():
    """The S3 wrapper is lru_cached; drop it so each test patches a fresh one."""
    _s3_service.cache_clear()
    yield
    _s3_service.cache_clear()


def test_s3_path_is_signed_before_being_returned():
    """A stored S3 URL must be exchanged for a signed one, not passed through."""
    fake_s3 = MagicMock()
    fake_s3.generate_presigned_url.return_value = SIGNED_URL

    with patch("backend.api.v1.endpoints.tasks.settings") as fake_settings, \
         patch("backend.api.v1.endpoints.tasks.S3Service", return_value=fake_s3):
        fake_settings.AWS_S3_BUCKET = "project-menager-files"
        resolved = _attachment_file_url(S3_STORED_URL)

    assert resolved == SIGNED_URL
    fake_s3.generate_presigned_url.assert_called_once_with(S3_STORED_URL)


def test_s3_client_is_reused_across_attachments():
    """Signing runs per attachment, so the boto3 client must be built once."""
    fake_s3 = MagicMock()
    fake_s3.generate_presigned_url.return_value = SIGNED_URL

    with patch("backend.api.v1.endpoints.tasks.settings") as fake_settings, \
         patch("backend.api.v1.endpoints.tasks.S3Service", return_value=fake_s3) as constructor:
        fake_settings.AWS_S3_BUCKET = "project-menager-files"
        for _ in range(3):
            _attachment_file_url(S3_STORED_URL)

    assert constructor.call_count == 1
    assert fake_s3.generate_presigned_url.call_count == 3


def test_remote_url_passes_through_when_s3_is_not_configured():
    """Without a bucket configured there is nothing to sign against."""
    with patch("backend.api.v1.endpoints.tasks.settings") as fake_settings:
        fake_settings.AWS_S3_BUCKET = None
        assert _attachment_file_url(S3_STORED_URL) == S3_STORED_URL


def test_relative_local_path_is_served_under_uploads():
    """Legacy dev/test uploads on local disk keep their /uploads/ prefix."""
    assert _attachment_file_url("task_attachments/x.png") == "/uploads/task_attachments/x.png"


def test_absolute_local_path_is_left_alone():
    assert _attachment_file_url("/uploads/task_attachments/x.png") == "/uploads/task_attachments/x.png"


@pytest.mark.parametrize("empty", [None, ""])
def test_missing_path_resolves_to_empty_string(empty):
    assert _attachment_file_url(empty) == ""
