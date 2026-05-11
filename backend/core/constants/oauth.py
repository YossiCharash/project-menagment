"""OAuth protocol constants — query-parameter names and fixed tokens.

These are part of the OAuth wire contract with the frontend, not runtime
settings, so they live in the constants module rather than `Settings`.
"""

REDIRECT_URL_QUERY_PARAM = "redirect_url"
TOKEN_QUERY_PARAM = "token"
REFRESH_TOKEN_QUERY_PARAM = "refresh_token"
TOKEN_TYPE_QUERY_PARAM = "type"
ERROR_QUERY_PARAM = "error"
BEARER_TOKEN_TYPE = "bearer"
