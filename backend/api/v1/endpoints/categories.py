"""
Categories HTTP endpoints.

This module is a thin HTTP adapter over ``CategoryService``. It never imports
repositories or SQLAlchemy directly, and every handler does exactly four
things: parse the request, call one service method, map domain exceptions to
``HTTPException``, and return a Pydantic-validated response.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.core.deps import DBSessionDep, get_current_user
from backend.iam.decorators import require_permission
from backend.schemas.category import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    SupplierWithTransactionCountOut,
)
from backend.schemas.common import MessageResponse
from backend.services.category_service import (
    CategoryService,
    DUPLICATE_NAME_UNDER_PARENT_MSG,
)
from backend.services.exceptions import (
    DependencyExistsError,
    DuplicateEntityError,
    EntityNotFoundError,
    ValidationError,
)

router = APIRouter()


def _raise_duplicate_name_as_422(exc: DuplicateEntityError, input_value: str) -> None:
    """Preserve the legacy 422 ``loc``-style payload for duplicate category names."""
    raise HTTPException(
        status_code=422,
        detail=[
            {
                "type": "value_error",
                "loc": ["body", "name"],
                "msg": str(exc),
                "input": input_value,
            }
        ],
    )


@router.get("/", response_model=list[CategoryOut])
async def list_categories(
    db: DBSessionDep,
    include_inactive: bool = Query(False),
    tree: bool = Query(False, description="Return as tree structure (only top-level parents)"),
    user=Depends(get_current_user),
):
    """List categories (flat or tree), optionally including inactive ones."""
    return await CategoryService(db).list_categories(
        include_inactive=include_inactive, as_tree=tree
    )


@router.get("/{category_id}", response_model=CategoryOut)
async def get_category(
    category_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """Get a single category by id."""
    try:
        return await CategoryService(db).get_category_by_id(category_id)
    except EntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get(
    "/{category_id}/suppliers",
    response_model=list[SupplierWithTransactionCountOut],
)
async def get_category_suppliers(
    category_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """List suppliers attached to the category with their transaction counts."""
    try:
        return await CategoryService(
            db
        ).get_suppliers_with_transaction_counts_for_category(category_id)
    except EntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/", response_model=CategoryOut)
async def create_category(
    data: CategoryCreate,
    db: DBSessionDep,
    user=Depends(require_permission("write", "category", project_id_param=None)),
):
    """Create a new category."""
    try:
        return await CategoryService(db).create_category(data, user.id)
    except EntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except DuplicateEntityError as exc:
        if str(exc) == DUPLICATE_NAME_UNDER_PARENT_MSG:
            _raise_duplicate_name_as_422(exc, data.name)
        raise HTTPException(status_code=422, detail=str(exc))
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: DBSessionDep,
    user=Depends(
        require_permission(
            "update", "category", resource_id_param="category_id", project_id_param=None
        )
    ),
):
    """Update a category (only ``is_active`` is editable)."""
    try:
        return await CategoryService(db).update_category(category_id, data, user.id)
    except EntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{category_id}", response_model=MessageResponse)
async def delete_category(
    category_id: int,
    db: DBSessionDep,
    user=Depends(
        require_permission(
            "delete", "category", resource_id_param="category_id", project_id_param=None
        )
    ),
):
    """Hard-delete a category if no dependent rows still reference it."""
    try:
        await CategoryService(db).delete_category(category_id, user.id)
    except EntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except DependencyExistsError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return MessageResponse(message="Category deleted successfully")
