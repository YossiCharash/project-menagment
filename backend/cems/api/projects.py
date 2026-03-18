"""Read-only CEMS projects endpoint.

Projects are managed in the main system. This endpoint exposes active
projects from the shared ``projects`` table for use in CEMS forms
(e.g. assigning a fixed-asset or consumption-log to a project).
"""

from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.cems.api.deps import get_current_user, get_db
from backend.models.project import Project
from backend.models.user import User

router = APIRouter(prefix="/projects", tags=["CEMS Projects"])


class ProjectRead(BaseModel):
    """Lightweight projection of the main-system Project model."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_active: bool


@router.get("", response_model=List[ProjectRead])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ProjectRead]:
    """Return all active projects from the main system, ordered by name."""
    result = await db.execute(
        select(Project)
        .where(Project.is_active == True)  # noqa: E712
        .order_by(Project.name)
    )
    projects = result.scalars().all()
    return [ProjectRead.model_validate(p) for p in projects]
