"""Shared test fixtures for the CEMS module.

Uses an async SQLite in-memory database so tests run fast and without
any external infrastructure.
"""

import uuid
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.db.base import Base
from backend.cems.models.category import AssetCategory
from backend.cems.models.consumable import ConsumableItem
from backend.cems.models.fixed_asset import AssetStatus, FixedAsset
from backend.cems.models.project import Project
from backend.cems.models.user import UserRole  # CemsUserRole enum
from backend.cems.models.warehouse import Warehouse
from backend.models.user import User

# Ensure all CEMS model tables are registered on Base.metadata
import backend.cems.models  # noqa: F401


@pytest_asyncio.fixture
async def async_session():
    """Yield a transactional async session backed by SQLite in-memory."""
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)

    async with engine.begin() as conn:
        # Only create tables defined in CEMS + shared users table
        cems_table_names = {
            "users",
            "cems_warehouses", "cems_warehouse_projects", "cems_manager_history",
            "cems_asset_categories", "cems_projects",
            "cems_fixed_assets", "cems_asset_history",
            "cems_consumable_items", "cems_consumption_logs", "cems_stock_alerts",
            "cems_transfers", "cems_warehouse_returns",
            "cems_asset_retirements",
            "cems_signatures",
            "cems_documents",
        }
        tables = [t for t in Base.metadata.sorted_tables if t.name in cems_table_names]
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        tables = [t for t in Base.metadata.sorted_tables if t.name in cems_table_names]
        await conn.run_sync(Base.metadata.drop_all, tables=tables)

    await engine.dispose()


@pytest_asyncio.fixture
async def seed_users(async_session: AsyncSession) -> dict[str, User]:
    """Create a set of users covering all CEMS roles."""
    admin = User(
        email="admin@test.com",
        password_hash="hashed",
        full_name="Admin User",
        role="Admin",            # main-system role
        cems_role=UserRole.ADMIN.value,
    )
    manager = User(
        email="manager@test.com",
        password_hash="hashed",
        full_name="Manager User",
        role="Member",
        cems_role=UserRole.MANAGER.value,
    )
    employee = User(
        email="employee@test.com",
        password_hash="hashed",
        full_name="Employee User",
        role="Member",
        cems_role=UserRole.EMPLOYEE.value,
    )
    recipient = User(
        email="recipient@test.com",
        password_hash="hashed",
        full_name="Recipient User",
        role="Member",
        cems_role=UserRole.EMPLOYEE.value,
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
    """Create a warehouse and assign the manager."""
    warehouse = Warehouse(
        id=uuid.uuid4(),
        name="Main Warehouse",
        location="Building A",
        current_manager_id=seed_users["manager"].id,
    )
    async_session.add(warehouse)
    await async_session.flush()

    # Link manager to warehouse via cems_warehouse_id
    seed_users["manager"].cems_warehouse_id = warehouse.id
    await async_session.flush()

    return {"warehouse": warehouse}


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
        current_warehouse_id=seed_warehouse["warehouse"].id,
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
        warehouse_id=seed_warehouse["warehouse"].id,
        quantity=Decimal("100.0000"),
        unit="pieces",
        low_stock_threshold=Decimal("10.0000"),
        reorder_quantity=Decimal("200.0000"),
    )
    async_session.add(item)
    await async_session.flush()
    return item
