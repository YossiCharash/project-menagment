# Import all models so that Base.metadata is populated for create_all
# This ensures all tables are created when init_database() is called
from backend.models.user import User  # noqa: F401
from backend.models.project import Project  # noqa: F401
from backend.models.subproject import Subproject  # noqa: F401
from backend.models.transaction import Transaction  # noqa: F401
from backend.models.audit_log import AuditLog  # noqa: F401
from backend.models.supplier import Supplier  # noqa: F401
from backend.models.supplier_document import SupplierDocument  # noqa: F401
from backend.models.admin_invite import AdminInvite  # noqa: F401
from backend.models.email_verification import EmailVerification  # noqa: F401
from backend.models.recurring_transaction import RecurringTransactionTemplate  # noqa: F401
from backend.models.member_invite import MemberInvite  # noqa: F401
