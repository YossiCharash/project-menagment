# [PermSys-Alpha-004]
"""Abstract base classes defining the contracts for the IAM subsystem.

Business logic (engine, decorators) depends ONLY on these abstractions,
never on concrete implementations. This satisfies the Dependency Inversion
Principle and allows swapping storage backends (PostgreSQL, SQLite for
tests, in-memory) without touching the engine.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Sequence


class PermissionProvider(ABC):
    """Resolves whether a user holds a specific permission.

    Implementations may consult a database, an in-memory cache, or an
    external policy engine (e.g. Casbin, OPA).
    """

    @abstractmethod
    async def has_permission(
        self,
        user_id: int,
        action: str,
        resource_type: str,
        resource_id: int | str | None = None,
        domain: str | None = None,
    ) -> bool:
        """Return True if *user_id* is allowed to perform *action* on the
        given *resource_type* (optionally scoped to *resource_id* and/or
        *domain*).  Must never raise on missing users/resources -- return
        False instead.
        """
        ...

    @abstractmethod
    async def get_user_permissions(
        self,
        user_id: int,
        domain: str | None = None,
    ) -> list[dict[str, str]]:
        """Return all permission entries for a user, optionally within a domain."""
        ...


class RoleRepository(ABC):
    """Persistence abstraction for role assignments."""

    @abstractmethod
    async def get_user_global_role(self, user_id: int) -> str | None:
        """Return the global role name for a user, or None."""
        ...

    @abstractmethod
    async def get_user_project_roles(
        self, user_id: int, project_id: int | None = None
    ) -> list[dict[str, str | int]]:
        """Return project-role mappings for a user.

        If *project_id* is provided, filter to that project only.
        Each dict contains at least ``{"project_id": ..., "role": ...}``.
        """
        ...

    @abstractmethod
    async def assign_project_role(
        self, user_id: int, project_id: int, role: str
    ) -> None:
        """Assign a project-scoped role to a user."""
        ...

    @abstractmethod
    async def revoke_project_role(
        self, user_id: int, project_id: int, role: str
    ) -> None:
        """Revoke a project-scoped role from a user."""
        ...

    @abstractmethod
    async def get_project_members(
        self, project_id: int
    ) -> Sequence[dict[str, str | int]]:
        """Return all users assigned to a project with their roles."""
        ...


class PolicyAdapter(ABC):
    """Adapter for loading / persisting raw policy rules.

    Useful when integrating with Casbin CSV files or external stores.
    """

    @abstractmethod
    async def load_policy(self) -> list[list[str]]:
        """Load all policy rules as a list of string tuples."""
        ...

    @abstractmethod
    async def save_policy(self, rules: list[list[str]]) -> None:
        """Persist the full set of policy rules (replacing previous state)."""
        ...

    @abstractmethod
    async def add_rule(self, rule: list[str]) -> None:
        """Add a single policy rule."""
        ...

    @abstractmethod
    async def remove_rule(self, rule: list[str]) -> None:
        """Remove a single policy rule."""
        ...
