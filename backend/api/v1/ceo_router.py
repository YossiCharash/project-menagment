"""
Aggregate router for all CEO (platform-admin) endpoints.

Mounted under ``/api/v1/ceo`` in main.py.
"""
from fastapi import APIRouter

from backend.api.v1.endpoints import ceo_auth, ceo_tenants

ceo_router = APIRouter(prefix="/ceo")
ceo_router.include_router(ceo_auth.router, prefix="/auth", tags=["CEO Auth"])
ceo_router.include_router(ceo_tenants.router, prefix="/tenants", tags=["CEO Tenants"])
