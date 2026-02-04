"""Employee repository for Task Management Calendar."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.employee import Employee


class EmployeeRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, employee: Employee) -> Employee:
        self.db.add(employee)
        await self.db.flush()
        await self.db.refresh(employee)
        return employee

    async def list(self, active_only: bool = True) -> list[Employee]:
        q = select(Employee)
        if active_only:
            q = q.where(Employee.is_active == True)
        q = q.order_by(Employee.name)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def get(self, employee_id: int) -> Employee | None:
        result = await self.db.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        return result.scalar_one_or_none()

    async def update(self, employee: Employee) -> Employee:
        await self.db.flush()
        await self.db.refresh(employee)
        return employee

    async def delete(self, employee: Employee) -> None:
        await self.db.delete(employee)
        await self.db.flush()
