"""User-facing error and audit messages for the Document domain."""

from __future__ import annotations


class DocumentErrorMessages:
    """Static registry of user-facing document error strings."""

    TRANSACTION_NOT_FOUND = "Transaction not found"
    DOCUMENT_NOT_FOUND = "Document not found"
    DOCUMENT_NOT_ON_TRANSACTION = "Document does not belong to this transaction"
    S3_DELETE_FAILED = "מחיקת קובץ מ-S3 נכשלה"
