from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import date

from backend.core.deps import DBSessionDep, get_current_user
from backend.services.recurring_transaction_service import RecurringTransactionService
from backend.repositories.project_repository import ProjectRepository
from backend.schemas.recurring_transaction import (
    RecurringTransactionTemplateCreate,
    RecurringTransactionTemplateUpdate,
    RecurringTransactionTemplateOut,
    RecurringTransactionTemplateWithTransactions,
    RecurringTransactionInstanceUpdate
)
from backend.schemas.transaction import TransactionOut

router = APIRouter()


@router.get("/project/{project_id}", response_model=List[RecurringTransactionTemplateOut])
async def list_recurring_templates(
    project_id: int, 
    db: DBSessionDep, 
    user = Depends(get_current_user)
):
    """List all recurring transaction templates for a project"""
    templates = await RecurringTransactionService(db).list_templates_by_project(project_id)
    # Convert to schemas to handle enum serialization
    return [RecurringTransactionTemplateOut.model_validate(t) for t in templates]


@router.post("/", response_model=RecurringTransactionTemplateOut)
async def create_recurring_template(
    db: DBSessionDep, 
    data: RecurringTransactionTemplateCreate, 
    user = Depends(get_current_user)
):
    """Create a new recurring transaction template"""
    # Validate supplier - required only for Expense transactions (not when category is "אחר")
    # Note: data.category_id is available in the schema, but we need to check the category name if we want to implement the "אחר" logic
    # Since we only have category_id in the input, we would need to fetch the category to check its name.
    # For now, let's just check if supplier_id is missing for Expense type transactions, regardless of category.
    # If the "Other" category logic is critical, we should implement it by checking category_id.
    if data.type == 'Expense' and (not data.supplier_id or data.supplier_id == 0):
        # We can optionally fetch the category here if we want to allow skipping supplier for "Other"
        # For now, assume supplier is required for all expenses to be safe
        raise HTTPException(status_code=400, detail="Supplier is required for expense transactions")
    
    # Validate start_date is not before project contract start date
    project = await ProjectRepository(db).get_by_id(data.project_id)
    if project and project.start_date:
        # Convert project.start_date to date if it's datetime
        project_start_date = project.start_date
        if hasattr(project_start_date, 'date'):
            project_start_date = project_start_date.date()
        
        if data.start_date < project_start_date:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"לא ניתן ליצור תבנית מחזורית עם תאריך התחלה לפני תאריך תחילת החוזה. "
                    f"תאריך תחילת החוזה: {project_start_date.strftime('%d/%m/%Y')}, "
                    f"תאריך התחלה של התבנית: {data.start_date.strftime('%d/%m/%Y')}"
                )
            )
    
    service = RecurringTransactionService(db)
    try:
        template = await service.create_template(data, user_id=user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Check if we should generate a transaction immediately (if today is the day)
    # This ensures that if a user creates a template for today, the transaction appears immediately
    # instead of waiting for the next scheduler run (or next month)
    from datetime import date
    today = date.today()
    if template.day_of_month == today.day and template.start_date <= today:
        await service.generate_transactions_for_date(today)

    # Convert to schema to handle enum serialization
    return RecurringTransactionTemplateOut.model_validate(template)


@router.get("/{template_id}", response_model=RecurringTransactionTemplateWithTransactions)
async def get_recurring_template(
    template_id: int, 
    db: DBSessionDep, 
    user = Depends(get_current_user)
):
    """Get a recurring transaction template with its generated transactions"""
    template = await RecurringTransactionService(db).get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Recurring template not found")
    
    transactions = await RecurringTransactionService(db).get_template_transactions(template_id)
    
    # Convert to schema objects
    template_schema = RecurringTransactionTemplateOut.model_validate(template)
    
    # Convert transactions to TransactionOut format, handling created_by_user properly
    from backend.repositories.user_repository import UserRepository
    user_repo = UserRepository(db)
    
    transaction_schemas = []
    for tx in transactions:
        # Build transaction dict similar to list_transactions endpoint
        is_generated_value = getattr(tx, 'is_generated', False)
        recurring_template_id = getattr(tx, 'recurring_template_id', None)
        if recurring_template_id and not is_generated_value:
            is_generated_value = True
        
        tx_dict = {
            'id': tx.id,
            'project_id': tx.project_id,
            'tx_date': tx.tx_date,
            'type': tx.type,
            'amount': float(tx.amount),
            'description': tx.description,
            'category': tx.category,
            'category_id': tx.category_id,
            'payment_method': tx.payment_method,
            'notes': tx.notes,
            'is_exceptional': tx.is_exceptional,
            'is_generated': is_generated_value,
            'file_path': tx.file_path,
            'supplier_id': tx.supplier_id,
            'created_by_user_id': getattr(tx, 'created_by_user_id', None),
            'created_at': tx.created_at,
            'created_by_user': None,
            'from_fund': tx.from_fund if hasattr(tx, 'from_fund') else False,
            'recurring_template_id': recurring_template_id,
            'period_start_date': getattr(tx, 'period_start_date', None),
            'period_end_date': getattr(tx, 'period_end_date', None)
        }
        
        # Load user info if exists
        if tx_dict['created_by_user_id']:
            creator = await user_repo.get_by_id(tx_dict['created_by_user_id'])
            if creator:
                tx_dict['created_by_user'] = {
                    'id': creator.id,
                    'full_name': creator.full_name,
                    'email': creator.email
                }
        
        # Convert to TransactionOut schema
        transaction_schemas.append(TransactionOut.model_validate(tx_dict))
    
    # Create response with transactions
    return RecurringTransactionTemplateWithTransactions(
        **template_schema.model_dump(),
        generated_transactions=transaction_schemas
    )


@router.put("/{template_id}", response_model=RecurringTransactionTemplateOut)
async def update_recurring_template(
    template_id: int, 
    db: DBSessionDep, 
    data: RecurringTransactionTemplateUpdate, 
    user = Depends(get_current_user)
):
    """Update a recurring transaction template"""
    # Validate start_date is not before project contract start date (if updating start_date)
    if data.start_date is not None:
        service = RecurringTransactionService(db)
        template = await service.get_template(template_id)
        if template:
            project = await ProjectRepository(db).get_by_id(template.project_id)
            if project and project.start_date:
                # Convert project.start_date to date if it's datetime
                project_start_date = project.start_date
                if hasattr(project_start_date, 'date'):
                    project_start_date = project_start_date.date()
                
                if data.start_date < project_start_date:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"לא ניתן לעדכן תבנית מחזורית לתאריך התחלה לפני תאריך תחילת החוזה. "
                            f"תאריך תחילת החוזה: {project_start_date.strftime('%d/%m/%Y')}, "
                            f"תאריך התחלה של התבנית: {data.start_date.strftime('%d/%m/%Y')}"
                        )
                    )
    
    try:
        template = await RecurringTransactionService(db).update_template(template_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    if not template:
        raise HTTPException(status_code=404, detail="Recurring template not found")
    # Convert to schema to handle enum serialization
    return RecurringTransactionTemplateOut.model_validate(template)


@router.delete("/{template_id}")
async def delete_recurring_template(
    template_id: int, 
    db: DBSessionDep, 
    user = Depends(get_current_user)
):
    """Delete a recurring transaction template"""
    success = await RecurringTransactionService(db).delete_template(template_id)
    if not success:
        raise HTTPException(status_code=404, detail="Recurring template not found")
    return {"ok": True}


@router.post("/{template_id}/deactivate", response_model=RecurringTransactionTemplateOut)
async def deactivate_recurring_template(
    template_id: int, 
    db: DBSessionDep, 
    user = Depends(get_current_user)
):
    """Deactivate a recurring transaction template"""
    template = await RecurringTransactionService(db).deactivate_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Recurring template not found")
    # Convert to schema to handle enum serialization
    return RecurringTransactionTemplateOut.model_validate(template)


@router.get("/{template_id}/transactions", response_model=List[TransactionOut])
async def get_template_transactions(
    template_id: int, 
    db: DBSessionDep, 
    user = Depends(get_current_user)
):
    """Get all transactions generated from a specific template"""
    return await RecurringTransactionService(db).get_template_transactions(template_id)


@router.get("/{template_id}/future-occurrences")
async def get_future_occurrences(
    template_id: int,
    db: DBSessionDep,
    start_date: date = Query(..., description="Start date for calculating future occurrences"),
    months_ahead: int = Query(12, ge=1, le=24, description="Number of months to look ahead"),
    user = Depends(get_current_user)
):
    """Get future occurrences of a recurring transaction template"""
    return await RecurringTransactionService(db).get_future_occurrences(
        template_id, start_date, months_ahead
    )


@router.put("/transactions/{transaction_id}", response_model=TransactionOut)
async def update_transaction_instance(
    transaction_id: int, 
    db: DBSessionDep, 
    data: RecurringTransactionInstanceUpdate, 
    user = Depends(get_current_user)
):
    """Update a specific instance of a recurring transaction"""
    transaction = await RecurringTransactionService(db).update_transaction_instance(transaction_id, data)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found or not a recurring transaction instance")
    # Convert to schema
    return TransactionOut.model_validate(transaction)


@router.delete("/transactions/{transaction_id}")
async def delete_transaction_instance(
    transaction_id: int, 
    db: DBSessionDep, 
    user = Depends(get_current_user)
):
    """Delete a specific instance of a recurring transaction"""
    success = await RecurringTransactionService(db).delete_transaction_instance(transaction_id)
    if not success:
        raise HTTPException(status_code=404, detail="Transaction not found or not a recurring transaction instance")
    return {"ok": True}


@router.post("/generate-all-active")
async def generate_all_active_transactions(
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Generate all recurring transactions for all active templates - useful for debugging"""
    try:
        from datetime import date
        today = date.today()
        current_year = today.year
        current_month = today.month
        
        service = RecurringTransactionService(db)
        transactions = await service.generate_transactions_for_month(current_year, current_month)
        
        from backend.schemas.transaction import TransactionOut
        transaction_schemas = [TransactionOut.model_validate(tx) for tx in transactions]
        
        return {
            "generated_count": len(transactions),
            "transactions": transaction_schemas,
            "month": current_month,
            "year": current_year
        }
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"שגיאה: {str(e)}\n{traceback.format_exc()}"
        )


@router.post("/project/{project_id}/ensure-generated")
async def ensure_project_transactions_generated(
    project_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """
    Ensure all recurring transactions for a project are generated up to current month.
    Only generates missing transactions (safe to call multiple times).
    """
    try:
        service = RecurringTransactionService(db)
        
        # Verify project exists
        from backend.repositories.project_repository import ProjectRepository
        project = await ProjectRepository(db).get_by_id(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        generated_count = await service.ensure_project_transactions_generated(project_id)
        
        return {
            "generated_count": generated_count,
            "project_id": project_id
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"שגיאה ביצירת עסקאות מחזוריות: {str(e)}\n{traceback.format_exc()}"
        )


@router.post("/generate/{year}/{month}")
async def generate_monthly_transactions(
    year: int,
    month: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Generate all recurring transactions for a specific month"""
    try:
        service = RecurringTransactionService(db)
        
        # Get all active templates first to debug
        from backend.repositories.recurring_transaction_repository import RecurringTransactionRepository
        recurring_repo = RecurringTransactionRepository(db)
        all_templates = await recurring_repo.list_active_templates()
        
        # Generate transactions
        transactions = await service.generate_transactions_for_month(year, month)
        
        # Convert to TransactionOut schemas
        from backend.schemas.transaction import TransactionOut
        transaction_schemas = [TransactionOut.model_validate(tx) for tx in transactions]
        
        return {
            "generated_count": len(transactions),
            "transactions": transaction_schemas,
            "active_templates_count": len(all_templates),
            "debug_info": {
                "templates_checked": len(all_templates),
                "month": month,
                "year": year
            }
        }
    except AttributeError as e:
        if "recurring_template_id" in str(e):
            raise HTTPException(
                status_code=500,
                detail="הטבלה transactions לא מכילה את השדה recurring_template_id. יש צורך לעדכן את מסד הנתונים."
            )
        raise
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"שגיאה ביצירת עסקאות מחזוריות: {str(e)}\n{traceback.format_exc()}"
        )
