"""Exceptions raised by the document-upload domain."""

from backend.core.exceptions.cems.base import CEMSNotFoundError, CEMSPermissionError
from backend.messages.cems import document_messages


class DocumentNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(document_messages.NOT_FOUND)


class FileNotOnDiskError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(document_messages.FILE_NOT_ON_DISK)


class DocumentDeleteForbiddenError(CEMSPermissionError):
    def __init__(self) -> None:
        super().__init__(document_messages.DELETE_FORBIDDEN)
