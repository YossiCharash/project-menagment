from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.apartment_key import (
    ApartmentKey,
    KeyTransfer,
    KeyHolder,
    KeyDirection,
)
from backend.models.apartment_activity import ActivityKind
from backend.repositories.apartment_key_repository import ApartmentKeyRepository
from backend.repositories.apartment_repository import ApartmentRepository
from backend.services.apartment_activity_service import ApartmentActivityService
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


class KeyService:
    """Business logic for apartment keys (מפתחות) and their hand-out/return flow."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.key_repository = ApartmentKeyRepository(db)
        self.apartment_repository = ApartmentRepository(db)
        self.activity_service = ApartmentActivityService(db)

    async def list_for_apartment(self, apartment_id: int) -> List[ApartmentKey]:
        await self._ensure_apartment_exists(apartment_id)
        return await self.key_repository.list_by_apartment(apartment_id)

    async def create_key(self, apartment_id: int, label: str) -> ApartmentKey:
        await self._ensure_apartment_exists(apartment_id)
        if not label or not label.strip():
            raise ValueError(BuildingReceptionErrorMessages.KEY_LABEL_REQUIRED)
        key = ApartmentKey(
            apartment_id=apartment_id,
            label=label.strip(),
            holder=KeyHolder.IN_DESK,
        )
        return await self.key_repository.create(key)

    async def transfer(
        self,
        key_id: int,
        direction: str,
        counterparty_name: str,
        note: str | None,
        user_id: int | None,
    ) -> ApartmentKey:
        """Hand a key out or take it back, journaling the move and the timeline.

        out   → holder=OUT,     holder_name=counterparty, activity=KEY_OUT
        return→ holder=IN_DESK, holder_name=None,         activity=KEY_IN
        """
        key = await self.key_repository.get(key_id)
        if not key:
            raise ValueError(BuildingReceptionErrorMessages.key_not_found_by_id(key_id))
        if direction not in (KeyDirection.OUT, KeyDirection.RETURN):
            raise ValueError(
                BuildingReceptionErrorMessages.invalid_key_direction(direction)
            )
        if not counterparty_name or not counterparty_name.strip():
            raise ValueError(BuildingReceptionErrorMessages.COUNTERPARTY_NAME_REQUIRED)

        clean_counterparty = counterparty_name.strip()
        self._apply_direction(key, direction, clean_counterparty)
        await self.key_repository.update(key)

        transfer = KeyTransfer(
            key_id=key.id,
            direction=direction,
            counterparty_name=clean_counterparty,
            note=(note or "").strip() or None,
            created_by_user_id=user_id,
        )
        await self.key_repository.add_transfer(transfer)

        await self._record_transfer_activity(key, direction, clean_counterparty)
        return await self.key_repository.get(key.id)

    # --- private helpers -----------------------------------------------

    def _apply_direction(
        self, key: ApartmentKey, direction: str, counterparty_name: str
    ) -> None:
        if direction == KeyDirection.OUT:
            key.holder = KeyHolder.OUT
            key.holder_name = counterparty_name
        else:
            key.holder = KeyHolder.IN_DESK
            key.holder_name = None

    async def _record_transfer_activity(
        self, key: ApartmentKey, direction: str, counterparty_name: str
    ) -> None:
        if direction == KeyDirection.OUT:
            kind = ActivityKind.KEY_OUT
            text = f"מפתח '{key.label}' נמסר ל{counterparty_name}"
        else:
            kind = ActivityKind.KEY_IN
            text = f"מפתח '{key.label}' הוחזר על ידי {counterparty_name}"
        await self.activity_service.record(key.apartment_id, kind, text)

    async def _ensure_apartment_exists(self, apartment_id: int) -> None:
        apartment = await self.apartment_repository.get(apartment_id)
        if not apartment:
            raise ValueError(
                BuildingReceptionErrorMessages.apartment_not_found_by_id(apartment_id)
            )
