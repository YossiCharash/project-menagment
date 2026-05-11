"""OAuth provider abstractions and concrete implementations."""
from backend.services.oauth.base import OAuthProvider
from backend.services.oauth.google_provider import GoogleOAuthProvider

__all__ = ["OAuthProvider", "GoogleOAuthProvider"]
