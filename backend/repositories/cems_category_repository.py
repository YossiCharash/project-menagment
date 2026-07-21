from backend.models.cems_category import AssetCategory
from backend.repositories.cems_base_repository import BaseRepository

from sqlalchemy.ext.asyncio import AsyncSession


class CategoryRepository(BaseRepository[AssetCategory]):
    """Data access for asset categories.

    Inherits the generic CRUD surface; services use ``exists`` to validate
    a ``category_id`` before it reaches the non-nullable FK column on
    ``cems_fixed_assets``.
    """

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(AssetCategory, session)
