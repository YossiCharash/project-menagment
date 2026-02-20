# [PermSys-Core-003]
"""Enumerations for the IAM subsystem.

These enums define the vocabulary of the permissions system: actions users
can perform, types of resources that can be protected, and role tiers at
both the global and project levels.

Extension point: To add a new action or resource type, add a member to the
relevant enum below. No other files need to change -- the engine matches
on string values.
"""

from __future__ import annotations

from enum import Enum


class Action(str, Enum):
    """Actions a subject can perform on a resource.

    The base set covers CRUD. Custom domain actions can be added here
    without modifying the engine or decorator logic.
    """

    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    CREATE = "create"
    UPDATE = "update"
    MANAGE = "manage"          # administrative actions (settings, roles)
    EXPORT = "export"          # export / download reports
    APPROVE = "approve"        # approve transactions, budgets, etc.
    ASSIGN = "assign"          # assign tasks, set manager, etc.
    INVITE = "invite"          # invite members to project / system
    ARCHIVE = "archive"        # archive a project or contract


class ResourceType(str, Enum):
    """Types of resources protected by IAM.

    Adding a new resource type here is sufficient -- the engine resolves
    permissions by matching this string value against stored policies.
    """

    PROJECT = "project"
    TRANSACTION = "transaction"
    RECURRING_TRANSACTION = "recurring_transaction"
    BUDGET = "budget"
    REPORT = "report"
    USER = "user"
    SUPPLIER = "supplier"
    TASK = "task"
    CATEGORY = "category"
    AUDIT_LOG = "audit_log"
    FUND = "fund"
    CONTRACT = "contract"
    QUOTE = "quote"
    UNFORESEEN_TRANSACTION = "unforeseen_transaction"
    MEMBER_INVITE = "member_invite"
    ADMIN_INVITE = "admin_invite"
    NOTIFICATION = "notification"
    SYSTEM = "system"            # system-wide settings / configuration


class GlobalRole(str, Enum):
    """System-wide roles that apply across all projects.

    These map directly to the existing ``UserRole`` enum in models/user.py
    and extend it with a SuperAdmin tier that is seeded at startup.
    """

    SUPER_ADMIN = "SuperAdmin"
    ADMIN = "Admin"
    MEMBER = "Member"


class ProjectRole(str, Enum):
    """Project-scoped roles assigned per project.

    A user can hold different project roles across different projects.
    """

    MANAGER = "ProjectManager"
    CONTRIBUTOR = "ProjectContributor"
    VIEWER = "ProjectViewer"
