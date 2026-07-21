"""Service layer for creating fixed assets.

Enforces, before the insert reaches the database, every invariant that the
``cems_fixed_assets`` table declares: a non-blank name, a unique non-blank
serial number, and an existing category.  Violating any of them at the DB
level surfaces to the client as an opaque HTTP 500, so each is validated
here and reported as a distinct domain exception with a Hebrew message.
"""

import uuid
from typing import Optional

from backend.core.exceptions.cems import (
    AssetCategoryNotFoundError,
    AssetNameRequiredError,
    DuplicateSerialNumberError,
    SerialNumberRequiredError,
)
from backend.models.cems_fixed_asset import FixedAsset
from backend.repositories.cems_asset_repository import AssetRepository
from backend.repositories.cems_category_repository import CategoryRepository

# History action recorded for every newly created asset.
_ASSET_CREATED_ACTION = "ASSET_CREATED"


class AssetCreationService:
    """Creates a fixed asset and records its first history entry.

    The service is framework-agnostic: it raises the domain exceptions from
    ``backend.core.exceptions.cems`` and never references FastAPI. The API
    layer translates those exceptions into HTTP responses.
    """

    def __init__(
        self,
        asset_repo: AssetRepository,
        category_repo: CategoryRepository,
    ) -> None:
        self._asset_repo = asset_repo
        self._category_repo = category_repo

    async def create_asset(self, data: dict, actor_id: int) -> FixedAsset:
        """Validate *data* and persist it as a new fixed asset.

        Raises ``AssetNameRequiredError``, ``SerialNumberRequiredError``,
        ``DuplicateSerialNumberError`` or ``AssetCategoryNotFoundError``
        when the corresponding invariant is violated.
        """
        normalised = await self._validate(data)
        asset = await self._asset_repo.create(normalised)
        await self._log_creation(asset, actor_id)
        return asset

    # ── Validation ──────────────────────────────────────────────────────────

    async def _validate(self, data: dict) -> dict:
        """Return *data* with name/serial trimmed, after checking invariants."""
        name = self._require_name(data.get("name"))
        serial_number = self._require_serial_number(data.get("serial_number"))
        await self._require_serial_number_available(serial_number)
        await self._require_existing_category(data.get("category_id"))
        return {**data, "name": name, "serial_number": serial_number}

    @staticmethod
    def _require_name(name: Optional[str]) -> str:
        """Return the trimmed name, rejecting a missing or blank value."""
        trimmed = (name or "").strip()
        if not trimmed:
            raise AssetNameRequiredError()
        return trimmed

    @staticmethod
    def _require_serial_number(serial_number: Optional[str]) -> str:
        """Return the trimmed serial number, rejecting a blank value."""
        trimmed = (serial_number or "").strip()
        if not trimmed:
            raise SerialNumberRequiredError()
        return trimmed

    async def _require_serial_number_available(self, serial_number: str) -> None:
        """Reject a serial number already taken by another asset."""
        existing = await self._asset_repo.get_by_serial(serial_number)
        if existing is not None:
            raise DuplicateSerialNumberError(serial_number)

    async def _require_existing_category(
        self, category_id: Optional[uuid.UUID],
    ) -> None:
        """Reject a category id that has no matching row."""
        if category_id is None or not await self._category_repo.exists(category_id):
            raise AssetCategoryNotFoundError()

    # ── History ─────────────────────────────────────────────────────────────

    async def _log_creation(self, asset: FixedAsset, actor_id: int) -> None:
        """Record the creation of *asset* in its history trail."""
        await self._asset_repo.log_history(
            asset_id=asset.id,
            action=_ASSET_CREATED_ACTION,
            actor_id=actor_id,
            notes=f"נכס '{asset.name}' נוצר עם מס' סידורי '{asset.serial_number}'.",
        )
