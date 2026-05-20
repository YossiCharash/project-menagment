"""User-facing strings related to authentication and user lookup."""

NOT_FOUND = "User not found."
NOT_AUTHENTICATED = "Not authenticated."
INVALID_TOKEN_PAYLOAD = "Invalid token payload."
INVALID_CREDENTIALS = "Could not validate credentials."
INACTIVE_OR_NOT_FOUND = "User not found or inactive."


def cems_role_required(allowed_roles: list[str]) -> str:
    return f"CEMS access requires one of: {sorted(allowed_roles)}."
