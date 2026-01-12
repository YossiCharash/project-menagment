"""
Pytest configuration and fixtures for backend tests
"""
import pytest
import asyncio
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from httpx import AsyncClient, ASGITransport

from backend.main import create_app
from backend.db.base import Base
from backend.models.user import User
from backend.repositories.user_repository import UserRepository
from backend.core.security import get_password_hash


# Test database URL - use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def test_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Create a test database session with in-memory SQLite.
    Each test gets a fresh database.
    """
    # Create test engine
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create session
    async_session = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as session:
        yield session
        await session.rollback()
    
    # Drop all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest.fixture
async def test_client(test_db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Create a test client with dependency override for database.
    """
    app = create_app()
    
    # Override database dependency
    async def override_get_db():
        yield test_db
    
    from backend.db.session import get_db
    app.dependency_overrides[get_db] = override_get_db
    
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client
    
    app.dependency_overrides.clear()


@pytest.fixture
async def admin_user(test_db: AsyncSession) -> User:
    """Create an admin user for testing."""
    user_repo = UserRepository(test_db)
    user = await user_repo.create({
        "email": "admin@test.com",
        "password": get_password_hash("testpass123"),
        "full_name": "Test Admin",
        "role": "Admin",
        "is_active": True,
        "is_verified": True,
    })
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture
async def member_user(test_db: AsyncSession) -> User:
    """Create a member user for testing."""
    user_repo = UserRepository(test_db)
    user = await user_repo.create({
        "email": "member@test.com",
        "password": get_password_hash("testpass123"),
        "full_name": "Test Member",
        "role": "Member",
        "is_active": True,
        "is_verified": True,
    })
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture
async def admin_token(test_client: AsyncClient, admin_user: User) -> str:
    """Get authentication token for admin user."""
    response = await test_client.post(
        "/api/v1/auth/login",
        json={"email": "admin@test.com", "password": "testpass123"}
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture
async def member_token(test_client: AsyncClient, member_user: User) -> str:
    """Get authentication token for member user."""
    response = await test_client.post(
        "/api/v1/auth/login",
        json={"email": "member@test.com", "password": "testpass123"}
    )
    assert response.status_code == 200
    return response.json()["access_token"]
