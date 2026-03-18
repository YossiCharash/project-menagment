import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


# ---------- Warehouse ----------

class WarehouseBase(BaseModel):
    name: str
    location: Optional[str] = None


class WarehouseCreate(WarehouseBase):
    current_manager_id: Optional[uuid.UUID] = None


class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None


class WarehouseRead(WarehouseBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    current_manager_id: Optional[uuid.UUID]
    project_ids: List[uuid.UUID] = []
    project_names: List[str] = []
    created_at: datetime
    updated_at: datetime


class WarehouseProjectsUpdate(BaseModel):
    project_ids: List[uuid.UUID]


# ---------- Manager change ----------

class ChangeManagerRequest(BaseModel):
    new_manager_id: uuid.UUID
    reason: Optional[str] = None


class ManagerHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    warehouse_id: uuid.UUID
    previous_manager_id: Optional[uuid.UUID]
    new_manager_id: uuid.UUID
    changed_by_id: uuid.UUID
    changed_at: datetime
    reason: Optional[str]


# ---------- Category ----------

class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None


class CategoryCreate(CategoryBase):
    pass


class CategoryRead(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ---------- Project ----------

class ProjectBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime
