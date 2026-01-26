from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, select
from datetime import date, datetime, timezone

from backend.models.recurring_transaction import RecurringTransactionTemplate
from backend.schemas.recurring_transaction import RecurringTransactionTemplateCreate, RecurringTransactionTemplateUpdate


class RecurringTransactionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: RecurringTransactionTemplateCreate | dict) -> RecurringTransactionTemplate:
        """Create a new recurring transaction template"""
        payload = data if isinstance(data, dict) else data.model_dump()
        payload.pop("category", None)
        template = RecurringTransactionTemplate(**payload)
        self.db.add(template)
        await self.db.commit()
        await self.db.refresh(template)
        return template

    async def get_by_id(self, template_id: int) -> Optional[RecurringTransactionTemplate]:
        """Get a recurring transaction template by ID"""
        res = await self.db.execute(
            select(RecurringTransactionTemplate).where(RecurringTransactionTemplate.id == template_id)
        )
        return res.scalar_one_or_none()

    async def list_by_project(self, project_id: int) -> List[RecurringTransactionTemplate]:
        """List all recurring transaction templates for a project"""
        res = await self.db.execute(
            select(RecurringTransactionTemplate)
            .where(RecurringTransactionTemplate.project_id == project_id)
            .order_by(RecurringTransactionTemplate.created_at.desc())
        )
        return list(res.scalars().all())

    async def list_active_templates(self) -> List[RecurringTransactionTemplate]:
        """List all active recurring transaction templates"""
        res = await self.db.execute(
            select(RecurringTransactionTemplate).where(RecurringTransactionTemplate.is_active == True)
        )
        return list(res.scalars().all())

    async def update(self, template: RecurringTransactionTemplate, data: RecurringTransactionTemplateUpdate | dict) -> RecurringTransactionTemplate:
        """Update a recurring transaction template"""
        update_data = data if isinstance(data, dict) else data.model_dump(exclude_unset=True)
        update_data.pop("category", None)
        for field, value in update_data.items():
            setattr(template, field, value)
        
        template.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(template)
        return template

    async def delete(self, template: RecurringTransactionTemplate) -> bool:
        """Delete a recurring transaction template"""
        await self.db.delete(template)
        await self.db.commit()
        return True

    async def deactivate(self, template: RecurringTransactionTemplate) -> RecurringTransactionTemplate:
        """Deactivate a recurring transaction template"""
        template.is_active = False
        template.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(template)
        return template

    async def get_templates_to_generate(
        self, target_date: date, project_id: Optional[int] = None
    ) -> List[RecurringTransactionTemplate]:
        """Get templates that should generate transactions for a given date.
        If project_id is set, only return templates for that project."""
        from backend.models.recurring_transaction import RecurringEndType

        conditions = [
            RecurringTransactionTemplate.is_active == True,
            RecurringTransactionTemplate.day_of_month == target_date.day,
            RecurringTransactionTemplate.start_date <= target_date,
            or_(
                RecurringTransactionTemplate.end_type == RecurringEndType.NO_END,
                and_(
                    RecurringTransactionTemplate.end_type == RecurringEndType.ON_DATE,
                    RecurringTransactionTemplate.end_date >= target_date,
                ),
                and_(
                    RecurringTransactionTemplate.end_type == RecurringEndType.AFTER_OCCURRENCES,
                    True,  # Placeholder - occurrence count check handled at service level
                ),
            ),
        ]
        if project_id is not None:
            conditions.append(RecurringTransactionTemplate.project_id == project_id)

        res = await self.db.execute(
            select(RecurringTransactionTemplate).where(and_(*conditions))
        )
        return list(res.scalars().all())
