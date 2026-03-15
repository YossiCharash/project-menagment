"""Shared test fixtures for the CEMS module.

Uses an async SQLite in-memory database so tests run fast and without
any external infrastructure.
"""

import uuid
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.cems.models.base import CEMSBase
from backend.cems.models.category import AssetCategory
from backend.cems.models.consumable import ConsumableItem
from backend.cems.models.fixed_asset import AssetStatus, FixedAsset
from backend.cems.models.project import Project
from backend.cems.models.user import User, UserRole
from backend.cems.models.warehouse import Area, Warehouse

# Force all model tables to be registered on CEMSBase.metadata
import backend.cems.models  # noqa: F401


@pytest_asyncio.fixture
async def async_session():
    """Yield a transactional async session backed by SQLite in-memory."""
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(CEMSBase.metadata.create_all)

    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(CEMSBase.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def seed_users(async_session: AsyncSession) -> dict[str, User]:
    """Create a set of users covering all roles."""
    admin = User(
        id=uuid.uuid4(),
        email="admin@test.com",
        hashed_password="hashed",
        full_name="Admin User",
        role=UserRole.ADMIN,
    )
    manager = User(
        id=uuid.uuid4(),
        email="manager@test.com",
        hashed_password="hashed",
        full_name="Manager User",
        role=UserRole.MANAGER,
    )
    employee = User(
        id=uuid.uuid4(),
        email="employee@test.com",
        hashed_password="hashed",
        full_name="Employee User",
        role=UserRole.EMPLOYEE,
    )
    recipient = User(
        id=uuid.uuid4(),
        email="recipient@test.com",
        hashed_password="hashed",
        full_name="Recipient User",
        role=UserRole.EMPLOYEE,
    )
    async_session.add_all([admin, manager, employee, recipient])
    await async_session.flush()
    return {
        "admin": admin,
        "manager": manager,
        "employee": employee,
        "recipient": recipient,
    }


@pytest_asyncio.fixture
async def seed_warehouse(async_session: AsyncSession, seed_users: dict[str, User]) -> dict:
    """Create a warehouse with an area and assign the manager."""
    warehouse = Warehouse(
        id=uuid.uuid4(),
        name="Main Warehouse",
        location="Building A",
        current_manager_id=seed_users["manager"].id,
    )
    async_session.add(warehouse)
    await async_session.flush()

    area = Area(
        id=uuid.uuid4(),
        name="Section A1",
        warehouse_id=warehouse.id,
        description="Electrical storage",
    )
    async_session.add(area)
    await async_session.flush()

    # Link manager to warehouse
    seed_users["manager"].warehouse_id = warehouse.id
    await async_session.flush()

    return {"warehouse": warehouse, "area": area}


@pytest_asyncio.fixture
async def seed_category(async_session: AsyncSession) -> AssetCategory:
    cat = AssetCategory(id=uuid.uuid4(), name="Electrical")
    async_session.add(cat)
    await async_session.flush()
    return cat


@pytest_asyncio.fixture
async def seed_project(async_session: AsyncSession) -> Project:
    proj = Project(id=uuid.uuid4(), name="Project Alpha", code="PA-001")
    async_session.add(proj)
    await async_session.flush()
    return proj


@pytest_asyncio.fixture
async def seed_asset(
    async_session: AsyncSession,
    seed_users: dict[str, User],
    seed_warehouse: dict,
    seed_category: AssetCategory,
) -> FixedAsset:
    """Create an ACTIVE asset assigned to the employee."""
    asset = FixedAsset(
        id=uuid.uuid4(),
        name="Drill Machine",
        serial_number="SN-001",
        category_id=seed_category.id,
        current_custodian_id=seed_users["employee"].id,
        current_area_id=seed_warehouse["area"].id,
        status=AssetStatus.ACTIVE,
    )
    async_session.add(asset)
    await async_session.flush()
    return asset


@pytest_asyncio.fixture
async def seed_consumable(
    async_session: AsyncSession,
    seed_warehouse: dict,
    seed_category: AssetCategory,
) -> ConsumableItem:
    """Create a consumable item with some stock."""
    item = ConsumableItem(
        id=uuid.uuid4(),
        name="Screws 5mm",
        category_id=seed_category.id,
        area_id=seed_warehouse["area"].id,
        quantity=Decimal("100.0000"),
        unit="pieces",
        low_stock_threshold=Decimal("10.0000"),
        reorder_quantity=Decimal("200.0000"),
    )
    async_session.add(item)
    await async_session.flush()
    return item
