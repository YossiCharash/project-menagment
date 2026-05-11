import json
from datetime import datetime
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.audit_log import AuditLog
from backend.repositories.audit_repository import AuditRepository
from backend.repositories.user_repository import UserRepository


class AuditService:
    """Service for logging audit events"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = AuditRepository(db)
    
    async def log_action(
        self,
        user_id: Optional[int],
        action: str,
        entity: str,
        entity_id: str,
        details: Optional[dict[str, Any]] = None
    ) -> AuditLog:
        """
        Log an audit action
        
        Args:
            user_id: ID of the user performing the action (None for system actions)
            action: Action type (e.g., 'create', 'update', 'delete', 'view')
            entity: Entity type (e.g., 'transaction', 'project', 'user')
            entity_id: ID of the entity being acted upon
            details: Optional dictionary with additional details about the action
        """
        details_str = json.dumps(details, ensure_ascii=False) if details else None
        
        log = AuditLog(
            user_id=user_id,
            action=action,
            entity=entity,
            entity_id=str(entity_id),
            details=details_str
        )
        
        return await self.repository.create(log)
    
    async def log_transaction_action(
        self,
        user_id: Optional[int],
        action: str,
        transaction_id: int,
        details: Optional[dict[str, Any]] = None
    ) -> AuditLog:
        """Log a transaction-related action"""
        return await self.log_action(
            user_id=user_id,
            action=action,
            entity='transaction',
            entity_id=str(transaction_id),
            details=details
        )
    
    async def log_project_action(
        self,
        user_id: Optional[int],
        action: str,
        project_id: int,
        details: Optional[dict[str, Any]] = None
    ) -> AuditLog:
        """Log a project-related action"""
        return await self.log_action(
            user_id=user_id,
            action=action,
            entity='project',
            entity_id=str(project_id),
            details=details
        )
    
    async def log_user_action(
        self,
        user_id: Optional[int],
        action: str,
        target_user_id: int,
        details: Optional[dict[str, Any]] = None
    ) -> AuditLog:
        """Log a user-related action"""
        return await self.log_action(
            user_id=user_id,
            action=action,
            entity='user',
            entity_id=str(target_user_id),
            details=details
        )
    
    async def log_supplier_action(
        self,
        user_id: Optional[int],
        action: str,
        supplier_id: int,
        details: Optional[dict[str, Any]] = None
    ) -> AuditLog:
        """Log a supplier-related action"""
        return await self.log_action(
            user_id=user_id,
            action=action,
            entity='supplier',
            entity_id=str(supplier_id),
            details=details
        )
    
    async def log_budget_action(
        self,
        user_id: Optional[int],
        action: str,
        budget_id: int,
        details: Optional[dict[str, Any]] = None
    ) -> AuditLog:
        """Log a budget-related action"""
        return await self.log_action(
            user_id=user_id,
            action=action,
            entity='budget',
            entity_id=str(budget_id),
            details=details
        )

    async def list_logs(
        self,
        *,
        limit: int,
        offset: int,
        user_id: Optional[int],
        entity: Optional[str],
        action: Optional[str],
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        exclude_action: Optional[str],
    ) -> list[AuditLog]:
        """List audit logs filtered by the provided criteria."""
        return await self.repository.list(
            limit=limit,
            offset=offset,
            user_id=user_id,
            entity=entity,
            action=action,
            start_date=start_date,
            end_date=end_date,
            exclude_action=exclude_action,
        )

    async def count_logs(
        self,
        *,
        user_id: Optional[int],
        entity: Optional[str],
        action: Optional[str],
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        exclude_action: Optional[str],
    ) -> dict:
        """Count audit logs with filters."""
        count = await self.repository.count(
            user_id=user_id,
            entity=entity,
            action=action,
            start_date=start_date,
            end_date=end_date,
            exclude_action=exclude_action,
        )
        return {"count": count}

    async def list_logs_with_users(
        self,
        *,
        limit: int,
        offset: int,
        user_id: Optional[int],
        entity: Optional[str],
        action: Optional[str],
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        exclude_action: Optional[str],
    ) -> list[dict]:
        """List audit logs joined with user info for display."""
        logs = await self.list_logs(
            limit=limit,
            offset=offset,
            user_id=user_id,
            entity=entity,
            action=action,
            start_date=start_date,
            end_date=end_date,
            exclude_action=exclude_action,
        )
        user_repo = UserRepository(self.db)
        unique_user_ids = {log.user_id for log in logs if log.user_id}
        users_dict: dict[int, dict] = {}
        for uid in unique_user_ids:
            user_obj = await user_repo.get_by_id(uid)
            if user_obj:
                users_dict[uid] = {
                    "id": user_obj.id,
                    "full_name": user_obj.full_name,
                    "email": user_obj.email,
                    "avatar_url": getattr(user_obj, "avatar_url", None),
                }
        return [
            {
                "id": log.id,
                "user_id": log.user_id,
                "user": users_dict.get(log.user_id) if log.user_id else None,
                "action": log.action,
                "entity": log.entity,
                "entity_id": log.entity_id,
                "details": log.details,
                "created_at": log.created_at,
            }
            for log in logs
        ]

