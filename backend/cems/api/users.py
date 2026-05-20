import uuid
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import get_current_user, get_db, require_admin_or_manager
from backend.cems.core.exceptions import UserNotFoundError
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
        return cls(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            cems_role=user.cems_role,
            cems_warehouse_id=str(user.cems_warehouse_id) if user.cems_warehouse_id else None,
        )


class WarehouseAssignRequest(BaseModel):
    warehouse_id: uuid.UUID | None = None


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
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if user is None:
        raise UserNotFoundError()

    user.cems_warehouse_id = payload.warehouse_id
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return CemsUserRead.from_user(user)
