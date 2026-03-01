"""
Tenant provisioning service.

Handles the full lifecycle of a tenant: creation (with its own PostgreSQL
database), suspension, activation, soft-deletion, and stats retrieval.

Design notes
------------
- Single Responsibility: this service owns only tenant lifecycle operations.
- Open/Closed: new lifecycle actions (e.g. ``archive``) can be added as new
  methods without modifying existing ones.
- Dependency Inversion: the caller provides the master ``AsyncSession``
  via dependency injection; this service never creates its own sessions.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict
from urllib.parse import urlparse

import asyncpg
from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.core.config import settings
from backend.core.security import hash_password
from backend.db.init_db import init_database
from backend.db.tenant_registry import TenantRegistry
from backend.models.tenant import Tenant
from backend.models.user import User

logger = logging.getLogger(__name__)

_SLUG_PATTERN = re.compile(r"[^a-z0-9-]")


def _slugify(name: str) -> str:
    """Convert a human-readable name into a URL-safe slug."""
    slug = name.lower().strip()
    slug = slug.replace(" ", "-")
    slug = _SLUG_PATTERN.sub("", slug)
    # collapse consecutive hyphens
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug


def _asyncpg_dsn_from_master_url() -> str:
    """Derive a plain asyncpg DSN (no SQLAlchemy driver prefix) from the master URL."""
    parsed = urlparse(settings.MASTER_DATABASE_URL)
    # Replace scheme ``postgresql+asyncpg`` with ``postgresql``
    return parsed._replace(scheme="postgresql").geturl()


def _build_tenant_engine_url(db_name: str) -> str:
    """Build a SQLAlchemy async URL for a tenant database."""
    parsed = urlparse(settings.MASTER_DATABASE_URL)
    return parsed._replace(path=f"/{db_name}").geturl()


class TenantProvisionerService:
    """Encapsulates all tenant provisioning operations."""

    # -- Creation ---------------------------------------------------------

    async def provision(
        self,
        name: str,
        email: str,
        password: str,
        master_db: AsyncSession,
    ) -> Dict[str, Any]:
        """Create a new tenant: database, schema, admin user, and master record."""
        slug = await self._unique_slug(name, master_db)
        db_name = f"bms_tenant_{slug.replace('-', '_')}"

        await self._create_postgres_database(db_name)
        tenant_engine_url = _build_tenant_engine_url(db_name)

        tenant_engine = create_async_engine(
            tenant_engine_url, echo=False, future=True
        )
        try:
            await init_database(tenant_engine)
            await self._create_initial_admin(tenant_engine, name, email, password)
        finally:
            await tenant_engine.dispose()

        tenant = Tenant(
            slug=slug,
            name=name,
            email=email,
            db_name=db_name,
            status="active",
        )
        master_db.add(tenant)
        await master_db.flush()

        logger.info("Provisioned tenant '%s' (db=%s)", slug, db_name)
        return {
            "slug": slug,
            "db_name": db_name,
            "login_url": f"/?tenant={slug}",
        }

    # -- Status lifecycle -------------------------------------------------

    async def suspend_tenant(self, slug: str, master_db: AsyncSession) -> None:
        tenant = await self._get_tenant_or_raise(slug, master_db)
        tenant.status = "suspended"
        await master_db.flush()
        TenantRegistry.get_instance().evict(slug)
        logger.info("Suspended tenant '%s'", slug)

    async def activate_tenant(self, slug: str, master_db: AsyncSession) -> None:
        tenant = await self._get_tenant_or_raise(slug, master_db)
        tenant.status = "active"
        await master_db.flush()
        logger.info("Activated tenant '%s'", slug)

    async def delete_tenant(self, slug: str, master_db: AsyncSession) -> None:
        """Soft-delete: marks status as ``deleted`` but preserves the database."""
        tenant = await self._get_tenant_or_raise(slug, master_db)
        tenant.status = "deleted"
        await master_db.flush()
        TenantRegistry.get_instance().evict(slug)
        logger.info("Soft-deleted tenant '%s'", slug)

    # -- Stats ------------------------------------------------------------

    async def get_tenant_stats(
        self, slug: str, master_db: AsyncSession
    ) -> Dict[str, Any]:
        tenant = await self._get_tenant_or_raise(slug, master_db)

        registry = TenantRegistry.get_instance()
        async with registry.get_session(tenant.db_name) as session:
            user_count_result = await session.execute(
                text("SELECT COUNT(*) FROM users")
            )
            user_count: int = user_count_result.scalar_one()

            project_count_result = await session.execute(
                text("SELECT COUNT(*) FROM projects")
            )
            project_count: int = project_count_result.scalar_one()

        return {
            "slug": tenant.slug,
            "name": tenant.name,
            "email": tenant.email,
            "status": tenant.status,
            "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
            "user_count": user_count,
            "project_count": project_count,
        }

    # -- Private helpers --------------------------------------------------

    async def _unique_slug(self, name: str, master_db: AsyncSession) -> str:
        """Generate a slug, appending ``-N`` if a collision exists."""
        base_slug = _slugify(name)
        if not base_slug:
            base_slug = "tenant"

        slug = base_slug
        suffix = 1
        while True:
            stmt = select(func.count()).select_from(Tenant).where(Tenant.slug == slug)
            result = await master_db.execute(stmt)
            if result.scalar_one() == 0:
                return slug
            suffix += 1
            slug = f"{base_slug}-{suffix}"

    @staticmethod
    async def _create_postgres_database(db_name: str) -> None:
        """Create a new PostgreSQL database using asyncpg (autocommit)."""
        dsn = _asyncpg_dsn_from_master_url()
        conn = await asyncpg.connect(dsn=dsn)
        try:
            # asyncpg connections are in autocommit mode by default
            await conn.execute(f'CREATE DATABASE "{db_name}"')
            logger.info("Created PostgreSQL database: %s", db_name)
        finally:
            await conn.close()

    @staticmethod
    async def _create_initial_admin(
        tenant_engine, name: str, email: str, password: str
    ) -> None:
        """Insert the first Admin user into the newly-created tenant database."""
        session_factory = async_sessionmaker(
            bind=tenant_engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
        async with session_factory() as session:
            admin = User(
                email=email,
                full_name=name,
                role="Admin",
                password_hash=hash_password(password),
                is_active=True,
            )
            session.add(admin)
            await session.commit()

    @staticmethod
    async def _get_tenant_or_raise(
        slug: str, master_db: AsyncSession
    ) -> Tenant:
        stmt = select(Tenant).where(Tenant.slug == slug)
        result = await master_db.execute(stmt)
        tenant = result.scalar_one_or_none()
        if tenant is None:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tenant '{slug}' not found",
            )
        return tenant
