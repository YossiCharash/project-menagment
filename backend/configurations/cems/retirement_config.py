"""Configuration constants for the retirement / archive workflow.

Keeps the *policy* (which roles can do what) out of the service code so a
product change does not require modifying the service.
"""

from __future__ import annotations

from typing import FrozenSet

from backend.models.cems_user import UserRole


class RetirementAuthorityPolicy:
    """Encapsulates the role-based policy for the retirement workflow.

    Single responsibility: answer the question
    "is this user allowed to approve a retirement / permanently delete an
    archived asset?" — without leaking the rule's representation.
    """

    # CEMS roles allowed to approve retirements OR permanently delete from the archive.
    _APPROVER_CEMS_ROLES: FrozenSet[str] = frozenset(
        {UserRole.ADMIN.value, UserRole.MANAGER.value}
    )

    # Main-system role that always grants approval/delete authority.
    _MAIN_ADMIN_ROLE: str = "Admin"

    @classmethod
    def can_approve(cls, main_role: str | None, cems_role: str | None) -> bool:
        """Return True when the role pair grants approval authority."""
        if main_role == cls._MAIN_ADMIN_ROLE:
            return True
        return cems_role in cls._APPROVER_CEMS_ROLES

    @classmethod
    def can_permanently_delete(
        cls, main_role: str | None, cems_role: str | None
    ) -> bool:
        """Hard-delete from the archive uses the same authority rule as approval."""
        return cls.can_approve(main_role, cems_role)
