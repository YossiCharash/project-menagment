"""Auth-related transport constants for CEMS dependencies."""

OAUTH2_TOKEN_URL: str = "/api/v1/auth/login"
WWW_AUTHENTICATE_BEARER: dict[str, str] = {"WWW-Authenticate": "Bearer"}
