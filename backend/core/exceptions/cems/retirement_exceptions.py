"""Domain exceptions for the CEMS retirement / archive workflow.

Each exception carries:
- ``http_status``: The HTTP status the API layer should translate to.
- ``detail``: A user-facing Hebrew message (sourced from
  ``backend.messages.cems.retirement_messages``).

Services raise the domain exception; the API translates it to
``HTTPException`` so the service layer remains framework-agnostic.
"""

from __future__ import annotations

from backend.messages.cems.retirement_messages import RetirementErrorMessages


class RetirementError(Exception):
    """Base class for all retirement / archive workflow errors."""

    http_status: int = 400
    detail: str = ""

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.detail)
        if detail is not None:
            self.detail = detail


class AssetNotFoundError(RetirementError):
    """Raised when the targeted asset does not exist."""

    http_status = 404
    detail = RetirementErrorMessages.ASSET_NOT_FOUND


class AssetNotEligibleForRetirementError(RetirementError):
    """Raised when the asset's status forbids creating a retirement request."""

    http_status = 409
    detail = RetirementErrorMessages.ASSET_NOT_ELIGIBLE_FOR_RETIREMENT


class RetirementRequestNotFoundError(RetirementError):
    """Raised when the targeted retirement request row does not exist."""

    http_status = 404
    detail = RetirementErrorMessages.RETIREMENT_REQUEST_NOT_FOUND


class RetirementRequestNotPendingError(RetirementError):
    """Raised when attempting to approve/reject a non-pending request."""

    http_status = 409
    detail = RetirementErrorMessages.RETIREMENT_REQUEST_NOT_PENDING


class ApproverNotFoundError(RetirementError):
    """Raised when the user attempting approval cannot be loaded."""

    http_status = 404
    detail = RetirementErrorMessages.APPROVER_USER_NOT_FOUND


class ApprovalForbiddenError(RetirementError):
    """Raised when the approver lacks the required Admin/Manager role."""

    http_status = 403
    detail = RetirementErrorMessages.APPROVAL_FORBIDDEN


class AssetNotInArchiveError(RetirementError):
    """Raised when a hard-delete targets an asset that is not RETIRED."""

    http_status = 409
    detail = RetirementErrorMessages.ASSET_NOT_IN_ARCHIVE


class AssetPermanentDeleteForbiddenError(RetirementError):
    """Raised when the caller is not allowed to permanently delete from archive."""

    http_status = 403
    detail = RetirementErrorMessages.PERMANENT_DELETE_FORBIDDEN
