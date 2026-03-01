"""
Tenant management endpoints (CEO-only).

All routes require a valid CEO bearer token via ``get_current_ceo``.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.ceo_security import get_current_ceo
from backend.db.master_session import get_master_db
from backend.models.tenant import CEOCredential, Tenant
from backend.services.tenant_provisioner import TenantProvisionerService

router = APIRouter(dependencies=[Depends(get_current_ceo)])

_provisioner = TenantProvisionerService()


# -- Request / Response schemas -------------------------------------------

class TenantCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)


class TenantStatusUpdateRequest(BaseModel):
    action: str = Field(..., pattern="^(suspend|activate)$")


# -- Endpoints ------------------------------------------------------------

@router.get("/")
async def list_tenants(db: AsyncSession = Depends(get_master_db)):
    """List every tenant (all statuses)."""
    stmt = select(Tenant).order_by(Tenant.created_at.desc())
    result = await db.execute(stmt)
    tenants = result.scalars().all()
    return [
        {
            "id": t.id,
            "slug": t.slug,
            "name": t.name,
            "email": t.email,
            "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "last_accessed": t.last_accessed.isoformat() if t.last_accessed else None,
        }
        for t in tenants
    ]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantCreateRequest,
    db: AsyncSession = Depends(get_master_db),
):
    """Provision a brand-new tenant (database + admin user)."""
    result = await _provisioner.provision(
        name=body.name,
        email=body.email,
        password=body.password,
        master_db=db,
    )
    return {
        "slug": result["slug"],
        "db_name": result["db_name"],
        "login_url": result["login_url"],
        "message": f"Tenant '{result['slug']}' provisioned successfully",
    }


@router.get("/{slug}")
async def get_tenant(slug: str, db: AsyncSession = Depends(get_master_db)):
    """Retrieve a single tenant by slug."""
    stmt = select(Tenant).where(Tenant.slug == slug)
    result = await db.execute(stmt)
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant '{slug}' not found",
        )
    return {
        "id": tenant.id,
        "slug": tenant.slug,
        "name": tenant.name,
        "email": tenant.email,
        "status": tenant.status,
        "db_name": tenant.db_name,
        "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
        "last_accessed": tenant.last_accessed.isoformat() if tenant.last_accessed else None,
    }


@router.put("/{slug}")
async def update_tenant_status(
    slug: str,
    body: TenantStatusUpdateRequest,
    db: AsyncSession = Depends(get_master_db),
):
    """Suspend or activate a tenant."""
    if body.action == "suspend":
        await _provisioner.suspend_tenant(slug, db)
        return {"slug": slug, "status": "suspended"}
    else:
        await _provisioner.activate_tenant(slug, db)
        return {"slug": slug, "status": "active"}


@router.delete("/{slug}")
async def delete_tenant(slug: str, db: AsyncSession = Depends(get_master_db)):
    """Soft-delete a tenant (status set to 'deleted'; database preserved)."""
    await _provisioner.delete_tenant(slug, db)
    return {"slug": slug, "status": "deleted"}


@router.get("/{slug}/stats")
async def tenant_stats(slug: str, db: AsyncSession = Depends(get_master_db)):
    """Return usage statistics for a tenant."""
    return await _provisioner.get_tenant_stats(slug, db)
