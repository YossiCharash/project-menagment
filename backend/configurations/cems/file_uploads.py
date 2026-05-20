"""File-upload limits and allowed extensions for CEMS uploads."""

ALLOWED_PHOTO_EXTENSIONS: frozenset[str] = frozenset({".jpg", ".jpeg", ".png"})

ALLOWED_DOCUMENT_EXTENSIONS: frozenset[str] = frozenset(
    {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"}
)

MAX_PHOTO_SIZE_MB: int = 10
MAX_PHOTO_BYTES: int = MAX_PHOTO_SIZE_MB * 1024 * 1024

MAX_DOCUMENT_SIZE_MB: int = 20
MAX_DOCUMENT_BYTES: int = MAX_DOCUMENT_SIZE_MB * 1024 * 1024

ASSET_PHOTO_PREFIX: str = "asset_photos"
CONSUMABLE_PHOTO_PREFIX: str = "consumable_photos"
CATEGORY_IMAGE_PREFIX: str = "category_images"
DOCUMENT_PREFIX: str = "cems_documents"

DEFAULT_PHOTO_FILENAME: str = "photo"
DEFAULT_IMAGE_FILENAME: str = "image"
DEFAULT_DOCUMENT_FILENAME: str = "file"
