"""Main CEMS API router.

Aggregates all sub-routers under a single prefix so that the
application's main ``app`` only needs one ``include_router`` call.
"""

from fastapi import APIRouter

from backend.api.v1.cems_assets import router as assets_router
from backend.api.v1.cems_categories import router as categories_router
from backend.api.v1.cems_consumables import router as consumables_router
from backend.api.v1.cems_documents import router as documents_router
from backend.api.v1.cems_projects import router as projects_router
from backend.api.v1.cems_reorders import router as reorders_router
from backend.api.v1.cems_reports import router as reports_router
from backend.api.v1.cems_transfers import router as transfers_router
from backend.api.v1.cems_users import router as users_router
from backend.api.v1.cems_warehouses import router as warehouses_router

cems_router = APIRouter(prefix="/cems", tags=["cems"])

cems_router.include_router(assets_router)
cems_router.include_router(categories_router)
cems_router.include_router(consumables_router)
cems_router.include_router(projects_router)
cems_router.include_router(transfers_router)
cems_router.include_router(users_router)
cems_router.include_router(warehouses_router)
cems_router.include_router(reports_router)
cems_router.include_router(documents_router)
cems_router.include_router(reorders_router)
