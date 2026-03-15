"""Utility for building deterministic digital-signature hashes.

Kept in a single place so every service computes hashes the same way
(DRY / Single Responsibility).
"""

import hashlib
import uuid
from datetime import datetime

from backend.cems.models.base import _utc_now


def create_signature_hash(
    user_id: uuid.UUID,
    action: str,
    timestamp: datetime | None = None,
) -> str:
    """SHA-256 of ``user_id:timestamp:action``."""
    if timestamp is None:
        timestamp = _utc_now()
    payload = f"{user_id}:{timestamp.isoformat()}:{action}"
    return hashlib.sha256(payload.encode()).hexdigest()
