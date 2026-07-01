from __future__ import annotations
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.tenant import Tenant
from backend.models.apartment_activity import ActivityKind
from backend.repositories.tenant_repository import TenantRepository
from backend.repositories.apartment_repository import ApartmentRepository
from backend.services.apartment_activity_service import ApartmentActivityService
from backend.schemas.tenant import TenantCreate
from backend.messages.building_reception.errors import BuildingReceptionErrorMessages


class TenantService:
    """Business logic for tenants/residents (דיירים), including tenant swaps."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.tenant_repository = TenantRepository(db)
        self.apartment_repository = ApartmentRepository(db)
        self.activity_service = ApartmentActivityService(db)

    async def swap_tenant(self, apartment_id: int, new_tenant_data: TenantCreate) -> Tenant:
        """Move out the current tenant and move in a new one (החלפת דייר).

        Sets the current tenant ``is_current=False`` with today's move-out date,
        creates the new tenant as current, and records a TENANT_CHANGED activity.
        """
        await self._ensure_apartment_exists(apartment_id)
        if not new_tenant_data.name or not new_tenant_data.name.strip():
            raise ValueError(BuildingReceptionErrorMessages.TENANT_NAME_REQUIRED)

        await self._move_out_current_tenant(apartment_id)
        new_tenant = await self._move_in_new_tenant(apartment_id, new_tenant_data)

        await self.activity_service.record(
            apartment_id,
            ActivityKind.TENANT_CHANGED,
            f"דייר חדש נכנס: {new_tenant.name}",
        )
        return new_tenant

    async def delete_tenant(self, tenant_id: int) -> None:
        """Remove a tenant record from an apartment's history."""
        tenant = await self.tenant_repository.get(tenant_id)
        if not tenant:
            raise ValueError(
                BuildingReceptionErrorMessages.tenant_not_found_by_id(tenant_id)
            )
        await self.tenant_repository.delete(tenant)

    # --- private helpers -----------------------------------------------

    async def _move_out_current_tenant(self, apartment_id: int) -> None:
        current = await self.tenant_repository.get_current_for_apartment(apartment_id)
        if current:
            current.is_current = False
            current.move_out_date = date.today()
            await self.tenant_repository.update(current)

    async def _move_in_new_tenant(
        self, apartment_id: int, new_tenant_data: TenantCreate
    ) -> Tenant:
        tenant = Tenant(
            apartment_id=apartment_id,
            name=new_tenant_data.name.strip(),
            phone=(new_tenant_data.phone or "").strip() or None,
            email=(new_tenant_data.email or "").strip() or None,
            move_in_date=new_tenant_data.move_in_date or date.today(),
            move_out_date=new_tenant_data.move_out_date,
            is_current=True,
        )
        return await self.tenant_repository.create(tenant)

    async def _ensure_apartment_exists(self, apartment_id: int) -> None:
        apartment = await self.apartment_repository.get(apartment_id)
        if not apartment:
            raise ValueError(
                BuildingReceptionErrorMessages.apartment_not_found_by_id(apartment_id)
            )
