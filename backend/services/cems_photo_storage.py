"""Photo storage utility for CEMS entities (fixed assets, consumables, etc.).

Encapsulates the S3-or-local-disk fallback used to upload, replace, and clean
up image files. Following the Single Responsibility Principle, this module is
the only place that knows about file extensions, size limits, and the disk
layout for entity photos.
"""

from __future__ import annotations

import io as _io
import os
import uuid
from typing import Optional

from fastapi import HTTPException, status

from backend.core.config import settings


# ─── Public constants ───────────────────────────────────────────────────────
_ALLOWED_PHOTO_EXT = {".jpg", ".jpeg", ".png"}
_MAX_PHOTO_BYTES = 10 * 1024 * 1024  # 10 MB


def _resolve_upload_base() -> str:
    """Resolve FILE_UPLOAD_DIR to an absolute path (mirrors logic in api/assets.py)."""
    base = settings.FILE_UPLOAD_DIR
    if not os.path.isabs(base):
        # backend/cems/services/photo_storage.py → up 3 levels = repo root for backend
        backend_dir = os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        )
        base = os.path.abspath(os.path.join(backend_dir, settings.FILE_UPLOAD_DIR))
    return base


def _ensure_local_dir(prefix: str) -> str:
    base = _resolve_upload_base()
    d = os.path.join(base, prefix)
    os.makedirs(d, exist_ok=True)
    return d


def validate_photo(filename: Optional[str], content: bytes) -> None:
    """Raise HTTPException if the photo's extension or size is invalid."""
    ext = (os.path.splitext(filename or "")[1] or "").lower()
    if ext not in _ALLOWED_PHOTO_EXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="סוג קובץ לא נתמך. מותרים: jpg, jpeg, png",
        )
    if len(content) > _MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="גודל תמונה מקסימלי: 10 MB",
        )


def store_photo(
    *,
    prefix: str,
    existing_url: Optional[str],
    file_bytes: bytes,
    filename: Optional[str],
    content_type: Optional[str],
) -> str:
    """Persist a photo (S3 if configured, else local disk) and best-effort
    delete the previous one. Returns the new stored URL/path.
    """
    if settings.AWS_S3_BUCKET:
        # ── S3 upload ────────────────────────────────────────────────────
        from backend.services.s3_service import S3Service

        s3 = S3Service()
        if existing_url and existing_url.startswith("http"):
            try:
                s3.delete_file(existing_url)
            except Exception:
                pass
        return s3.upload_file(
            prefix=prefix,
            file_obj=_io.BytesIO(file_bytes),
            filename=filename or "photo",
            content_type=content_type,
        )

    # ── Local disk fallback ──────────────────────────────────────────────
    target_dir = _ensure_local_dir(prefix)
    safe_name = (filename or "photo").strip().replace("/", "_").replace("\\", "_") or "photo"
    stored_name = f"{uuid.uuid4().hex}_{safe_name}"
    new_full_path = os.path.join(target_dir, stored_name)
    with open(new_full_path, "wb") as fh:
        fh.write(file_bytes)

    # Delete old photo from disk (non-fatal)
    if existing_url and not existing_url.startswith("http"):
        base = _resolve_upload_base()
        old_path = os.path.join(base, existing_url)
        if os.path.isfile(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    return f"{prefix}/{stored_name}"
