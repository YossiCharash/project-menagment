"""Regression test: permanent-delete of a retired asset removes every dependent
row explicitly, so it succeeds even on a database whose FK constraints lack
ON DELETE CASCADE (SQLite here enforces no cascade, emulating that case)."""

import uuid

import pytest
from sqlalchemy import func, select

from backend.models.cems_fixed_asset import AssetHistory, AssetStatus, FixedAsset
from backend.models.cems_document import CemsDocument, DocumentType
from backend.models.cems_retirement import AssetRetirement, RetirementStatus
from backend.models.cems_transfer import Transfer, TransferStatus, WarehouseReturn, ReturnStatus
from backend.models.cems_user import User
from backend.repositories.cems_asset_repository import AssetRepository
from backend.repositories.cems_transfer_repository import TransferRepository
from backend.repositories.cems_user_repository import UserRepository
from backend.services.cems_retirement_service import RetirementService


async def _count(session, model, asset_id) -> int:
    result = await session.execute(
        select(func.count()).select_from(model).where(model.asset_id == asset_id)
    )
    return result.scalar_one()


@pytest.mark.asyncio
async def test_permanent_delete_removes_all_children(
    async_session,
    seed_users: dict[str, User],
    seed_warehouse: dict,
    seed_asset: FixedAsset,
):
    warehouse = seed_warehouse["warehouse"]

    # A transfer, a warehouse return, and a document referencing the asset —
    # none of which has an ORM delete-orphan cascade from FixedAsset.
    async_session.add(
        Transfer(
            id=uuid.uuid4(), asset_id=seed_asset.id,
            to_user_id=seed_users["recipient"].id,
            initiated_by_id=seed_users["manager"].id,
            status=TransferStatus.COMPLETED,
        )
    )
    async_session.add(
        WarehouseReturn(
            id=uuid.uuid4(), asset_id=seed_asset.id,
            returned_by_id=seed_users["employee"].id,
            warehouse_id=warehouse.id, status=ReturnStatus.PENDING,
        )
    )
    async_session.add(
        CemsDocument(
            entity_type="fixed_asset", entity_id=seed_asset.id,
            document_type=DocumentType.OTHER, filename="x.pdf",
            file_path="cems_documents/x.pdf",
            uploaded_by_id=seed_users["manager"].id,
        )
    )
    await async_session.flush()

    service = RetirementService(
        AssetRepository(async_session),
        TransferRepository(async_session),
        UserRepository(async_session),
    )
    retirement = await service.request_retirement(
        asset_id=seed_asset.id,
        requested_by_id=seed_users["employee"].id,
        reason="Obsolete", disposal_method="Scrap",
    )
    await service.approve_retirement(
        retirement_id=retirement.id, manager_id=seed_users["admin"].id,
    )

    # Sanity: children exist before the delete.
    assert await _count(async_session, Transfer, seed_asset.id) == 1
    assert await _count(async_session, WarehouseReturn, seed_asset.id) == 1
    assert await _count(async_session, AssetRetirement, seed_asset.id) == 1
    assert await _count(async_session, AssetHistory, seed_asset.id) >= 1

    await service.delete_archived_asset(
        asset_id=seed_asset.id, manager_id=seed_users["admin"].id,
    )

    repo = AssetRepository(async_session)
    assert await repo.get_by_id(seed_asset.id) is None
    assert await _count(async_session, Transfer, seed_asset.id) == 0
    assert await _count(async_session, WarehouseReturn, seed_asset.id) == 0
    assert await _count(async_session, AssetRetirement, seed_asset.id) == 0
    assert await _count(async_session, AssetHistory, seed_asset.id) == 0

    docs = await async_session.execute(
        select(func.count()).select_from(CemsDocument).where(
            CemsDocument.entity_id == seed_asset.id
        )
    )
    assert docs.scalar_one() == 0
