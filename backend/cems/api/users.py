from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import get_current_user, get_db
from backend.models.user import User
from backend.repositories.user_repository import UserRepository

router = APIRouter(prefix="/users", tags=["CEMS Users"])


class CemsUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    cems_role: str | None


@router.get("", response_model=List[CemsUserRead])
async def list_cems_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[CemsUserRead]:
    repo = UserRepository(db)
    users = await repo.list()
    return [CemsUserRead.model_validate(u) for u in users]
