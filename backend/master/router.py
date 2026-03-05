"""
Super-Admin endpoints — all protected by require_super_admin().

All write operations go through MasterDBSessionDep so they always hit
the master database regardless of any tenant_id in the request context.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from backend.core.deps import MasterDBSessionDep, require_super_admin
from backend.master.models import Tenant
from backend.master.provisioning_service import TenantProvisioningService
from backend.master.schemas import TenantCreate, TenantList, TenantOut

router = APIRouter(prefix="/super-admin", tags=["super-admin"])


@router.post("/tenants", response_model=TenantOut, status_code=201)
async def create_tenant(
    master_db: MasterDBSessionDep,
    data: TenantCreate,
    current_user=Depends(require_super_admin()),
):
    """Provision a brand-new tenant (creates DB schema + seeds admin user)."""
    # Guard: slug uniqueness
    result = await master_db.execute(select(Tenant).where(Tenant.slug == data.slug))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug already taken")

    # Guard: email uniqueness
    result = await master_db.execute(
        select(Tenant).where(Tenant.admin_email == data.admin_email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=400, detail="A tenant with this admin email already exists"
        )

    service = TenantProvisioningService(master_db)
    try:
        tenant = await service.provision(data, created_by=current_user.id)
        return tenant
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/tenants", response_model=TenantList)
async def list_tenants(
    master_db: MasterDBSessionDep,
    current_user=Depends(require_super_admin()),
):
    """List all tenants."""
    result = await master_db.execute(select(Tenant).order_by(Tenant.id))
    tenants = result.scalars().all()
    return TenantList(tenants=list(tenants), total=len(tenants))


@router.get("/tenants/{tenant_id}", response_model=TenantOut)
async def get_tenant(
    tenant_id: int,
    master_db: MasterDBSessionDep,
    current_user=Depends(require_super_admin()),
):
    """Get tenant details."""
    result = await master_db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.patch("/tenants/{tenant_id}/suspend", response_model=TenantOut)
async def suspend_tenant(
    tenant_id: int,
    master_db: MasterDBSessionDep,
    current_user=Depends(require_super_admin()),
):
    """Suspend a tenant — removes its engine from the registry."""
    result = await master_db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant.status = "suspended"

    from backend.db.tenant_registry import tenant_registry
    await tenant_registry.unregister(tenant_id)

    return tenant


@router.patch("/tenants/{tenant_id}/activate", response_model=TenantOut)
async def activate_tenant(
    tenant_id: int,
    master_db: MasterDBSessionDep,
    current_user=Depends(require_super_admin()),
):
    """Re-activate a suspended tenant."""
    result = await master_db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant.status = "active"

    from backend.db.tenant_registry import tenant_registry
    await tenant_registry.register(tenant_id, tenant.db_url)

    return tenant


@router.delete("/tenants/{tenant_id}", status_code=204)
async def delete_tenant(
    tenant_id: int,
    master_db: MasterDBSessionDep,
    current_user=Depends(require_super_admin()),
):
    """Delete a tenant record (does NOT drop the tenant DB)."""
    result = await master_db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    from backend.db.tenant_registry import tenant_registry
    await tenant_registry.unregister(tenant_id)
    await master_db.delete(tenant)
