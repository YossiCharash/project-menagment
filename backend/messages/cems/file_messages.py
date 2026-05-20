"""User-facing strings for file-upload validation."""


def unsupported_extension(allowed: list[str]) -> str:
    return f"סוג קובץ לא נתמך. מותרים: {', '.join(sorted(allowed))}"


UNSUPPORTED_PHOTO_EXTENSION = "סוג קובץ לא נתמך. מותרים: jpg, jpeg, png"


def file_too_large_mb(max_mb: int) -> str:
    return f"גודל קובץ מקסימלי: {max_mb} MB"


def photo_too_large_mb(max_mb: int) -> str:
    return f"גודל תמונה מקסימלי: {max_mb} MB"
