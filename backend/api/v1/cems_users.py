import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.v1.cems_deps import get_current_user, get_db, require_admin_or_manager
from backend.models.user import User
from backend.repositories.user_repository import UserRepository

router = APIRouter(prefix="/users", tags=["CEMS Users"])


class CemsUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    cems_role: str | None
    cems_warehouse_id: str | None

    @classmethod
    def from_user(cls, user: User) -> "CemsUserRead":
        """Build a read schema from a User ORM instance, serialising UUID to string."""
        return cls(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            cems_role=user.cems_role,
            cems_warehouse_id=str(user.cems_warehouse_id) if user.cems_warehouse_id else None,
        )


class WarehouseAssignRequest(BaseModel):
    """Payload to assign (or unassign) an employee to a warehouse."""
    warehouse_id: uuid.UUID | None = None  # None = unassign


@router.get("", response_model=List[CemsUserRead])
async def list_cems_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[CemsUserRead]:
    repo = UserRepository(db)
    users = await repo.list()
    return [CemsUserRead.from_user(u) for u in users]


@router.put("/{user_id}/warehouse", response_model=CemsUserRead)
async def assign_employee_warehouse(
    user_id: int,
    payload: WarehouseAssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_manager),
) -> CemsUserRead:
    """Assign (or unassign) an employee to a specific warehouse.

    Only admins and managers are allowed to perform this action.
    """
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.cems_warehouse_id = payload.warehouse_id
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return CemsUserRead.from_user(user)
