import json
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.audit_log import AuditLog
from backend.repositories.audit_repository import AuditRepository


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

