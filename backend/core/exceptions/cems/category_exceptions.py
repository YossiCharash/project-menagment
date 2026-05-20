"""Exceptions raised by the category domain."""

from backend.core.exceptions.cems.base import (
    CEMSConflictError,
    CEMSNotFoundError,
    CEMSValidationError,
)
from backend.messages.cems import category_messages


class CategoryNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(category_messages.NOT_FOUND)


class ParentCategoryNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(category_messages.PARENT_NOT_FOUND)


class CategorySelfParentError(CEMSValidationError):
    def __init__(self) -> None:
        super().__init__(category_messages.SELF_PARENT)


class CategoryCycleDetectedError(CEMSValidationError):
    def __init__(self) -> None:
        super().__init__(category_messages.CYCLE_DETECTED)


class CategoryMaxDepthExceededError(CEMSValidationError):
    def __init__(self, max_depth: int) -> None:
        super().__init__(category_messages.max_depth_exceeded(max_depth))


class CategoryDescendantAsParentError(CEMSValidationError):
    def __init__(self) -> None:
        super().__init__(category_messages.DESCENDANT_AS_PARENT)


class CategoryHasItemsError(CEMSConflictError):
    def __init__(self) -> None:
        super().__init__(category_messages.HAS_ITEMS)
