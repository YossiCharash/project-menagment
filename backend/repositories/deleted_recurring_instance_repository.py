from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from backend.models.deleted_recurring_instance import DeletedRecurringInstance


class DeletedRecurringInstanceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, template_id: int, tx_date: date) -> DeletedRecurringInstance:
        """Record a deleted recurring transaction instance"""
        deleted_instance = DeletedRecurringInstance(
            recurring_template_id=template_id,
            tx_date=tx_date
        )
        self.db.add(deleted_instance)
        await self.db.commit()
        await self.db.refresh(deleted_instance)
        return deleted_instance

    async def is_deleted(self, template_id: int, tx_date: date) -> bool:
        """Check if a specific instance was manually deleted"""
        result = await self.db.execute(
            select(DeletedRecurringInstance).where(
                and_(
                    DeletedRecurringInstance.recurring_template_id == template_id,
                    DeletedRecurringInstance.tx_date == tx_date
                )
            )
        )
        return result.scalar_one_or_none() is not None

    async def delete(self, deleted_instance: DeletedRecurringInstance) -> bool:
        """Delete a deleted instance record (if needed)"""
        await self.db.delete(deleted_instance)
        await self.db.commit()
        return True
    
    async def restore(self, template_id: int, tx_date: date) -> bool:
        """Remove a deleted instance record to allow regeneration"""
        result = await self.db.execute(
            select(DeletedRecurringInstance).where(
                and_(
                    DeletedRecurringInstance.recurring_template_id == template_id,
                    DeletedRecurringInstance.tx_date == tx_date
                )
            )
        )
        deleted_instance = result.scalar_one_or_none()
        if deleted_instance:
            await self.db.delete(deleted_instance)
            await self.db.commit()
            return True
        return False

