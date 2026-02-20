# [PermSys-Config-001]
"""
Identity & Access Management (IAM) Package for BMS Project Management System.

This package provides a multi-level, extensible permissions management system
built on SOLID principles. It supports:

- Global-level roles (SuperAdmin, Admin, Member)
- Project-level roles (ProjectManager, ProjectViewer, ProjectContributor)
- Resource-level permissions (fine-grained per-object access)
- Extensible action types (READ, WRITE, DELETE, plus custom actions)

Architecture:
    iam/
        interfaces.py      - Abstract base classes (ABCs) for all contracts
        enums.py           - Action types, role enums, resource types
        models.py          - SQLAlchemy ORM models for permissions data
        schemas.py         - Pydantic v2 DTOs for request/response
        repository.py      - Data access layer (depends on interfaces)
        engine.py          - Core PermissionsEngine service
        decorators.py      - @require_permission decorator for FastAPI
        exceptions.py      - Custom exception hierarchy
        middleware.py      - FastAPI middleware for permission context
"""

from backend.iam.enums import Action, ResourceType, GlobalRole, ProjectRole
from backend.iam.exceptions import (
    PermissionDeniedError,
    IAMError,
    RoleNotFoundError,
    InvalidAssignmentError,
)
from backend.iam.engine import PermissionsEngine
from backend.iam.decorators import require_permission

__all__ = [
    # Enums
    "Action",
    "ResourceType",
    "GlobalRole",
    "ProjectRole",
    # Engine
    "PermissionsEngine",
    # Decorators
    "require_permission",
    # Exceptions
    "PermissionDeniedError",
    "IAMError",
    "RoleNotFoundError",
    "InvalidAssignmentError",
]
