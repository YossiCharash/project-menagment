from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models.tenant import Tenant


class TenantRepository:
    """Data access for tenants/residents (דיירים)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, tenant_id: int) -> Tenant | None:
        result = await self.db.execute(select(Tenant).where(Tenant.id == tenant_id))
        return result.scalar_one_or_none()

    async def get_current_for_apartment(self, apartment_id: int) -> Tenant | None:
        result = await self.db.execute(
            select(Tenant).where(
                Tenant.apartment_id == apartment_id,
                Tenant.is_current.is_(True),
            )
        )
        return result.scalars().first()

    async def list_by_apartment(self, apartment_id: int) -> List[Tenant]:
        result = await self.db.execute(
            select(Tenant)
            .where(Tenant.apartment_id == apartment_id)
            .order_by(Tenant.is_current.desc(), Tenant.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, tenant: Tenant) -> Tenant:
        self.db.add(tenant)
        await self.db.commit()
        await self.db.refresh(tenant)
        return tenant

    async def update(self, tenant: Tenant) -> Tenant:
        await self.db.commit()
        await self.db.refresh(tenant)
        return tenant

    async def delete(self, tenant: Tenant) -> None:
        await self.db.delete(tenant)
        await self.db.commit()
