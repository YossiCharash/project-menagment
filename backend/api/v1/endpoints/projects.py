from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Response, Form, Body
from datetime import date, timedelta, datetime
from typing import Optional
import os
from uuid import uuid4
import csv
import io
from pydantic import BaseModel

from backend.core.deps import DBSessionDep, require_roles, get_current_user, require_admin
from backend.core.config import settings
from backend.core.security import verify_password
from backend.repositories.project_repository import ProjectRepository
from backend.repositories.transaction_repository import TransactionRepository
from backend.repositories.user_repository import UserRepository
from backend.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate
from backend.schemas.recurring_transaction import RecurringTransactionTemplateCreate
from backend.services.project_service import ProjectService, calculate_monthly_income_amount
from backend.services.recurring_transaction_service import RecurringTransactionService
from backend.services.financial_aggregation_service import FinancialAggregationService
from backend.services.budget_service import BudgetService
from backend.services.fund_service import FundService
from backend.services.s3_service import S3Service
from backend.services.audit_service import AuditService
from backend.services.contract_period_service import ContractPeriodService
from backend.models.user import UserRole
from backend.models.project import Project
from backend.models.archived_contract import ArchivedContract
from backend.models.subproject import Subproject
from backend.models.recurring_transaction import RecurringTransactionTemplate
from backend.models.fund import Fund
from backend.models.budget import Budget
from backend.models.contract_period import ContractPeriod
from sqlalchemy import delete

router = APIRouter()


def get_uploads_dir() -> str:
    """Get absolute path to uploads directory, resolving relative paths relative to backend directory"""
    if os.path.isabs(settings.FILE_UPLOAD_DIR):
        return settings.FILE_UPLOAD_DIR
    else:
        # Get the directory where this file is located, then go up to backend directory
        current_dir = os.path.dirname(os.path.abspath(__file__))
        # Go from api/v1/endpoints to backend directory
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))
        return os.path.abspath(os.path.join(backend_dir, settings.FILE_UPLOAD_DIR))


@router.get("/", response_model=list[ProjectOut])
async def list_projects(db: DBSessionDep, include_archived: bool = Query(False), only_archived: bool = Query(False), user = Depends(get_current_user)):
    """List projects - accessible to all authenticated users"""
    return await ProjectRepository(db).list(include_archived=include_archived, only_archived=only_archived)

@router.get("", response_model=list[ProjectOut])
async def list_projects_no_slash(db: DBSessionDep, include_archived: bool = Query(False), only_archived: bool = Query(False), user = Depends(get_current_user)):
    """Alias without trailing slash to avoid 404 when redirect_slashes=False"""
    return await ProjectRepository(db).list(include_archived=include_archived, only_archived=only_archived)

@router.get("/check-name")
async def check_project_name(
    db: DBSessionDep,
    name: str = Query(..., description="Project name to check"),
    exclude_id: Optional[int] = Query(None, description="Project ID to exclude from check (for updates)"),
    user = Depends(get_current_user)
):
    """Check if a project name already exists - accessible to all authenticated users"""
    from sqlalchemy import select

    query = select(Project).where(Project.name == name)
    if exclude_id:
        query = query.where(Project.id != exclude_id)

    result = await db.execute(query)
    existing_project = result.scalar_one_or_none()

    return {
        "exists": existing_project is not None,
        "available": existing_project is None
    }

@router.get("/profitability-alerts")
async def get_profitability_alerts(
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """
    Get projects and sub-projects with profitability issues based on last 6 months of data.
    Returns projects with profit margin <= -10% (loss-making projects).
    """
    from sqlalchemy import select, and_
    from backend.models.project import Project
    from backend.models.transaction import Transaction
    from datetime import timedelta

    # Calculate date 6 months ago
    today = date.today()
    six_months_ago = today - timedelta(days=180)

    # Get all projects (both active and inactive) - we'll check transactions for all
    projects_result = await db.execute(
        select(Project)
    )
    all_projects = projects_result.scalars().all()

    alerts = []

    for project in all_projects:
        # Get transactions for the last 6 months
        transactions_query = select(Transaction).where(
            and_(
                Transaction.project_id == project.id,
                Transaction.tx_date >= six_months_ago,
                Transaction.tx_date <= today
            )
        )
        transactions_result = await db.execute(transactions_query)
        transactions = transactions_result.scalars().all()

        # Calculate income and expenses (exclude fund transactions)
        income = sum(float(t.amount) for t in transactions if t.type == 'Income' and not (hasattr(t, 'from_fund') and t.from_fund))
        expense = sum(float(t.amount) for t in transactions if t.type == 'Expense' and not (hasattr(t, 'from_fund') and t.from_fund))
        profit = income - expense

        # Also check all transactions regardless of date for debugging
        all_transactions_query = select(Transaction).where(Transaction.project_id == project.id)
        all_transactions_result = await db.execute(all_transactions_query)
        all_transactions = all_transactions_result.scalars().all()

        # If no transactions in the last 6 months, check if there are any transactions at all
        if len(transactions) == 0 and len(all_transactions) > 0:
            # Check if the oldest transaction is recent (within last year)
            oldest_tx = min(all_transactions, key=lambda t: t.tx_date)
            # If the oldest transaction is within the last year, include it in calculation
            one_year_ago = today - timedelta(days=365)
            if oldest_tx.tx_date >= one_year_ago:
                # Use all transactions from the last year
                transactions_query = select(Transaction).where(
                    and_(
                        Transaction.project_id == project.id,
                        Transaction.tx_date >= one_year_ago,
                        Transaction.tx_date <= today
                    )
                )
                transactions_result = await db.execute(transactions_query)
                transactions = transactions_result.scalars().all()
                # Recalculate with new transactions
                income = sum(float(t.amount) for t in transactions if t.type == 'Income')
                expense = sum(float(t.amount) for t in transactions if t.type == 'Expense')
                profit = income - expense

        # Calculate profit margin
        if income > 0:
            profit_margin = (profit / income) * 100
        elif expense > 0:
            # If no income but there are expenses, consider it as 100% loss
            profit_margin = -100
        else:
            # No transactions, skip this project
            continue

        # Only include projects with profit margin <= -10% (loss-making)
        if profit_margin <= -10:
            # Determine if it's a sub-project
            is_subproject = project.relation_project is not None

            alerts.append({
                'id': int(project.id),
                'name': str(project.name),
                'profit_margin': float(round(profit_margin, 1)),
                'income': float(income),
                'expense': float(expense),
                'profit': float(profit),
                'is_subproject': bool(is_subproject),
                'parent_project_id': int(project.relation_project) if project.relation_project else None
            })

    # Sort by profit margin (most negative first)
    alerts.sort(key=lambda x: x['profit_margin'])

    result = {
        'alerts': alerts,
        'count': int(len(alerts)),
        'period_start': str(six_months_ago.isoformat()),
        'period_end': str(today.isoformat())
    }

    return result

@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: int, db: DBSessionDep, user = Depends(get_current_user)):
    """Get project details - accessible to all authenticated users"""
    project = await ProjectRepository(db).get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Add fund information to project response
    from backend.services.fund_service import FundService
    fund_service = FundService(db)
    fund = await fund_service.get_fund_by_project(project_id)

    
    # Convert to dict to modify
    project_dict = {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "budget_monthly": project.budget_monthly,
        "budget_annual": project.budget_annual,
        "manager_id": project.manager_id,
        "relation_project": project.relation_project,
        "is_parent_project": project.is_parent_project,  # Add is_parent_project field
        "num_residents": project.num_residents,
        "monthly_price_per_apartment": project.monthly_price_per_apartment,
        "address": project.address,
        "city": project.city,
        "image_url": project.image_url,
        "contract_file_url": project.contract_file_url,
        "is_active": project.is_active,
        "created_at": project.created_at,
        "total_value": getattr(project, 'total_value', 0.0),  # Use getattr with default value
        "has_fund": fund is not None,
        "monthly_fund_amount": float(fund.monthly_amount) if fund else None
    }
    return project_dict

@router.get("/{project_id}/subprojects", response_model=list[ProjectOut])
async def get_subprojects(project_id: int, db: DBSessionDep, user = Depends(get_current_user)):
    """Get subprojects - accessible to all authenticated users"""
    return await ProjectRepository(db).get_subprojects(project_id)

@router.get("/get_values/{project_id}", response_model=ProjectOut)
async def get_project_values(project_id: int, db: DBSessionDep, user = Depends(get_current_user)):
    """Get project values - accessible to all authenticated users"""
    project_data = await ProjectService(db).get_value_of_projects(project_id=project_id)
    if not project_data:
        raise HTTPException(status_code=404, detail="Project not found")
    return project_data

@router.post("/", response_model=ProjectOut)
async def create_project(db: DBSessionDep, data: ProjectCreate, user = Depends(get_current_user)):
    """Create project - accessible to all authenticated users"""
    # Extract recurring transactions, budgets, and fund data from project data
    project_data = data.model_dump(exclude={'recurring_transactions', 'budgets', 'has_fund', 'monthly_fund_amount'})
    recurring_transactions = data.recurring_transactions or []
    budgets = data.budgets or []
    has_fund = data.has_fund or False
    monthly_fund_amount = data.monthly_fund_amount
    
    # Determine if this is a parent project or regular project
    # If relation_project is set, this is a subproject (not a parent project)
    # If is_parent_project is explicitly set to True, this is a parent project
    # Otherwise, if relation_project is None and is_parent_project is not explicitly False, default to regular project
    if project_data.get('relation_project') is not None:
        # This is a subproject - cannot be a parent project
        project_data['is_parent_project'] = False
        
        # Validate that the parent project exists and is actually a parent project
        parent_id = project_data['relation_project']
        parent_project = await ProjectRepository(db).get_by_id(parent_id)
        if not parent_project:
            raise HTTPException(status_code=404, detail=f"פרויקט אב עם מזהה {parent_id} לא נמצא")
        if not parent_project.is_parent_project:
            raise HTTPException(status_code=400, detail="לא ניתן ליצור תת-פרויקט לפרויקט רגיל. רק פרויקט על יכול לקבל תת-פרויקטים")
    else:
        # This is not a subproject - check if it should be a parent project
        # If is_parent_project is explicitly set, use that value
        # Otherwise, default to False (regular project)
        if 'is_parent_project' not in project_data:
            project_data['is_parent_project'] = False
    
    # Subtract one day from end_date ONLY if provided and it's the 1st of the month (as per user requirement)
    if project_data.get('end_date') and project_data['end_date'].day == 1:
        project_data['end_date'] = project_data['end_date'] - timedelta(days=1)

    # Create the project
    project = await ProjectService(db).create(**project_data)
    
    # Create fund if requested (even if monthly_amount is 0)
    if has_fund:
        fund_service = FundService(db)
        monthly_amount = monthly_fund_amount if monthly_fund_amount is not None and monthly_fund_amount > 0 else 0
        await fund_service.create_fund(
            project_id=project.id,
            monthly_amount=monthly_amount,
            initial_balance=0
        )
    
    # Create recurring transactions if provided
    if recurring_transactions:
        recurring_service = RecurringTransactionService(db)
        for rt_data in recurring_transactions:
            # Convert to dict and set the project_id for each recurring transaction
            rt_dict = rt_data.model_dump()
            rt_dict['project_id'] = project.id
            # Create new instance with project_id set
            rt_create = RecurringTransactionTemplateCreate(**rt_dict)
            await recurring_service.create_template(rt_create)
    
    # Create budgets if provided
    if budgets:
        budget_service = BudgetService(db)
        for idx, budget_data in enumerate(budgets):
            try:
                # Convert string dates to date objects
                from datetime import date as date_type
                start_date = None
                end_date = None

                if budget_data.start_date:
                    if isinstance(budget_data.start_date, str):
                        start_date = date_type.fromisoformat(budget_data.start_date)
                    else:
                        start_date = budget_data.start_date

                if budget_data.end_date:
                    if isinstance(budget_data.end_date, str):
                        end_date = date_type.fromisoformat(budget_data.end_date)
                    else:
                        end_date = budget_data.end_date

                print(
                    "📥 [Project Budget] Creating budget",
                    {
                        "project_id": project.id,
                        "index": idx,
                        "category_id": budget_data.category_id,
                        "amount": budget_data.amount,
                        "period_type": budget_data.period_type,
                        "start_date": start_date,
                        "end_date": end_date,
                    },
                )

                created_budget = await budget_service.create_budget(
                    project_id=project.id,
                    category_id=budget_data.category_id,
                    amount=budget_data.amount,
                    period_type=budget_data.period_type or "Annual",
                    start_date=start_date,
                    end_date=end_date
                )
                print(
                    "✅ [Project Budget] Budget created",
                    {"budget_id": created_budget.id, "category_id": budget_data.category_id},
                )
            except Exception as e:
                import traceback
                print(
                    "❌ [Project Budget] Failed to create budget",
                    {
                        "project_id": project.id,
                        "index": idx,
                        "category_id": budget_data.category_id,
                        "amount": budget_data.amount,
                        "period_type": budget_data.period_type,
                        "error": str(e),
                    },
                )
                traceback.print_exc()
                # Log error but don't fail the entire project creation
                pass
    
    # Log create action with full details
    await AuditService(db).log_project_action(
        user_id=user.id,
        action='create',
        project_id=project.id,
        details={
            'name': project.name,
            'description': project.description,
            'budget_monthly': str(project.budget_monthly) if project.budget_monthly else None,
            'budget_annual': str(project.budget_annual) if project.budget_annual else None,
            'address': project.address,
            'city': project.city,
            'start_date': str(project.start_date) if project.start_date else None,
            'end_date': str(project.end_date) if project.end_date else None
        }
    )
    
    return project

@router.post("", response_model=ProjectOut)
async def create_project_no_slash(db: DBSessionDep, data: ProjectCreate, user = Depends(get_current_user)):
    """Alias without trailing slash to avoid 404 when redirect_slashes=False"""
    return await create_project(db, data, user)

@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: int, db: DBSessionDep, data: ProjectUpdate, user = Depends(get_current_user)):
    """Update project - accessible to all authenticated users"""
    repo = ProjectRepository(db)
    project = await repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    budgets_to_add = data.budgets or []
    has_fund = data.has_fund
    monthly_fund_amount = data.monthly_fund_amount

    # Store old values for audit log
    old_values = {
        'name': project.name,
        'description': project.description or '',
        'budget_monthly': str(project.budget_monthly) if project.budget_monthly else None,
        'budget_annual': str(project.budget_annual) if project.budget_annual else None,
        'address': project.address or '',
        'city': project.city or ''
    }

    update_payload = data.model_dump(exclude_unset=True, exclude={'budgets', 'has_fund', 'monthly_fund_amount'})
    
    # Validate relation_project if it's being set
    if 'relation_project' in update_payload and update_payload['relation_project'] is not None:
        parent_id = update_payload['relation_project']
        parent_project = await repo.get_by_id(parent_id)
        if not parent_project:
            raise HTTPException(status_code=404, detail=f"פרויקט אב עם מזהה {parent_id} לא נמצא")
        if not parent_project.is_parent_project:
            raise HTTPException(status_code=400, detail="לא ניתן להגדיר פרויקט רגיל כפרויקט אב. רק פרויקט על יכול לקבל תת-פרויקטים")
        # If setting relation_project, this becomes a subproject (not a parent project)
        update_payload['is_parent_project'] = False
    elif 'relation_project' in update_payload and update_payload['relation_project'] is None:
        # If removing relation_project, we need to determine if it should be a parent project
        # Don't change is_parent_project if it's not explicitly set
        if 'is_parent_project' not in update_payload:
            # Keep current value
            pass
    
    # Prevent changing is_parent_project if project already has subprojects
    if 'is_parent_project' in update_payload:
        # Check if this project has subprojects
        subprojects = await repo.get_subprojects(project_id)
        if len(subprojects) > 0 and not update_payload['is_parent_project']:
            raise HTTPException(status_code=400, detail="לא ניתן לשנות פרויקט על לפרויקט רגיל כאשר יש לו תת-פרויקטים")
    
    # Subtract one day from end_date ONLY if provided and it's the 1st of the month (as per user requirement)
    if update_payload.get('end_date') and update_payload['end_date'].day == 1:
        update_payload['end_date'] = update_payload['end_date'] - timedelta(days=1)

    updated_project = await ProjectService(db).update(project, **update_payload)
    
    # Handle fund creation/update
    fund_service = FundService(db)
    existing_fund = await fund_service.get_fund_by_project(project_id)
    
    if has_fund is not None:
        if has_fund:
            # Create or update fund (even if monthly_amount is 0)
            monthly_amount = monthly_fund_amount if monthly_fund_amount is not None and monthly_fund_amount > 0 else 0
            if existing_fund:
                # Update existing fund (repository already commits)
                await fund_service.update_fund(existing_fund, monthly_amount=monthly_amount)
            else:
                # Create new fund (repository already commits)
                await fund_service.create_fund(
                    project_id=project_id,
                    monthly_amount=monthly_amount,
                    initial_balance=0
                )
        elif not has_fund and existing_fund:
            # Delete fund if has_fund is False (repository already commits)
            await fund_service.funds.delete(existing_fund)
    elif monthly_fund_amount is not None and existing_fund:
        # Update monthly amount only (if has_fund wasn't explicitly set) (repository already commits)
        monthly_amount = monthly_fund_amount if monthly_fund_amount > 0 else 0
        await fund_service.update_fund(existing_fund, monthly_amount=monthly_amount)

    # Handle new category budgets if provided
    if budgets_to_add:
        budget_service = BudgetService(db)
        for idx, budget_data in enumerate(budgets_to_add):
            try:
                from datetime import date as date_type
                start_date = None
                end_date = None

                if budget_data.start_date:
                    if isinstance(budget_data.start_date, str):
                        start_date = date_type.fromisoformat(budget_data.start_date)
                    else:
                        start_date = budget_data.start_date

                if budget_data.end_date:
                    if isinstance(budget_data.end_date, str):
                        end_date = date_type.fromisoformat(budget_data.end_date)
                    else:
                        end_date = budget_data.end_date

                print(
                    "📥 [Project Budget] Adding budget during update",
                    {
                        "project_id": project_id,
                        "index": idx,
                        "category_id": budget_data.category_id,
                        "amount": budget_data.amount,
                        "period_type": budget_data.period_type,
                        "start_date": start_date,
                        "end_date": end_date,
                    },
                )

                created_budget = await budget_service.create_budget(
                    project_id=project_id,
                    category_id=budget_data.category_id,
                    amount=budget_data.amount,
                    period_type=budget_data.period_type or "Annual",
                    start_date=start_date,
                    end_date=end_date
                )
                print(
                    "✅ [Project Budget] Budget added during update",
                    {"budget_id": created_budget.id, "category_id": budget_data.category_id},
                )
            except Exception as e:
                import traceback
                print(
                    "❌ [Project Budget] Failed to add budget during update",
                    {
                        "project_id": project_id,
                        "index": idx,
                        "category_id": budget_data.category_id,
                        "amount": budget_data.amount,
                        "period_type": budget_data.period_type,
                        "error": str(e),
                    },
                )
                traceback.print_exc()

    # Log update action with full details
    update_data = {k: str(v) for k, v in update_payload.items()}
    await AuditService(db).log_project_action(
        user_id=user.id,
        action='update',
        project_id=project_id,
        details={
            'project_name': project.name,
            'old_values': old_values,
            'new_values': update_data
        }
    )

    # Refresh project to get updated data including fund info
    await db.refresh(updated_project)
    
    # Get updated fund information for response
    fund = await fund_service.get_fund_by_project(project_id)
    
    # Convert to dict to modify
    project_dict = {
        "id": updated_project.id,
        "name": updated_project.name,
        "description": updated_project.description,
        "start_date": updated_project.start_date,
        "end_date": updated_project.end_date,
        "budget_monthly": updated_project.budget_monthly,
        "budget_annual": updated_project.budget_annual,
        "manager_id": updated_project.manager_id,
        "relation_project": updated_project.relation_project,
        "num_residents": updated_project.num_residents,
        "monthly_price_per_apartment": updated_project.monthly_price_per_apartment,
        "address": updated_project.address,
        "city": updated_project.city,
        "image_url": updated_project.image_url,
        "contract_file_url": updated_project.contract_file_url,
        "is_active": updated_project.is_active,
        "created_at": updated_project.created_at,
        "total_value": getattr(updated_project, 'total_value', 0.0),  # Use getattr with default value
        "has_fund": fund is not None,
        "monthly_fund_amount": float(fund.monthly_amount) if fund else None
    }
    
    return project_dict


@router.post("/{project_id}/upload-image", response_model=ProjectOut)
async def upload_project_image(project_id: int, db: DBSessionDep, file: UploadFile = File(...), user = Depends(get_current_user)):
    """Upload project image to S3 - accessible to all authenticated users"""
    repo = ProjectRepository(db)
    project = await repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate file type (only images)
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed types: {', '.join(allowed_extensions)}")

    # Upload to S3
    s3 = S3Service()
    content = await file.read()

    from io import BytesIO
    file_obj = BytesIO(content)

    image_url = s3.upload_file(
        prefix="projects",
        file_obj=file_obj,
        filename=file.filename or "project-image",
        content_type=file.content_type,
    )

    # Store full URL in image_url
    project.image_url = image_url
    await repo.update(project)

    return project


@router.post("/{project_id}/upload-contract", response_model=ProjectOut)
async def upload_project_contract(project_id: int, db: DBSessionDep, file: UploadFile = File(...), user = Depends(get_current_user)):
    """Upload a building contract file for a project."""
    repo = ProjectRepository(db)
    project = await repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    allowed_extensions = {'.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed types: {', '.join(sorted(allowed_extensions))}"
        )

    s3 = S3Service()
    content = await file.read()

    from io import BytesIO
    file_obj = BytesIO(content)

    contract_url = s3.upload_file(
        prefix="project-contracts",
        file_obj=file_obj,
        filename=file.filename or "project-contract",
        content_type=file.content_type,
    )

    project.contract_file_url = contract_url
    await repo.update(project)

    return project


@router.post("/{project_id}/archive", response_model=ProjectOut)
async def archive_project(project_id: int, db: DBSessionDep, user = Depends(require_admin())):
    """Archive project - Admin only"""
    repo = ProjectRepository(db)
    project = await repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    archived = await repo.archive(project)
    
    # Log archive action
    await AuditService(db).log_project_action(
        user_id=user.id,
        action='archive',
        project_id=project_id,
        details={'name': project.name}
    )
    
    return archived


@router.post("/{project_id}/restore", response_model=ProjectOut)
async def restore_project(project_id: int, db: DBSessionDep, user = Depends(require_admin())):
    """Restore project - Admin only"""
    repo = ProjectRepository(db)
    project = await repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    restored = await repo.restore(project)
    
    # Log restore action
    await AuditService(db).log_project_action(
        user_id=user.id,
        action='restore',
        project_id=project_id,
        details={'name': project.name}
    )
    
    return restored


class DeleteProjectRequest(BaseModel):
    password: str


@router.delete("/{project_id}")
async def hard_delete_project(
    project_id: int, 
    delete_request: DeleteProjectRequest,
    db: DBSessionDep, 
    user = Depends(require_admin())
):
    """Hard delete project - Admin only, requires password verification"""
    # Verify password
    user_repo = UserRepository(db)
    db_user = await user_repo.get_by_id(user.id)
    if not db_user or not db_user.password_hash:
        raise HTTPException(status_code=400, detail="User not found or uses OAuth login")
    
    if not verify_password(delete_request.password, db_user.password_hash):
        raise HTTPException(status_code=400, detail="סיסמה שגויה")
    
    proj_repo = ProjectRepository(db)
    project = await proj_repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Store project details for audit log
    project_details = {'name': project.name}
    
    # Get all transactions before deletion to delete their files
    tx_repo = TransactionRepository(db)
    transactions = await tx_repo.list_by_project(project_id)
    
    # Delete all transaction files from S3 (only if S3 is configured)
    if settings.AWS_S3_BUCKET:
        try:
            s3_service = S3Service()
            for tx in transactions:
                if tx.file_path:
                    try:
                        s3_service.delete_file(tx.file_path)
                    except Exception as e:
                        # Log error but continue deletion
                        print(f"Warning: Failed to delete transaction file {tx.file_path}: {e}")
            
            # Delete project contract file if exists
            if project.contract_file_url:
                try:
                    s3_service.delete_file(project.contract_file_url)
                except Exception as e:
                    # Log error but continue deletion
                    print(f"Warning: Failed to delete project contract file {project.contract_file_url}: {e}")
        except (ValueError, Exception) as e:
            # If S3Service initialization fails (e.g., S3 not configured), log but continue with database deletion
            print(f"Warning: S3 service not available, skipping file deletion: {e}")
    
    # Delete all related records before deleting the project
    # Order matters due to foreign key constraints
    
    # 1. Delete archived contracts
    await db.execute(delete(ArchivedContract).where(ArchivedContract.project_id == project_id))
    
    # 2. Delete contract periods
    await db.execute(delete(ContractPeriod).where(ContractPeriod.project_id == project_id))
    
    # 3. Delete budgets
    await db.execute(delete(Budget).where(Budget.project_id == project_id))
    
    # 4. Delete recurring transaction templates
    await db.execute(delete(RecurringTransactionTemplate).where(RecurringTransactionTemplate.project_id == project_id))
    
    # 5. Delete subprojects
    await db.execute(delete(Subproject).where(Subproject.project_id == project_id))
    
    # 6. Delete fund
    await db.execute(delete(Fund).where(Fund.project_id == project_id))
    
    # 7. Delete transactions
    await tx_repo.delete_by_project(project_id)
    
    # Commit all deletions
    await db.commit()
    
    # 8. Finally, delete the project itself
    await proj_repo.delete(project)
    
    # Log delete action
    await AuditService(db).log_project_action(
        user_id=user.id,
        action='delete',
        project_id=project_id,
        details=project_details
    )
    
    return {"ok": True}


@router.get("/{project_id}/financial-summary")
async def get_parent_project_financial_summary(
    project_id: int,
    db: DBSessionDep,
    start_date: Optional[date] = Query(None, description="Start date for filtering transactions"),
    end_date: Optional[date] = Query(None, description="End date for filtering transactions"),
    user = Depends(get_current_user)
):
    """Get consolidated financial summary for a parent project including all subprojects"""
    # Use async approach instead of sync
    from sqlalchemy import select, and_, func
    from backend.models.project import Project
    from backend.models.transaction import Transaction
    from backend.services.project_service import calculate_start_date
    from datetime import date as date_type
    
    # Get parent project
    parent_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.is_active == True
        )
    )
    parent_project = parent_result.scalar_one_or_none()
    
    if not parent_project:
        raise HTTPException(status_code=404, detail="Parent project not found")
    
    # Get all subprojects
    subprojects_result = await db.execute(
        select(Project).where(
            Project.relation_project == project_id,
            Project.is_active == True
        )
    )
    subprojects = subprojects_result.scalars().all()
    
    # If no start_date provided, use project start_date (or 1 year back as fallback if no start_date)
    if not start_date:
        if parent_project.start_date:
            start_date = parent_project.start_date
        else:
            # Fallback: use 1 year ago if no project start date
            from dateutil.relativedelta import relativedelta
            start_date = date_type.today() - relativedelta(years=1)
    
    # If no end_date provided, use today
    if not end_date:
        end_date = date_type.today()
    
    # Build date filter
    date_conditions = []
    if start_date:
        date_conditions.append(Transaction.tx_date >= start_date)
    if end_date:
        date_conditions.append(Transaction.tx_date <= end_date)
    
    # Get transactions for parent project
    parent_transactions_query = select(Transaction).where(Transaction.project_id == project_id)
    if date_conditions:
        parent_transactions_query = parent_transactions_query.where(and_(*date_conditions))
    
    parent_transactions_result = await db.execute(parent_transactions_query)
    parent_transactions = parent_transactions_result.scalars().all()
    
    # Calculate parent project financials
    parent_transaction_income = sum(float(t.amount) for t in parent_transactions if t.type == 'Income' and not t.from_fund)
    parent_expense = sum(float(t.amount) for t in parent_transactions if t.type == 'Expense' and not t.from_fund)
    
    # Calculate income from parent project's monthly budget (treated as expected monthly income)
    parent_project_income = 0.0
    monthly_income = float(parent_project.budget_monthly or 0)
    if monthly_income > 0:
        parent_transaction_income = 0.0
        # Use project start_date if available, otherwise use created_at date
        if parent_project.start_date:
            income_calculation_start = parent_project.start_date
        elif hasattr(parent_project, 'created_at') and parent_project.created_at:
            try:
                if hasattr(parent_project.created_at, 'date'):
                    income_calculation_start = parent_project.created_at.date()
                elif isinstance(parent_project.created_at, date):
                    income_calculation_start = parent_project.created_at
                else:
                    # Fallback: use start_date parameter
                    income_calculation_start = start_date
            except (AttributeError, TypeError):
                # Fallback: use start_date parameter
                income_calculation_start = start_date
        else:
            # Fallback: use start_date parameter (which is already set to project start or 1 year ago)
            income_calculation_start = start_date
        parent_project_income = calculate_monthly_income_amount(monthly_income, income_calculation_start, end_date)
    
    parent_income = parent_transaction_income + parent_project_income
    parent_profit = parent_income - parent_expense
    parent_profit_margin = (parent_profit / parent_income * 100) if parent_income > 0 else 0
    
    # Calculate subproject financials
    subproject_financials = []
    total_subproject_income = 0
    total_subproject_expense = 0
    
    for subproject in subprojects:
        subproject_transactions_query = select(Transaction).where(Transaction.project_id == subproject.id)
        if date_conditions:
            subproject_transactions_query = subproject_transactions_query.where(and_(*date_conditions))
        
        subproject_transactions_result = await db.execute(subproject_transactions_query)
        subproject_transactions = subproject_transactions_result.scalars().all()
        
        subproject_transaction_income = sum(float(t.amount) for t in subproject_transactions if t.type == 'Income' and not t.from_fund)
        subproject_expense = sum(float(t.amount) for t in subproject_transactions if t.type == 'Expense' and not t.from_fund)
        
        # Calculate income from subproject monthly budget (treated as expected monthly income)
        subproject_project_income = 0.0
        subproject_monthly_income = float(subproject.budget_monthly or 0)
        if subproject_monthly_income > 0:
            subproject_transaction_income = 0.0
            # Use project start_date if available, otherwise use created_at date
            if subproject.start_date:
                income_calculation_start = subproject.start_date
            elif hasattr(subproject, 'created_at') and subproject.created_at:
                try:
                    if hasattr(subproject.created_at, 'date'):
                        income_calculation_start = subproject.created_at.date()
                    elif isinstance(subproject.created_at, date):
                        income_calculation_start = subproject.created_at
                    else:
                        # Fallback: use start_date parameter
                        income_calculation_start = start_date
                except (AttributeError, TypeError):
                    # Fallback: use start_date parameter
                    income_calculation_start = start_date
            else:
                # Fallback: use start_date parameter (which is already set to project start or 1 year ago)
                income_calculation_start = start_date
            subproject_project_income = calculate_monthly_income_amount(subproject_monthly_income, income_calculation_start, end_date)
        
        subproject_income = subproject_transaction_income + subproject_project_income
        subproject_profit = subproject_income - subproject_expense
        subproject_profit_margin = (subproject_profit / subproject_income * 100) if subproject_income > 0 else 0
        
        # Determine status
        if subproject_profit_margin >= 10:
            status = 'green'
        elif subproject_profit_margin <= -10:
            status = 'red'
        else:
            status = 'yellow'
        
        subproject_financials.append({
            'id': subproject.id,
            'name': subproject.name,
            'income': subproject_income,
            'expense': subproject_expense,
            'profit': subproject_profit,
            'profit_margin': subproject_profit_margin,
            'status': status
        })
        
        total_subproject_income += subproject_income
        total_subproject_expense += subproject_expense
    
    # Calculate consolidated totals
    total_income = parent_income + total_subproject_income
    total_expense = parent_expense + total_subproject_expense
    total_profit = total_income - total_expense
    total_profit_margin = (total_profit / total_income * 100) if total_income > 0 else 0
    
    return {
        'parent_project': {
            'id': parent_project.id,
            'name': parent_project.name,
            'description': parent_project.description,
            'address': parent_project.address,
            'city': parent_project.city,
            'num_residents': parent_project.num_residents,
            'monthly_price_per_apartment': parent_project.monthly_price_per_apartment,
            'budget_monthly': parent_project.budget_monthly,
            'budget_annual': parent_project.budget_annual
        },
        'financial_summary': {
            'total_income': total_income,
            'total_expense': total_expense,
            'net_profit': total_profit,
            'profit_margin': total_profit_margin,
            'subproject_count': len(subprojects),
            'active_subprojects': len([sp for sp in subprojects if sp.is_active])
        },
        'parent_financials': {
            'income': parent_income,
            'expense': parent_expense,
            'profit': parent_profit,
            'profit_margin': parent_profit_margin
        },
        'subproject_financials': subproject_financials,
        'date_range': {
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None
        }
    }


@router.get("/{project_id}/fund")
async def get_project_fund(
    project_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Get fund details for a project"""
    from backend.schemas.fund import FundWithTransactions
    from sqlalchemy import select, and_, func
    from backend.models.transaction import Transaction
    from datetime import date
    
    fund_service = FundService(db)
    fund = await fund_service.get_fund_by_project(project_id)
    
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found for this project")
    
    # Ensure monthly addition is made if needed
    await fund_service.ensure_monthly_addition(project_id)
    # Refresh fund after potential update
    fund = await fund_service.get_fund_by_project(project_id)
    
    # Get transactions from fund
    transactions_query = select(Transaction).where(
        and_(
            Transaction.project_id == project_id,
            Transaction.from_fund == True
        )
    ).order_by(Transaction.tx_date.desc())
    
    transactions_result = await db.execute(transactions_query)
    transactions = transactions_result.scalars().all()
    
    # Calculate total deductions (total amount withdrawn from fund - Expense transactions)
    total_deductions_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        and_(
            Transaction.project_id == project_id,
            Transaction.from_fund == True,
            Transaction.type == 'Expense'
        )
    )
    total_deductions_result = await db.execute(total_deductions_query)
    total_deductions = float(total_deductions_result.scalar_one())
    
    # Calculate total additions from Income transactions to fund
    total_additions_from_transactions_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        and_(
            Transaction.project_id == project_id,
            Transaction.from_fund == True,
            Transaction.type == 'Income'
        )
    )
    total_additions_from_transactions_result = await db.execute(total_additions_from_transactions_query)
    total_additions_from_transactions = float(total_additions_from_transactions_result.scalar_one())
    
    # Calculate initial balance and total monthly additions
    # Initial balance is 0 (fund starts with 0)
    initial_balance = 0.0
    monthly_amount = float(fund.monthly_amount)
    
    # Calculate total monthly additions based on creation date and last addition
    total_monthly_additions = 0.0
    if fund.last_monthly_addition and monthly_amount > 0:
        # Calculate months between creation and last addition (inclusive)
        created_date = fund.created_at.date() if hasattr(fund.created_at, 'date') else date.today()
        last_addition_date = fund.last_monthly_addition
        
        # Count months from creation to last addition
        if last_addition_date >= created_date:
            # Calculate number of months (including the creation month)
            months_count = (last_addition_date.year - created_date.year) * 12 + (last_addition_date.month - created_date.month) + 1
            total_monthly_additions = months_count * monthly_amount
    elif monthly_amount > 0:
        # If no monthly addition yet, but fund exists, at least the current month should count
        # This handles the case where fund was just created
        created_date = fund.created_at.date() if hasattr(fund.created_at, 'date') else date.today()
        today = date.today()
        if created_date <= today:
            months_count = (today.year - created_date.year) * 12 + (today.month - created_date.month) + 1
            # Only count if this month's addition should have been made
            if today.year > created_date.year or (today.year == created_date.year and today.month > created_date.month) or (today.year == created_date.year and today.month == created_date.month and today.day >= 1):
                total_monthly_additions = months_count * monthly_amount
    
    # Total additions = monthly additions + income transactions to fund
    total_additions = total_monthly_additions + total_additions_from_transactions
    
    # Initial total = initial_balance + total_additions (monthly + income transactions)
    initial_total = initial_balance + total_additions
    
    # Load user repository for created_by_user
    from backend.repositories.user_repository import UserRepository
    from backend.repositories.supplier_document_repository import SupplierDocumentRepository
    user_repo = UserRepository(db)
    doc_repo = SupplierDocumentRepository(db)
    
    # Convert transactions to dict with additional info
    transactions_list = []
    for tx in transactions:
        # Get creator user info
        created_by_user = None
        if hasattr(tx, 'created_by_user_id') and tx.created_by_user_id:
            creator = await user_repo.get_by_id(tx.created_by_user_id)
            if creator:
                created_by_user = {
                    'id': creator.id,
                    'full_name': creator.full_name,
                    'email': creator.email
                }
        
        # Get documents count
        documents_count = 0
        try:
            documents = await doc_repo.get_by_transaction_id(tx.id)
            documents_count = len(documents) if documents else 0
        except Exception:
            pass
        
        transactions_list.append({
            'id': tx.id,
            'tx_date': tx.tx_date.isoformat() if tx.tx_date else None,
            'type': tx.type,
            'amount': float(tx.amount),
            'description': tx.description,
            'category': tx.category,
            'notes': tx.notes,
            'created_by_user': created_by_user,
            'file_path': getattr(tx, 'file_path', None),
            'documents_count': documents_count
        })
    
    return {
        'id': fund.id,
        'project_id': fund.project_id,
        'current_balance': float(fund.current_balance),
        'monthly_amount': monthly_amount,
        'last_monthly_addition': fund.last_monthly_addition.isoformat() if fund.last_monthly_addition else None,
        'created_at': fund.created_at.isoformat(),
        'updated_at': fund.updated_at.isoformat(),
        'initial_balance': initial_balance,
        'initial_total': initial_total,  # Initial balance + all monthly additions
        'total_additions': total_additions,  # Total monthly additions made
        'total_deductions': total_deductions,  # Total amount withdrawn from fund
        'transactions': transactions_list
    }


@router.post("/{project_id}/fund")
async def create_project_fund(
    db: DBSessionDep,
    project_id: int,
    monthly_amount: float = Query(0, description="Monthly amount to add to fund"),
    user = Depends(get_current_user)
):
    """Create a fund for an existing project"""
    # Check if project exists
    project_repo = ProjectRepository(db)
    project = await project_repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if fund already exists
    fund_service = FundService(db)
    existing_fund = await fund_service.get_fund_by_project(project_id)
    if existing_fund:
        raise HTTPException(status_code=400, detail="Fund already exists for this project")
    
    # Create fund
    fund = await fund_service.create_fund(
        project_id=project_id,
        monthly_amount=monthly_amount,
        initial_balance=0
    )
    
    return {
        'id': fund.id,
        'project_id': fund.project_id,
        'current_balance': float(fund.current_balance),
        'monthly_amount': float(fund.monthly_amount),
        'created_at': fund.created_at.isoformat()
    }


@router.put("/{project_id}/fund")
async def update_project_fund(
    db: DBSessionDep,
    project_id: int,
    monthly_amount: Optional[float] = Query(None, description="Monthly amount to add to fund"),
    current_balance: Optional[float] = Query(None, description="Current balance of the fund"),
    user = Depends(get_current_user)
):
    """Update fund monthly amount and/or balance for a project"""
    # Check if project exists
    project_repo = ProjectRepository(db)
    project = await project_repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if fund exists
    fund_service = FundService(db)
    fund = await fund_service.get_fund_by_project(project_id)
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found for this project")
    
    # Update fund
    update_data = {}
    if monthly_amount is not None:
        update_data['monthly_amount'] = monthly_amount
    if current_balance is not None:
        update_data['current_balance'] = current_balance
    
    if update_data:
        await fund_service.update_fund(fund, **update_data)
    
    return {
        'id': fund.id,
        'project_id': fund.project_id,
        'current_balance': float(fund.current_balance),
        'monthly_amount': float(fund.monthly_amount),
        'updated_at': fund.updated_at.isoformat()
    }


@router.get("/{project_id}/financial-trends")
async def get_financial_trends(
    project_id: int,
    db: DBSessionDep,
    years_back: int = Query(5, description="Number of years to look back"),
    user = Depends(get_current_user)
):
    """Get financial trends over the last N years"""
    from sqlalchemy import select, and_, func, extract
    from backend.models.project import Project
    from backend.models.transaction import Transaction
    from datetime import datetime, date
    
    # Get parent project
    parent_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.is_active == True
        )
    )
    parent_project = parent_result.scalar_one_or_none()
    
    if not parent_project:
        raise HTTPException(status_code=404, detail="Parent project not found")
    
    # Get all subprojects
    subprojects_result = await db.execute(
        select(Project).where(
            Project.relation_project == project_id,
            Project.is_active == True
        )
    )
    subprojects = subprojects_result.scalars().all()
    
    # Calculate trends for the last N years
    trends = []
    current_year = datetime.now().year
    
    for i in range(years_back):
        year = current_year - i
        
        # Get start and end of year
        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)
        
        # Get transactions for parent project in this year
        parent_transactions_query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.tx_date >= year_start,
                Transaction.tx_date <= year_end
            )
        )
        parent_transactions_result = await db.execute(parent_transactions_query)
        parent_transactions = parent_transactions_result.scalars().all()
        
        parent_income = sum(t.amount for t in parent_transactions if t.type == 'Income')
        parent_expense = sum(t.amount for t in parent_transactions if t.type == 'Expense')
        
        # Get transactions for subprojects in this year
        total_subproject_income = 0
        total_subproject_expense = 0
        
        for subproject in subprojects:
            subproject_transactions_query = select(Transaction).where(
                and_(
                    Transaction.project_id == subproject.id,
                    Transaction.tx_date >= year_start,
                    Transaction.tx_date <= year_end
                )
            )
            subproject_transactions_result = await db.execute(subproject_transactions_query)
            subproject_transactions = subproject_transactions_result.scalars().all()
            
            subproject_income = sum(t.amount for t in subproject_transactions if t.type == 'Income')
            subproject_expense = sum(t.amount for t in subproject_transactions if t.type == 'Expense')
            
            total_subproject_income += subproject_income
            total_subproject_expense += subproject_expense
        
        # Calculate totals
        total_income = parent_income + total_subproject_income
        total_expense = parent_expense + total_subproject_expense
        total_profit = total_income - total_expense
        total_profit_margin = (total_profit / total_income * 100) if total_income > 0 else 0
        
        trends.append({
            'year': year,
            'income': total_income,
            'expense': total_expense,
            'profit': total_profit,
            'profit_margin': total_profit_margin
        })
    
    # Reverse to get chronological order
    trends.reverse()
    
    return {
        'trends': trends,
        'period_years': years_back
    }


# ============================================================================
# Contract Period Endpoints
# ============================================================================

@router.get("/{project_id}/contract-periods")
async def get_previous_contract_periods(
    project_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Get all previous contract periods grouped by year for a project"""
    service = ContractPeriodService(db)
    periods_by_year = await service.get_previous_contracts_by_year(project_id)
    
    # Convert to list format for easier frontend handling
    result = []
    for year in sorted(periods_by_year.keys(), reverse=True):
        result.append({
            'year': year,
            'periods': periods_by_year[year]
        })
    
    return {
        'project_id': project_id,
        'periods_by_year': result
    }


@router.get("/{project_id}/contract-periods/{period_id}")
async def get_contract_period_summary(
    project_id: int,
    period_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Get full summary of a contract period including transactions and budgets (read-only)"""
    service = ContractPeriodService(db)
    summary = await service.get_contract_period_summary(period_id)
    
    if not summary:
        raise HTTPException(status_code=404, detail="Contract period not found")
    
    if summary['project_id'] != project_id:
        raise HTTPException(status_code=400, detail="Contract period does not belong to this project")
    
    return summary


@router.put("/{project_id}/contract-periods/{period_id}")
async def update_contract_period(
    project_id: int,
    period_id: int,
    start_date: Optional[str] = Body(None),
    end_date: Optional[str] = Body(None),
    db: DBSessionDep = None,
    user = Depends(require_admin())
):
    """Update contract period dates (Admin only)"""
    service = ContractPeriodService(db)
    
    # Parse dates
    start_date_obj = None
    if start_date:
        try:
            start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
             raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")

    end_date_obj = None
    if end_date:
        try:
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
             raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD")

    updated = await service.update_period_dates(period_id, start_date_obj, end_date_obj)
    if not updated:
        raise HTTPException(status_code=404, detail="Contract period not found")
        
    return {"success": True}


@router.get("/{project_id}/contract-periods/{period_id}/export-csv")
async def export_contract_period_csv(
    project_id: int,
    period_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Export contract period data to Excel with colors and formatting"""
    try:
        service = ContractPeriodService(db)
        summary = await service.get_contract_period_summary(period_id)
        
        if not summary:
            raise HTTPException(status_code=404, detail="Contract period not found")
        
        if summary['project_id'] != project_id:
            raise HTTPException(status_code=400, detail="Contract period does not belong to this project")
        
        # Get project name
        project = await ProjectRepository(db).get_by_id(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
            from openpyxl.utils import get_column_letter
            
            # Create workbook
            wb = Workbook()
            ws = wb.active
            ws.title = "סיכום תקופת חוזה"
            
            # Define colors and styles
            header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
            title_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
            income_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
            expense_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
            profit_positive_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
            profit_negative_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
            section_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
            
            header_font = Font(bold=True, color="FFFFFF", size=12)
            title_font = Font(bold=True, color="FFFFFF", size=14)
            normal_font = Font(size=11)
            bold_font = Font(bold=True, size=11)
            
            border = Border(
                left=Side(style='thin'),
                right=Side(style='thin'),
                top=Side(style='thin'),
                bottom=Side(style='thin')
            )
            
            row = 1
            
            # Title
            ws.merge_cells(f'A{row}:B{row}')
            cell = ws[f'A{row}']
            cell.value = 'סיכום תקופת חוזה'
            cell.fill = title_fill
            cell.font = title_font
            cell.alignment = Alignment(horizontal='center', vertical='center')
            row += 2
            
            # Project info
            ws[f'A{row}'] = 'שם פרויקט'
            ws[f'A{row}'].font = bold_font
            ws[f'B{row}'] = project.name
            row += 1
            
            ws[f'A{row}'] = 'שנת חוזה'
            ws[f'A{row}'].font = bold_font
            ws[f'B{row}'] = summary['year_label']
            row += 1
            
            ws[f'A{row}'] = 'תאריך התחלה'
            ws[f'A{row}'].font = bold_font
            ws[f'B{row}'] = summary['start_date']
            row += 1
            
            ws[f'A{row}'] = 'תאריך סיום'
            ws[f'A{row}'].font = bold_font
            ws[f'B{row}'] = summary['end_date']
            row += 2
            
            # Financial Summary
            ws.merge_cells(f'A{row}:B{row}')
            cell = ws[f'A{row}']
            cell.value = 'סיכום כלכלי'
            cell.fill = section_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center', vertical='center')
            row += 1
            
            # Financial headers
            ws[f'A{row}'] = 'סוג'
            ws[f'B{row}'] = 'סכום (₪)'
            for col in ['A', 'B']:
                cell = ws[f'{col}{row}']
                cell.fill = header_fill
                cell.font = header_font
                cell.border = border
                cell.alignment = Alignment(horizontal='center', vertical='center')
            row += 1
            
            # Income
            ws[f'A{row}'] = 'סה"כ הכנסות'
            ws[f'B{row}'] = summary['total_income']
            ws[f'A{row}'].font = bold_font
            ws[f'B{row}'].fill = income_fill
            ws[f'B{row}'].number_format = '#,##0.00'
            for col in ['A', 'B']:
                ws[f'{col}{row}'].border = border
            row += 1
            
            # Expense
            ws[f'A{row}'] = 'סה"כ הוצאות'
            ws[f'B{row}'] = summary['total_expense']
            ws[f'A{row}'].font = bold_font
            ws[f'B{row}'].fill = expense_fill
            ws[f'B{row}'].number_format = '#,##0.00'
            for col in ['A', 'B']:
                ws[f'{col}{row}'].border = border
            row += 1
            
            # Profit
            ws[f'A{row}'] = 'סה"כ רווח'
            ws[f'B{row}'] = summary['total_profit']
            ws[f'A{row}'].font = bold_font
            profit_fill = profit_positive_fill if summary['total_profit'] >= 0 else profit_negative_fill
            ws[f'B{row}'].fill = profit_fill
            ws[f'B{row}'].number_format = '#,##0.00'
            for col in ['A', 'B']:
                ws[f'{col}{row}'].border = border
            row += 2
            
            # Budgets
            if summary['budgets']:
                ws.merge_cells(f'A{row}:F{row}')
                cell = ws[f'A{row}']
                cell.value = 'תקציבים'
                cell.fill = section_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal='center', vertical='center')
                row += 1
                
                # Budget headers
                headers = ['קטגוריה', 'סכום (₪)', 'סוג תקופה', 'תאריך התחלה', 'תאריך סיום', 'פעיל']
                for idx, header in enumerate(headers, 1):
                    col = get_column_letter(idx)
                    cell = ws[f'{col}{row}']
                    cell.value = header
                    cell.fill = header_fill
                    cell.font = header_font
                    cell.border = border
                    cell.alignment = Alignment(horizontal='center', vertical='center')
                row += 1
                
                # Budget data
                for budget in summary['budgets']:
                    ws[f'A{row}'] = budget.get('category', '')
                    ws[f'B{row}'] = budget.get('amount', 0)
                    ws[f'B{row}'].number_format = '#,##0.00'
                    ws[f'C{row}'] = budget.get('period_type', '')
                    ws[f'D{row}'] = budget.get('start_date', '') or ''
                    ws[f'E{row}'] = budget.get('end_date', '') or ''
                    ws[f'F{row}'] = 'כן' if budget.get('is_active', False) else 'לא'
                    for col_idx in range(1, 7):
                        col = get_column_letter(col_idx)
                        ws[f'{col}{row}'].border = border
                    row += 1
                row += 1
            
            # Transactions
            if summary['transactions']:
                ws.merge_cells(f'A{row}:G{row}')
                cell = ws[f'A{row}']
                cell.value = 'עסקאות'
                cell.fill = section_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal='center', vertical='center')
                row += 1
                
                # Transaction headers
                headers = ['תאריך', 'סוג', 'סכום (₪)', 'תיאור', 'קטגוריה', 'אמצעי תשלום', 'הערות']
                for idx, header in enumerate(headers, 1):
                    col = get_column_letter(idx)
                    cell = ws[f'{col}{row}']
                    cell.value = header
                    cell.fill = header_fill
                    cell.font = header_font
                    cell.border = border
                    cell.alignment = Alignment(horizontal='center', vertical='center')
                row += 1
                
                # Transaction data
                for tx in summary['transactions']:
                    tx_type = 'הכנסה' if tx.get('type') == 'Income' else 'הוצאה'
                    amount = tx.get('amount', 0)
                    
                    ws[f'A{row}'] = tx.get('tx_date', '')
                    ws[f'B{row}'] = tx_type
                    ws[f'C{row}'] = amount
                    ws[f'C{row}'].number_format = '#,##0.00'
                    ws[f'D{row}'] = tx.get('description', '') or ''
                    ws[f'E{row}'] = tx.get('category', '') or ''
                    ws[f'F{row}'] = tx.get('payment_method', '') or ''
                    ws[f'G{row}'] = tx.get('notes', '') or ''
                    
                    # Color code by type
                    if tx.get('type') == 'Income':
                        ws[f'B{row}'].fill = income_fill
                        ws[f'C{row}'].fill = income_fill
                    else:
                        ws[f'B{row}'].fill = expense_fill
                        ws[f'C{row}'].fill = expense_fill
                    
                    for col_idx in range(1, 8):
                        col = get_column_letter(col_idx)
                        ws[f'{col}{row}'].border = border
                    row += 1
            
            # Auto-adjust column widths
            for col in ws.columns:
                try:
                    if not col:
                        continue
                    max_length = 0
                    col_letter = col[0].column_letter
                    for cell in col:
                        try:
                            if cell.value:
                                max_length = max(max_length, len(str(cell.value)))
                        except:
                            pass
                    adjusted_width = min(max_length + 2, 50)
                    if adjusted_width > 0:
                        ws.column_dimensions[col_letter].width = adjusted_width
                except Exception as e:
                    # Skip if there's an error adjusting column width
                    print(f"Warning: Could not adjust column width: {e}")
                    pass
            
            # Save to BytesIO
            output = io.BytesIO()
            wb.save(output)
            output.seek(0)
            
            # Create filename - use ASCII-safe version to avoid encoding issues in headers
            import re
            # Remove non-ASCII characters from filename for header compatibility
            safe_project_name = re.sub(r'[^\x00-\x7F]', '_', project.name).replace('"', '').replace('/', '_').replace('\\', '_').strip()
            safe_year_label = re.sub(r'[^\x00-\x7F]', '_', str(summary["year_label"])).replace('"', '').replace('/', '_').replace('\\', '_').strip()
            filename = f"contract_period_{safe_year_label}_{safe_project_name}.xlsx"
            
            return Response(
                content=output.getvalue(),
                media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                headers={
                    'Content-Disposition': f'attachment; filename="{filename}"'
                }
            )
        except ImportError as import_err:
            # Fallback to CSV if openpyxl is not available
            print(f"⚠️ openpyxl not available, falling back to CSV: {import_err}")
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Write header with Hebrew support
            writer.writerow(['סיכום תקופת חוזה'])
            writer.writerow([])
            writer.writerow(['שם פרויקט', project.name])
            writer.writerow(['שנת חוזה', summary['year_label']])
            writer.writerow(['תאריך התחלה', summary['start_date']])
            writer.writerow(['תאריך סיום', summary['end_date']])
            writer.writerow([])
            writer.writerow(['סיכום כלכלי'])
            writer.writerow(['סה"כ הכנסות', summary['total_income']])
            writer.writerow(['סה"כ הוצאות', summary['total_expense']])
            writer.writerow(['סה"כ רווח', summary['total_profit']])
            writer.writerow([])
            
            # Write budgets
            if summary['budgets']:
                writer.writerow(['תקציבים'])
                writer.writerow(['קטגוריה', 'סכום', 'סוג תקופה', 'תאריך התחלה', 'תאריך סיום', 'פעיל'])
                for budget in summary['budgets']:
                    writer.writerow([
                        budget.get('category', ''),
                        budget.get('amount', 0),
                        budget.get('period_type', ''),
                        budget.get('start_date', ''),
                        budget.get('end_date', ''),
                        'כן' if budget.get('is_active', False) else 'לא'
                    ])
                writer.writerow([])
            
            # Write transactions
            writer.writerow(['עסקאות'])
            writer.writerow([
                'תאריך',
                'סוג',
                'סכום',
                'תיאור',
                'קטגוריה',
                'אמצעי תשלום',
                'הערות'
            ])
            
            for tx in summary['transactions']:
                writer.writerow([
                    tx.get('tx_date', ''),
                    'הכנסה' if tx.get('type') == 'Income' else 'הוצאה',
                    tx.get('amount', 0),
                    tx.get('description', '') or '',
                    tx.get('category', '') or '',
                    tx.get('payment_method', '') or '',
                    tx.get('notes', '') or ''
                ])
            
            # Prepare response with UTF-8 BOM for Excel compatibility
            csv_content = output.getvalue()
            output.close()
            
            # Add BOM for proper Hebrew display in Excel
            csv_bytes = '\ufeff'.encode('utf-8') + csv_content.encode('utf-8-sig')
            
            # Create filename - use ASCII-safe version to avoid encoding issues in headers
            import re
            # Remove non-ASCII characters from filename for header compatibility
            safe_project_name = re.sub(r'[^\x00-\x7F]', '_', project.name).replace('"', '').replace('/', '_').replace('\\', '_').strip()
            safe_year_label = re.sub(r'[^\x00-\x7F]', '_', str(summary["year_label"])).replace('"', '').replace('/', '_').replace('\\', '_').strip()
            filename = f"contract_period_{safe_year_label}_{safe_project_name}.csv"
            
            return Response(
                content=csv_bytes,
                media_type='text/csv; charset=utf-8',
                headers={
                    'Content-Disposition': f'attachment; filename="{filename}"'
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"❌ Error exporting contract period CSV/Excel: {e}")
        print(f"Traceback: {error_details}")
        raise HTTPException(status_code=500, detail=f"Error exporting CSV: {str(e)}")


@router.post("/{project_id}/check-contract-renewal")
async def check_and_renew_contract(
    project_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Check if contract has ended and renew it automatically if needed"""
    service = ContractPeriodService(db)
    renewed_project = await service.check_and_renew_contract(project_id)
    
    if renewed_project:
        # Reload contract periods after renewal to ensure they're up to date
        periods_by_year = await service.get_previous_contracts_by_year(project_id)
        result = []
        for year in sorted(periods_by_year.keys(), reverse=True):
            result.append({
                'year': year,
                'periods': periods_by_year[year]
            })
        
        return {
            'renewed': True,
            'message': 'חוזה חודש בהצלחה',
            'new_start_date': renewed_project.start_date.isoformat() if renewed_project.start_date else None,
            'new_end_date': renewed_project.end_date.isoformat() if renewed_project.end_date else None,
            'contract_periods': {
                'project_id': project_id,
                'periods_by_year': result
            }
        }
    else:
        return {
            'renewed': False,
            'message': 'החוזה עדיין לא הסתיים או אין תאריך סיום מוגדר'
        }


@router.post("/{project_id}/close-year")
async def close_contract_year(
    project_id: int,
    db: DBSessionDep,
    end_date: str = Form(..., description="End date in YYYY-MM-DD format"),
    user = Depends(require_admin())
):
    """
    Manually close a contract year and archive it.
    This creates a read-only archive entry and starts a new contract period.
    Admin only.
    """
    try:
        # Parse date string to date object
        from datetime import datetime as dt
        end_date_obj = dt.strptime(end_date, "%Y-%m-%d").date()
        
        service = ContractPeriodService(db)
        contract_period = await service.close_year_manually(
            project_id=project_id,
            end_date=end_date_obj,
            archived_by_user_id=user.id
        )
        
        # Reload contract periods after closing
        periods_by_year = await service.get_previous_contracts_by_year(project_id)
        
        return {
            'success': True,
            'message': 'שנה נסגרה ונשמרה בארכיון בהצלחה',
            'contract_period_id': contract_period.id,
            'start_date': contract_period.start_date.isoformat(),
            'end_date': contract_period.end_date.isoformat(),
            'contract_year': contract_period.contract_year,
            'periods_by_year': periods_by_year
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))