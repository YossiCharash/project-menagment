from fastapi import APIRouter

from backend.api.v1.endpoints import transactions, auth, reports, suppliers, users, projects, financial_aggregation, admin_invites, email_verification, recurring_transactions, oauth, member_invites, budgets, audit_logs, categories

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(oauth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_router.include_router(recurring_transactions.router, prefix="/recurring-transactions", tags=["recurring-transactions"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(suppliers.router, prefix="/suppliers", tags=["suppliers"])
api_router.include_router(financial_aggregation.router, prefix="/financial-aggregation", tags=["financial-aggregation"])
api_router.include_router(admin_invites.router, prefix="/admin-invites", tags=["admin-invites"])
api_router.include_router(member_invites.router, prefix="/member-invites", tags=["member-invites"])
api_router.include_router(email_verification.router, prefix="/email-verification", tags=["email-verification"])
api_router.include_router(budgets.router, prefix="/budgets", tags=["budgets"])
api_router.include_router(audit_logs.router, prefix="/audit-logs", tags=["audit-logs"])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
