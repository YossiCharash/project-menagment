import uuid
from typing import Optional

from backend.cems.core.exceptions import ManagerNotFoundError, WarehouseNotFoundError
from backend.cems.models.warehouse import Warehouse
from backend.cems.repositories.user_repository import UserRepository
from backend.cems.repositories.warehouse_repository import WarehouseRepository


class WarehouseService:
    """Manages warehouse lifecycle including manager rotation."""

    def __init__(
        self,
        warehouse_repo: WarehouseRepository,
        user_repo: UserRepository,
    ) -> None:
        self._warehouse_repo = warehouse_repo
        self._user_repo = user_repo

    async def change_manager(
        self,
        warehouse_id: uuid.UUID,
        new_manager_id: int,
        changed_by_id: int,
        reason: Optional[str] = None,
    ) -> Warehouse:
        warehouse = await self._warehouse_repo.get_by_id(warehouse_id)
        if warehouse is None:
            raise WarehouseNotFoundError()

        new_manager = await self._user_repo.get_by_id(new_manager_id)
        if new_manager is None:
            raise ManagerNotFoundError()

        previous_manager_id = warehouse.current_manager_id

        await self._warehouse_repo.create_manager_history(
            {
                "warehouse_id": warehouse_id,
                "previous_manager_id": previous_manager_id,
                "new_manager_id": new_manager_id,
                "changed_by_id": changed_by_id,
                "reason": reason,
            }
        )

        if previous_manager_id is not None:
            await self._user_repo.update(
                previous_manager_id, {"warehouse_id": None}
            )

        await self._warehouse_repo.update(
            warehouse_id, {"current_manager_id": new_manager_id}
        )
        await self._user_repo.update(
            new_manager_id, {"warehouse_id": warehouse_id}
        )

        return await self._warehouse_repo.get_by_id(warehouse_id)  # type: ignore[return-value]
