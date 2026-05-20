"""Exceptions raised during file-upload validation."""

from typing import Iterable

from backend.core.exceptions.cems.base import CEMSValidationError
from backend.messages.cems import file_messages


class UnsupportedFileExtensionError(CEMSValidationError):
    def __init__(
        self,
        allowed: Iterable[str] | None = None,
        *,
        photo_only: bool = False,
    ) -> None:
        if photo_only:
            detail = file_messages.UNSUPPORTED_PHOTO_EXTENSION
        else:
            detail = file_messages.unsupported_extension(list(allowed or []))
        super().__init__(detail)


class FileTooLargeError(CEMSValidationError):
    def __init__(self, max_mb: int, *, is_photo: bool = False) -> None:
        detail = (
            file_messages.photo_too_large_mb(max_mb)
            if is_photo
            else file_messages.file_too_large_mb(max_mb)
        )
        super().__init__(detail)
