"""Role-name constants used for CEMS access checks.

Strings are kept consistent with what is stored in
``User.role`` (main system) and ``User.cems_role`` (CEMS-specific).
"""

MAIN_ADMIN: str = "Admin"

CEMS_ADMIN: str = "Admin"
CEMS_MANAGER: str = "Manager"
CEMS_EMPLOYEE: str = "Employee"

ALL_CEMS_ROLES: tuple[str, ...] = (CEMS_ADMIN, CEMS_MANAGER, CEMS_EMPLOYEE)
ADMIN_OR_MANAGER: tuple[str, ...] = (CEMS_ADMIN, CEMS_MANAGER)
