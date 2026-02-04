"""Employee API endpoints for Task Management Calendar."""
from fastapi import APIRouter, Depends, HTTPException

from backend.core.deps import DBSessionDep, get_current_user
from backend.repositories.employee_repository import EmployeeRepository
from backend.schemas.employee import EmployeeCreate, EmployeeOut, EmployeeUpdate
from backend.models.employee import Employee

router = APIRouter()


@router.get("/", response_model=list[EmployeeOut])
async def list_employees(db: DBSessionDep, user=Depends(get_current_user)):
    """List all active employees."""
    repo = EmployeeRepository(db)
    employees = await repo.list(active_only=True)
    return employees


@router.post("/", response_model=EmployeeOut)
async def create_employee(
    data: EmployeeCreate, db: DBSessionDep, user=Depends(get_current_user)
):
    """Create a new employee."""
    emp = Employee(**data.model_dump())
    repo = EmployeeRepository(db)
    return await repo.create(emp)


@router.put("/{employee_id}", response_model=EmployeeOut)
async def update_employee(
    employee_id: int,
    data: EmployeeUpdate,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """Update an employee."""
    repo = EmployeeRepository(db)
    emp = await repo.get(employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(emp, k, v)
    return await repo.update(emp)
