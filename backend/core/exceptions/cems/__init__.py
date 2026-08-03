"""Custom exceptions raised by the CEMS service layer."""

from backend.core.exceptions.cems.asset_exceptions import (
    AssetCategoryNotFoundError,
    AssetCreationError,
    AssetNameRequiredError,
    DuplicateSerialNumberError,
)
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
    "AssetCategoryNotFoundError",
    "AssetCreationError",
    "AssetNameRequiredError",
    "AssetNotEligibleForRetirementError",
    "AssetNotFoundError",
    "AssetNotInArchiveError",
    "AssetPermanentDeleteForbiddenError",
    "DuplicateSerialNumberError",
    "RetirementError",
    "RetirementRequestNotFoundError",
    "RetirementRequestNotPendingError",
]
