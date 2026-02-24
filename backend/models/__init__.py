# Import all models to ensure they are registered with SQLAlchemy
# Import models with dependencies first to ensure proper relationship configuration
# RecurringTransactionTemplate must be imported before Project since Project references it
from backend.models.user import User, UserRole
from backend.models.user_preference import UserPreference
from backend.models.transaction import Transaction, TransactionType, ExpenseCategory
from backend.models.recurring_transaction import RecurringTransactionTemplate
from backend.models.project import Project
from backend.models.subproject import Subproject
from backend.models.audit_log import AuditLog
from backend.models.supplier import Supplier
from backend.models.document import Document
from backend.models.invite import Invite
from backend.models.email_verification import EmailVerification
from backend.models.budget import Budget
from backend.models.fund import Fund
from backend.models.category import Category
from backend.models.contract_period import ContractPeriod
from backend.models.deleted_recurring_instance import DeletedRecurringInstance
from backend.models.unforeseen_transaction import UnforeseenTransaction, UnforeseenTransactionLine, UnforeseenTransactionStatus
from backend.models.quote_structure_item import QuoteStructureItem
from backend.models.quote_subject import QuoteSubject
from backend.models.quote_project import QuoteProject
from backend.models.quote_line import QuoteLine
from backend.models.task import Task, TaskLabel, TaskAttachment, TaskParticipant, TaskMessage
from backend.models.user_notification import UserNotification
from backend.models.outlook_sync import OutlookSync
from backend.models.quote_building import QuoteBuilding, QuoteApartment
from backend.models.group_transaction_draft import GroupTransactionDraft, GroupTransactionDraftDocument
from backend.iam.models import ProjectRoleAssignment, ResourcePolicy, PermissionAuditLog

__all__ = [
    "User",
    "UserRole",
    "UserPreference", 
    "Project",
    "Subproject",
    "Transaction",
    "TransactionType",
    "ExpenseCategory",
    "AuditLog",
    "Supplier",
    "Document",
    "Invite",
    "EmailVerification",
    "RecurringTransactionTemplate",
    "Budget",
    "Fund",
    "Category",
    "ContractPeriod",
    "DeletedRecurringInstance",
    "UnforeseenTransaction",
    "UnforeseenTransactionLine",
    "UnforeseenTransactionStatus",
    "QuoteStructureItem",
    "QuoteSubject",
    "QuoteProject",
    "QuoteLine",
    "QuoteBuilding",
    "QuoteApartment",
    "Task",
    "TaskLabel",
    "TaskAttachment",
    "TaskParticipant",
    "TaskMessage",
    "UserNotification",
    "OutlookSync",
    "GroupTransactionDraft",
    "GroupTransactionDraftDocument",
    "ProjectRoleAssignment",
    "ResourcePolicy",
    "PermissionAuditLog",
]
