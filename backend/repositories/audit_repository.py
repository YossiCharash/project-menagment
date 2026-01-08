from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import Optional
from backend.models.audit_log import AuditLog


class AuditRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, log: AuditLog) -> AuditLog:
        self.db.add(log)
        await self.db.commit()
        await self.db.refresh(log)
        return log

    async def list(
        self,
        limit: int = 100,
        offset: int = 0,
        user_id: Optional[int] = None,
        entity: Optional[str] = None,
        action: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        exclude_action: Optional[str] = None
    ) -> list[AuditLog]:
        """List audit logs with optional filtering"""
        query = select(AuditLog)
        
        conditions = []
        if user_id is not None:
            conditions.append(AuditLog.user_id == user_id)
        if entity:
            conditions.append(AuditLog.entity == entity)
        if action:
            conditions.append(AuditLog.action == action)
        if exclude_action:
            conditions.append(AuditLog.action != exclude_action)
        if start_date:
            conditions.append(AuditLog.created_at >= start_date)
        if end_date:
            conditions.append(AuditLog.created_at <= end_date)
        
        if conditions:
            query = query.where(and_(*conditions))
        
        query = query.order_by(AuditLog.id.desc()).limit(limit).offset(offset)
        res = await self.db.execute(query)
        return list(res.scalars().all())
    
    async def count(
        self,
        user_id: Optional[int] = None,
        entity: Optional[str] = None,
        action: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        exclude_action: Optional[str] = None
    ) -> int:
        """Count audit logs with optional filtering"""
        from sqlalchemy import func
        query = select(func.count(AuditLog.id))
        
        conditions = []
        if user_id is not None:
            conditions.append(AuditLog.user_id == user_id)
        if entity:
            conditions.append(AuditLog.entity == entity)
        if action:
            conditions.append(AuditLog.action == action)
        if exclude_action:
            conditions.append(AuditLog.action != exclude_action)
        if start_date:
            conditions.append(AuditLog.created_at >= start_date)
        if end_date:
            conditions.append(AuditLog.created_at <= end_date)
        
        if conditions:
            query = query.where(and_(*conditions))
        
        res = await self.db.execute(query)
        return res.scalar() or 0
