"""Tests for CEMS document storage: S3-or-disk parity with photos.

Regression coverage for the bug where documents were written straight to the
local disk (and served via /uploads) instead of going through the shared
S3-or-disk storage used by photos — which broke attaching documents on a
container host whose filesystem is ephemeral.
"""

import io
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from starlette.datastructures import Headers, UploadFile

from backend.api.v1 import cems_documents
from backend.models.cems_document import DocumentType
from backend.models.cems_user import User


def _make_upload(filename: str, content: bytes) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(content),
        filename=filename,
        headers=Headers({"content-type": "application/pdf"}),
    )


@pytest.mark.asyncio
async def test_upload_document_uses_s3_when_configured(
    async_session, seed_users: dict[str, User], seed_consumable, monkeypatch,
):
    """With AWS_S3_BUCKET set, the file goes to S3 (no local disk write) and the
    returned URL is a signed link — mirroring the photo behaviour."""
    s3_url = "https://bucket.s3.amazonaws.com/cems_documents/deadbeef.pdf"
    signed = s3_url + "?X-Amz-Signature=abc"

    fake_s3 = MagicMock()
    fake_s3.upload_file.return_value = s3_url
    fake_s3.generate_presigned_url.return_value = signed

    cems_documents._s3_service.cache_clear()
    monkeypatch.setattr(cems_documents.settings, "AWS_S3_BUCKET", "bucket")
    # store_photo builds S3Service lazily from its own module.
    monkeypatch.setattr("backend.services.cems_photo_storage.settings.AWS_S3_BUCKET", "bucket", raising=False)

    with patch("backend.services.s3_service.S3Service", return_value=fake_s3), \
         patch("backend.api.v1.cems_documents.S3Service", return_value=fake_s3):
        doc = await cems_documents.upload_document(
            file=_make_upload("invoice.pdf", b"%PDF-1.4 x"),
            entity_type="consumable",
            entity_id=seed_consumable.id,
            document_type=DocumentType.INVOICE,
            expiry_date=None,
            db=async_session,
            current_user=seed_users["manager"],
        )
        # file_url is computed lazily; evaluate it while S3 signing is patched
        # in — mirrors FastAPI serialising the response within the request.
        resolved_url = doc.file_url

    fake_s3.upload_file.assert_called_once()
    assert doc.file_path == s3_url
    # file_url is the signed URL, not a /uploads/ disk path.
    assert resolved_url == signed
    cems_documents._s3_service.cache_clear()


@pytest.mark.asyncio
async def test_upload_document_falls_back_to_disk_without_s3(
    async_session, seed_users: dict[str, User], seed_asset, monkeypatch,
):
    """Without S3 configured, documents still persist to local disk and serve
    under /uploads (unchanged behaviour)."""
    monkeypatch.setattr(cems_documents.settings, "AWS_S3_BUCKET", None)
    doc = await cems_documents.upload_document(
        file=_make_upload("warranty.pdf", b"%PDF-1.4 y"),
        entity_type="fixed_asset",
        entity_id=seed_asset.id,
        document_type=DocumentType.WARRANTY,
        expiry_date=None,
        db=async_session,
        current_user=seed_users["manager"],
    )
    assert doc.file_path.startswith("cems_documents/")
    assert doc.file_url == f"/uploads/{doc.file_path}"


def test_resolve_document_url_signs_s3_and_passes_disk(monkeypatch):
    fake_s3 = MagicMock()
    fake_s3.generate_presigned_url.return_value = "https://signed"
    cems_documents._s3_service.cache_clear()
    monkeypatch.setattr(cems_documents.settings, "AWS_S3_BUCKET", "bucket")
    with patch("backend.api.v1.cems_documents.S3Service", return_value=fake_s3):
        assert cems_documents._resolve_document_url("https://x/y.pdf") == "https://signed"
    cems_documents._s3_service.cache_clear()
    # Disk path is served under /uploads regardless of S3 config.
    assert cems_documents._resolve_document_url("cems_documents/z.pdf") == "/uploads/cems_documents/z.pdf"
    assert cems_documents._resolve_document_url("") == ""
