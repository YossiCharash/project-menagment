"""Compatibility shim.

All CEMS code that previously imported from this module should continue to
work without changes.  User is the shared project model; CemsUserRole is the
CEMS-specific role enum stored in User.cems_role.
"""

import enum

# Re-export the shared User model so existing imports are not broken
from backend.models.user import User  # noqa: F401


class CemsUserRole(str, enum.Enum):
    """Valid values for User.cems_role."""

    ADMIN = "Admin"
    MANAGER = "Manager"
    EMPLOYEE = "Employee"


# Keep the old name so existing code (services, tests) compiles unchanged
UserRole = CemsUserRole
