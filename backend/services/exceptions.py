"""
Domain exceptions raised by the service layer.

These exceptions represent *business* failure modes — not HTTP concerns.
Services raise them; endpoints catch them and translate to HTTP status codes:

    EntityNotFoundError    -> 404
    DuplicateEntityError   -> 422
    ValidationError        -> 400
    DependencyExistsError  -> 400
    InvalidStateError      -> 400

Each carries a single human-readable ``message`` (Hebrew or English — caller's
choice). The message is what end-users see, so callers must craft it carefully.
"""

from __future__ import annotations


class DomainError(Exception):
    """Base class for all service-layer domain errors."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message

    def __str__(self) -> str:
        return self.message


class EntityNotFoundError(DomainError):
    """A referenced entity does not exist."""


class DuplicateEntityError(DomainError):
    """An entity with conflicting unique fields already exists."""


class ValidationError(DomainError):
    """Input failed a business-rule validation."""


class DependencyExistsError(DomainError):
    """Operation blocked because dependent records still reference the entity."""


class InvalidStateError(DomainError):
    """Entity is not in a state that permits the requested operation."""
