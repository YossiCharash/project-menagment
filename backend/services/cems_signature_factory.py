"""Utility for building deterministic digital-signature hashes."""

import hashlib
import uuid
from datetime import datetime

from backend.models.cems_base import _utc_now


class SignatureHashFactory:
    """SHA-256 hashing of (user_id, timestamp, action) triples."""

    @staticmethod
    def build(
        user_id: uuid.UUID,
        action: str,
        timestamp: datetime | None = None,
    ) -> str:
        effective_timestamp = timestamp if timestamp is not None else _utc_now()
        payload = f"{user_id}:{effective_timestamp.isoformat()}:{action}"
        return hashlib.sha256(payload.encode()).hexdigest()


def create_signature_hash(
    user_id: uuid.UUID,
    action: str,
    timestamp: datetime | None = None,
) -> str:
    return SignatureHashFactory.build(user_id, action, timestamp)
