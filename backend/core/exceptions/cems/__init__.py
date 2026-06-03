"""Custom exceptions raised by the CEMS service layer."""

from backend.core.exceptions.cems.retirement_exceptions import (
    ApprovalForbiddenError,
    ApproverNotFoundError,
    AssetNotEligibleForRetirementError,
    AssetNotFoundError,
    AssetNotInArchiveError,
    AssetPermanentDeleteForbiddenError,
    RetirementError,
    RetirementRequestNotFoundError,
    RetirementRequestNotPendingError,
)

__all__ = [
    "ApprovalForbiddenError",
    "ApproverNotFoundError",
    "AssetNotEligibleForRetirementError",
    "AssetNotFoundError",
    "AssetNotInArchiveError",
    "AssetPermanentDeleteForbiddenError",
    "RetirementError",
    "RetirementRequestNotFoundError",
    "RetirementRequestNotPendingError",
]
