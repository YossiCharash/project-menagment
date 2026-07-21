"""Domain exceptions for the CEMS fixed-asset creation flow.

Each exception carries:
- ``http_status``: The HTTP status the API layer should translate to.
- ``detail``: A user-facing Hebrew message (sourced from
  ``backend.messages.cems.asset_messages``).

Services raise the domain exception; the API translates it to
``HTTPException`` so the service layer remains framework-agnostic.
"""

from __future__ import annotations

from backend.messages.cems.asset_messages import AssetCreationErrorMessages


class AssetCreationError(Exception):
    """Base class for all fixed-asset creation errors."""

    http_status: int = 400
    detail: str = ""

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.detail)
        if detail is not None:
            self.detail = detail


class AssetNameRequiredError(AssetCreationError):
    """Raised when the asset name is missing or blank."""

    http_status = 400
    detail = AssetCreationErrorMessages.ASSET_NAME_REQUIRED


class SerialNumberRequiredError(AssetCreationError):
    """Raised when the serial number is missing or blank."""

    http_status = 400
    detail = AssetCreationErrorMessages.SERIAL_NUMBER_REQUIRED


class DuplicateSerialNumberError(AssetCreationError):
    """Raised when another asset already holds the requested serial number.

    ``serial_number`` is unique at the DB level; without this guard the
    insert fails with a raw ``IntegrityError`` surfaced to the client as an
    opaque HTTP 500.
    """

    http_status = 409

    def __init__(self, serial_number: str) -> None:
        super().__init__(
            AssetCreationErrorMessages.serial_number_already_exists(serial_number),
        )
        self.serial_number = serial_number


class AssetCategoryNotFoundError(AssetCreationError):
    """Raised when the requested category does not exist.

    ``category_id`` is a non-nullable FK with ``ondelete=RESTRICT``; without
    this guard a stale id fails as an opaque HTTP 500.
    """

    http_status = 404
    detail = AssetCreationErrorMessages.CATEGORY_NOT_FOUND
