from functools import lru_cache
from pydantic import BaseModel, Field, model_validator, ConfigDict
import os
from dotenv import load_dotenv

# Load environment variables from a .env file if present
# Try to load from backend directory first, then root directory
import pathlib
backend_dir = pathlib.Path(__file__).parent.parent
env_path = backend_dir / ".env"
if not env_path.exists():
    # Try root directory
    root_dir = backend_dir.parent
    env_path = root_dir / ".env"

if env_path.exists():
    load_dotenv(dotenv_path=env_path, encoding='utf-8')
else:
    load_dotenv()  # Try default location


# Placeholder credentials used only when the matching environment variable is
# absent. They are intentionally non-secret so that no real credential ever
# lives in version control; ``Settings.validate_security`` refuses to start the
# application in production while any of them is still in effect.
DEV_JWT_SECRET_KEY = "dev-only-insecure-jwt-secret"
DEV_SUPER_ADMIN_EMAIL = "admin@example.invalid"
DEV_SUPER_ADMIN_PASSWORD = "dev-only-insecure-password"


def _normalize_database_uri(uri: str) -> str:
    """Ensure async driver is used. Render and others provide postgres://."""
    if "asyncpg" in uri:
        return uri
    if uri.startswith("postgres://"):
        return "postgresql+asyncpg://" + uri[len("postgres://") :]
    if uri.startswith("postgresql://"):
        return "postgresql+asyncpg://" + uri[len("postgresql://") :]
    return uri


class Settings(BaseModel):
    API_V1_STR: str = "/api/v1"
    SQLALCHEMY_DATABASE_URI: str = Field(
        default=_normalize_database_uri(
            os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/bms")
        )
    )
    JWT_SECRET_KEY: str = Field(default=os.getenv("JWT_SECRET_KEY", DEV_JWT_SECRET_KEY))
    
    @property
    def is_production(self) -> bool:
        return os.getenv("ENVIRONMENT", "development").lower() == "production"

    def validate_security(self):
        """Validate that security-critical settings are properly configured."""
        import logging
        logger = logging.getLogger(__name__)

        if self.is_production:
            if self.JWT_SECRET_KEY == DEV_JWT_SECRET_KEY:
                raise ValueError("CRITICAL: JWT_SECRET_KEY must be set in production!")
            if self.SUPER_ADMIN_PASSWORD == DEV_SUPER_ADMIN_PASSWORD:
                raise ValueError("CRITICAL: SUPER_ADMIN_PASSWORD must be set in production!")
            if self.SUPER_ADMIN_EMAIL == DEV_SUPER_ADMIN_EMAIL:
                # Warning rather than a hard failure so an unset variable cannot
                # block a deploy. create_super_admin() refuses to seed an account
                # under the placeholder address, so no bogus admin is created.
                logger.warning(
                    "SUPER_ADMIN_EMAIL is unset; super-admin seeding is disabled in production."
                )
            if len(self.JWT_SECRET_KEY) < 32:
                logger.warning("JWT_SECRET_KEY is shorter than 32 characters. Consider using a longer key.")
        else:
            if self.JWT_SECRET_KEY == DEV_JWT_SECRET_KEY:
                logger.warning("Using placeholder JWT_SECRET_KEY. Set it before deploying to production.")

    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    CORS_ORIGINS: list[str] = [
        origin.strip().rstrip("/") for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,https://www.ziposystem.co.il,https://ziposystem.co.il,https://bms-project-frontend.onrender.com"
        ).split(",") if origin.strip()
    ]

    @model_validator(mode='after')
    def ensure_dev_origins(self):
        """Ensure localhost dev origins are allowed when using default CORS (e.g. local dev against Render)."""
        dev_origins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"]
        for origin in dev_origins:
            if origin not in self.CORS_ORIGINS:
                self.CORS_ORIGINS.append(origin)
        return self

    @model_validator(mode='after')
    def ensure_ziposystem_domains(self):
        """Ensure both www and non-www versions of ziposystem.co.il are included"""
        ziposystem_domains = ["https://www.ziposystem.co.il", "https://ziposystem.co.il"]
        # Use simple string checks to avoid codec issues during list comprehension/append
        for domain in ziposystem_domains:
             if domain not in self.CORS_ORIGINS:
                 self.CORS_ORIGINS.append(domain)
        return self

    @model_validator(mode='after')
    def check_security_settings(self):
        """Warn if using default insecure settings"""
        import logging
        logger = logging.getLogger(__name__)

        if self.JWT_SECRET_KEY == DEV_JWT_SECRET_KEY:
            logger.warning("Using placeholder JWT_SECRET_KEY. This is insecure for production!")

        if self.SUPER_ADMIN_PASSWORD == DEV_SUPER_ADMIN_PASSWORD:
            logger.warning("Using placeholder SUPER_ADMIN_PASSWORD. Set it for production!")

        return self

    FILE_UPLOAD_DIR: str = os.getenv("FILE_UPLOAD_DIR", "./uploads")

    # AWS S3 configuration (for documents and project images)
    AWS_ACCESS_KEY_ID: str | None = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: str | None = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_REGION: str = os.getenv("AWS_REGION", "eu-central-1")
    AWS_S3_BUCKET: str | None = os.getenv("AWS_S3_BUCKET")
    # Optional custom base URL (e.g. CloudFront). If not set, default S3 URL will be used.
    AWS_S3_BASE_URL: str | None = os.getenv("AWS_S3_BASE_URL")
    # Lifetime of the signed attachment links handed to the browser. Objects are
    # private, so links are signed at read time rather than stored public. Long
    # enough to open/download a file, short enough that a leaked link goes stale.
    AWS_S3_PRESIGNED_URL_TTL_SECONDS: int = int(
        os.getenv("AWS_S3_PRESIGNED_URL_TTL_SECONDS", "3600")
    )
    
    # Super Admin Configuration
    SUPER_ADMIN_EMAIL: str = Field(default=os.getenv("SUPER_ADMIN_EMAIL", DEV_SUPER_ADMIN_EMAIL))
    SUPER_ADMIN_PASSWORD: str = Field(default=os.getenv("SUPER_ADMIN_PASSWORD", DEV_SUPER_ADMIN_PASSWORD))
    SUPER_ADMIN_NAME: str = Field(default=os.getenv("SUPER_ADMIN_NAME", "Super Administrator"))
    
    # Email Configuration
    SMTP_SERVER: str = Field(default=os.getenv("SMTP_SERVER", "smtp.gmail.com"))
    SMTP_PORT: int = Field(default=int(os.getenv("SMTP_PORT", "") or "587"))
    SMTP_USERNAME: str = Field(default=os.getenv("SMTP_USERNAME", ""))
    SMTP_PASSWORD: str = Field(default=os.getenv("SMTP_PASSWORD", ""))
    # FROM_EMAIL defaults to SMTP_USERNAME if not set (handled in EmailService)
    FROM_EMAIL: str = Field(default=os.getenv("FROM_EMAIL", ""))
    FRONTEND_URL: str = Field(default=os.getenv("FRONTEND_URL", "https://ziposystem.co.il"))
    
    # Google OAuth Configuration
    GOOGLE_CLIENT_ID: str = Field(default=os.getenv("GOOGLE_CLIENT_ID", ""))
    GOOGLE_CLIENT_SECRET: str = Field(default=os.getenv("GOOGLE_CLIENT_SECRET", ""))
    GOOGLE_REDIRECT_URI: str = Field(default=os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/auth/google/callback"))

    # Microsoft / Outlook Calendar Sync (Azure AD app)
    MICROSOFT_CLIENT_ID: str = Field(default=os.getenv("MICROSOFT_CLIENT_ID", ""))
    MICROSOFT_CLIENT_SECRET: str = Field(default=os.getenv("MICROSOFT_CLIENT_SECRET", ""))
    MICROSOFT_REDIRECT_URI: str = Field(default=os.getenv("MICROSOFT_REDIRECT_URI", "http://localhost:8000/api/v1/outlook/callback"))

    # ── Error alerting via WhatsApp (Green API) + Claude AI ─────────────────
    ERROR_ALERTS_ENABLED: bool = Field(
        default=os.getenv("ERROR_ALERTS_ENABLED", "false").lower() == "true"
    )
    # Green API instance ID (from green-api.com dashboard)
    GREEN_API_INSTANCE_ID: str = Field(default=os.getenv("GREEN_API_INSTANCE_ID", ""))
    # Green API token (from green-api.com dashboard)
    GREEN_API_TOKEN: str = Field(default=os.getenv("GREEN_API_TOKEN", ""))
    # Your WhatsApp number to receive alerts (international format, no +)
    ALERT_PHONE: str = Field(default=os.getenv("ALERT_PHONE", ""))
    # Anthropic API key for Claude-based error analysis
    ANTHROPIC_API_KEY: str = Field(default=os.getenv("ANTHROPIC_API_KEY", ""))

    model_config = ConfigDict(arbitrary_types_allowed=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
