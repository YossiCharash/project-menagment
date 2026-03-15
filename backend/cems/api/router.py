"""Main CEMS API router.

Aggregates all sub-routers under a single prefix so that the
application's main ``app`` only needs one ``include_router`` call.
"""

from fastapi import APIRouter

from backend.cems.api.assets import router as assets_router
from backend.cems.api.consumables import router as consumables_router
from backend.cems.api.documents import router as documents_router
from backend.cems.api.reports import router as reports_router
from backend.cems.api.transfers import router as transfers_router
from backend.cems.api.warehouses import router as warehouses_router

cems_router = APIRouter(prefix="/api/v1/cems")

cems_router.include_router(assets_router)
cems_router.include_router(consumables_router)
cems_router.include_router(transfers_router)
cems_router.include_router(warehouses_router)
cems_router.include_router(reports_router)
cems_router.include_router(documents_router)
