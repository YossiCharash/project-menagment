"""Photo storage utility for CEMS entities (fixed assets, consumables, etc.).

Encapsulates the S3-or-local-disk fallback used to upload, replace, and clean
up image files.
"""

from __future__ import annotations

import io
import os
import uuid
from typing import Optional

from backend.cems.configurations.file_uploads import (
    ALLOWED_PHOTO_EXTENSIONS,
    DEFAULT_PHOTO_FILENAME,
    MAX_PHOTO_BYTES,
    MAX_PHOTO_SIZE_MB,
)
from backend.cems.core.exceptions import FileTooLargeError, UnsupportedFileExtensionError
from backend.core.config import settings


class PhotoStorage:
    """Persists entity photos to S3 (if configured) or local disk."""

    def __init__(
        self,
        *,
        allowed_extensions: frozenset[str] = ALLOWED_PHOTO_EXTENSIONS,
        max_bytes: int = MAX_PHOTO_BYTES,
        max_size_mb: int = MAX_PHOTO_SIZE_MB,
    ) -> None:
        self._allowed_extensions = allowed_extensions
        self._max_bytes = max_bytes
        self._max_size_mb = max_size_mb

    def validate(self, filename: Optional[str], content: bytes) -> None:
        ext = (os.path.splitext(filename or "")[1] or "").lower()
        if ext not in self._allowed_extensions:
            raise UnsupportedFileExtensionError(photo_only=True)
        if len(content) > self._max_bytes:
            raise FileTooLargeError(self._max_size_mb, is_photo=True)

    def store(
        self,
        *,
        prefix: str,
        existing_url: Optional[str],
        file_bytes: bytes,
        filename: Optional[str],
        content_type: Optional[str],
    ) -> str:
        if settings.AWS_S3_BUCKET:
            return self._store_to_s3(prefix, existing_url, file_bytes, filename, content_type)
        return self._store_to_disk(prefix, existing_url, file_bytes, filename)

    @staticmethod
    def resolve_upload_base() -> str:
        base = settings.FILE_UPLOAD_DIR
        if not os.path.isabs(base):
            # Walk up four levels: services/photo_storage.py -> services -> cems -> backend -> repo
            backend_dir = os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            )
            base = os.path.abspath(os.path.join(backend_dir, settings.FILE_UPLOAD_DIR))
        return base

    @classmethod
    def ensure_local_dir(cls, prefix: str) -> str:
        directory = os.path.join(cls.resolve_upload_base(), prefix)
        os.makedirs(directory, exist_ok=True)
        return directory

    @staticmethod
    def _sanitize_filename(filename: Optional[str], fallback: str) -> str:
        cleaned = (filename or fallback).strip().replace("/", "_").replace("\\", "_")
        return cleaned or fallback

    def _store_to_s3(
        self,
        prefix: str,
        existing_url: Optional[str],
        file_bytes: bytes,
        filename: Optional[str],
        content_type: Optional[str],
    ) -> str:
        from backend.services.s3_service import S3Service

        s3 = S3Service()
        if existing_url and existing_url.startswith("http"):
            try:
                s3.delete_file(existing_url)
            except Exception:
                # Best-effort cleanup: failing to delete a stale S3 object must
                # not abort the new upload.
                pass
        return s3.upload_file(
            prefix=prefix,
            file_obj=io.BytesIO(file_bytes),
            filename=filename or DEFAULT_PHOTO_FILENAME,
            content_type=content_type,
        )

    def _store_to_disk(
        self,
        prefix: str,
        existing_url: Optional[str],
        file_bytes: bytes,
        filename: Optional[str],
    ) -> str:
        target_dir = self.ensure_local_dir(prefix)
        safe_name = self._sanitize_filename(filename, DEFAULT_PHOTO_FILENAME)
        stored_name = f"{uuid.uuid4().hex}_{safe_name}"
        new_full_path = os.path.join(target_dir, stored_name)
        with open(new_full_path, "wb") as fh:
            fh.write(file_bytes)

        if existing_url and not existing_url.startswith("http"):
            base = self.resolve_upload_base()
            old_path = os.path.join(base, existing_url)
            if os.path.isfile(old_path):
                try:
                    os.remove(old_path)
                except OSError:
                    # Best-effort cleanup: failing to delete a stale file must
                    # not abort the new upload.
                    pass

        return f"{prefix}/{stored_name}"


_default_storage = PhotoStorage()


def validate_photo(filename: Optional[str], content: bytes) -> None:
    _default_storage.validate(filename, content)


def store_photo(
    *,
    prefix: str,
    existing_url: Optional[str],
    file_bytes: bytes,
    filename: Optional[str],
    content_type: Optional[str],
) -> str:
    return _default_storage.store(
        prefix=prefix,
        existing_url=existing_url,
        file_bytes=file_bytes,
        filename=filename,
        content_type=content_type,
    )
