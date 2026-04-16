"""Common, cross-domain Pydantic response schemas."""

from __future__ import annotations

from pydantic import BaseModel


class MessageResponse(BaseModel):
    """Minimal success-response envelope for endpoints that return only a message."""

    message: str
