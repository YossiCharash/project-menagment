# Import all models to ensure they are registered with SQLAlchemy
# Import models with dependencies first to ensure proper relationship configuration
# RecurringTransactionTemplate must be imported before Project since Project references it
from backend.models.user import User, UserRole
from backend.models.transaction import Transaction, TransactionType, ExpenseCategory
from backend.models.recurring_transaction import RecurringTransactionTemplate
from backend.models.project import Project
from backend.models.subproject import Subproject
from backend.models.audit_log import AuditLog
from backend.models.supplier import Supplier
from backend.models.supplier_document import SupplierDocument
from backend.models.admin_invite import AdminInvite
from backend.models.email_verification import EmailVerification
from backend.models.member_invite import MemberInvite
from backend.models.budget import Budget
from backend.models.fund import Fund
from backend.models.category import Category
from backend.models.contract_period import ContractPeriod
from backend.models.archived_contract import ArchivedContract
from backend.models.deleted_recurring_instance import DeletedRecurringInstance

__all__ = [
    "User",
    "UserRole", 
    "Project",
    "Subproject",
    "Transaction",
    "TransactionType",
    "ExpenseCategory",
    "AuditLog",
    "Supplier",
    "SupplierDocument",
    "AdminInvite",
    "EmailVerification",
    "RecurringTransactionTemplate",
    "MemberInvite",
    "Budget",
    "Fund",
    "Category",
    "ContractPeriod",
    "ArchivedContract",
    "DeletedRecurringInstance"
]
