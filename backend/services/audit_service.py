import json
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.audit_log import AuditLog
from backend.repositories.audit_repository import AuditRepository
from backend.repositories.user_repository import UserRepository
from backend.schemas.audit_log import (
    AuditEvent,
    AuditLogCountResult,
    AuditLogFilter,
    AuditLogUserInfo,
    AuditLogWithUserOut,
)


# Audit entity constants - centralizing avoids string typos and keeps
# entity vocabulary consistent across loggers.
ENTITY_TRANSACTION = "transaction"
ENTITY_PROJECT = "project"
ENTITY_USER = "user"
ENTITY_SUPPLIER = "supplier"
ENTITY_BUDGET = "budget"


class AuditService:
    """Records audit events and reads audit log history."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = AuditRepository(db)

    # ---------- Write side ----------

    async def record_event(self, event: AuditEvent) -> AuditLog:
        """Persist a single audit event described by the given DTO."""
        log = AuditLog(
            user_id=event.user_id,
            action=event.action,
            entity=event.entity,
            entity_id=str(event.entity_id),
            details=self._serialize_details(event.details),
        )
        return await self.repository.create(log)

    async def record_transaction_event(
        self,
        user_id: Optional[int],
        action: str,
        transaction_id: int,
        details: Optional[dict] = None,
    ) -> AuditLog:
        return await self.record_event(
            AuditEvent(
                user_id=user_id,
                action=action,
                entity=ENTITY_TRANSACTION,
                entity_id=str(transaction_id),
                details=details,
            )
        )

    async def record_project_event(
        self,
        user_id: Optional[int],
        action: str,
        project_id: int,
        details: Optional[dict] = None,
    ) -> AuditLog:
        return await self.record_event(
            AuditEvent(
                user_id=user_id,
                action=action,
                entity=ENTITY_PROJECT,
                entity_id=str(project_id),
                details=details,
            )
        )

    async def record_user_event(
        self,
        user_id: Optional[int],
        action: str,
        target_user_id: int,
        details: Optional[dict] = None,
    ) -> AuditLog:
        return await self.record_event(
            AuditEvent(
                user_id=user_id,
                action=action,
                entity=ENTITY_USER,
                entity_id=str(target_user_id),
                details=details,
            )
        )

    async def record_supplier_event(
        self,
        user_id: Optional[int],
        action: str,
        supplier_id: int,
        details: Optional[dict] = None,
    ) -> AuditLog:
        return await self.record_event(
            AuditEvent(
                user_id=user_id,
                action=action,
                entity=ENTITY_SUPPLIER,
                entity_id=str(supplier_id),
                details=details,
            )
        )

    async def record_budget_event(
        self,
        user_id: Optional[int],
        action: str,
        budget_id: int,
        details: Optional[dict] = None,
    ) -> AuditLog:
        return await self.record_event(
            AuditEvent(
                user_id=user_id,
                action=action,
                entity=ENTITY_BUDGET,
                entity_id=str(budget_id),
                details=details,
            )
        )

    # ---------- Backwards-compatible aliases ----------
    # Older callers still use the verb form `log_*`. Keep thin pass-throughs.

    async def log_action(
        self,
        user_id: Optional[int],
        action: str,
        entity: str,
        entity_id: str,
        details: Optional[dict] = None,
    ) -> AuditLog:
        return await self.record_event(
            AuditEvent(
                user_id=user_id,
                action=action,
                entity=entity,
                entity_id=str(entity_id),
                details=details,
            )
        )

    async def log_transaction_action(self, user_id, action, transaction_id, details=None):
        return await self.record_transaction_event(user_id, action, transaction_id, details)

    async def log_project_action(self, user_id, action, project_id, details=None):
        return await self.record_project_event(user_id, action, project_id, details)

    async def log_user_action(self, user_id, action, target_user_id, details=None):
        return await self.record_user_event(user_id, action, target_user_id, details)

    async def log_supplier_action(self, user_id, action, supplier_id, details=None):
        return await self.record_supplier_event(user_id, action, supplier_id, details)

    async def log_budget_action(self, user_id, action, budget_id, details=None):
        return await self.record_budget_event(user_id, action, budget_id, details)

    # ---------- Read side ----------

    async def list_logs(self, filters: AuditLogFilter) -> list[AuditLog]:
        return await self.repository.list(**filters.model_dump())

    async def count_logs(self, filters: AuditLogFilter) -> AuditLogCountResult:
        count = await self.repository.count(
            **filters.model_dump(exclude={"limit", "offset"})
        )
        return AuditLogCountResult(count=count)

    async def list_logs_with_users(
        self, filters: AuditLogFilter
    ) -> list[AuditLogWithUserOut]:
        """List logs enriched with the actor's display info (name, email, avatar)."""
        logs = await self.list_logs(filters)
        users_by_id = await self._load_actor_user_info(logs)
        return [self._to_log_with_user_dto(log, users_by_id) for log in logs]

    # ---------- Internals ----------

    @staticmethod
    def _serialize_details(details: Optional[dict]) -> Optional[str]:
        if not details:
            return None
        return json.dumps(details, ensure_ascii=False)

    async def _load_actor_user_info(
        self, logs: list[AuditLog]
    ) -> dict[int, AuditLogUserInfo]:
        user_repo = UserRepository(self.db)
        unique_user_ids = {log.user_id for log in logs if log.user_id}
        result: dict[int, AuditLogUserInfo] = {}
        for uid in unique_user_ids:
            user_obj = await user_repo.get_by_id(uid)
            if user_obj:
                result[uid] = AuditLogUserInfo(
                    id=user_obj.id,
                    full_name=user_obj.full_name,
                    email=user_obj.email,
                    avatar_url=getattr(user_obj, "avatar_url", None),
                )
        return result

    @staticmethod
    def _to_log_with_user_dto(
        log: AuditLog, users_by_id: dict[int, AuditLogUserInfo]
    ) -> AuditLogWithUserOut:
        actor = users_by_id.get(log.user_id) if log.user_id else None
        return AuditLogWithUserOut(
            id=log.id,
            user_id=log.user_id,
            user=actor,
            action=log.action,
            entity=log.entity,
            entity_id=log.entity_id,
            details=log.details,
            created_at=log.created_at,
        )
