from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from datetime import date
import logging
import re

from backend.core.deps import DBSessionDep, require_roles, get_current_user
from backend.iam.decorators import require_permission
from backend.repositories.transaction_repository import TransactionRepository
from backend.repositories.project_repository import ProjectRepository
from backend.repositories.contract_period_repository import ContractPeriodRepository
from backend.repositories.supplier_repository import SupplierRepository
from backend.repositories.document_repository import DocumentRepository
from backend.repositories.category_repository import CategoryRepository
from backend.repositories.user_repository import UserRepository
from backend.models.document import Document
from backend.schemas.transaction import TransactionCreate, TransactionOut, TransactionUpdate
from backend.services.transaction_service import TransactionService, normalize_payment_method_for_db
from backend.services.audit_service import AuditService
from backend.services.mappers import transaction_to_dict, transaction_to_dict_with_user
from backend.services.validators import get_first_contract_start, validate_date_not_before_contract, resolve_category
from backend.services.s3_service import S3Service
from backend.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


def sanitize_filename(name: str) -> str:
    """Sanitize supplier name to be used as directory name"""
    sanitized = re.sub(r'[<>:"/\\|?*]', '_', name)
    sanitized = sanitized.strip(' .')
    sanitized = re.sub(r'[\s_]+', '_', sanitized)
    if not sanitized:
        sanitized = 'supplier'
    return sanitized


@router.get("/project/{project_id}", response_model=list[TransactionOut])
async def list_transactions(project_id: int, db: DBSessionDep, user=Depends(get_current_user)):
    transactions_data = await TransactionService(db).list_by_project(project_id, user_id=user.id)
    from backend.schemas.transaction import TransactionOut
    result = []
    for tx_dict in transactions_data:
        try:
            tx_dict.setdefault('category', None)
            result.append(TransactionOut.model_validate(tx_dict))
        except Exception:
            logger.warning("דילוג על עסקה לא תקינה בפרויקט %s", project_id, exc_info=True)
            continue

    return result


@router.get("/check-duplicate")
async def check_duplicate_transaction(
    db: DBSessionDep,
    user=Depends(get_current_user),
    project_id: int = Query(..., description="Project ID"),
    tx_date: date = Query(..., description="Transaction date (YYYY-MM-DD)"),
    amount: float = Query(..., description="Transaction amount"),
    supplier_id: int | None = Query(None, description="Supplier ID (optional)"),
    type: str = Query("Expense", description="Transaction type")
):
    """Check for duplicate transactions without creating one - for real-time validation"""
    # Validate inputs
    if not project_id or not tx_date or not amount:
        return {"has_duplicate": False, "duplicates": []}
    
    # Only check for Expense transactions
    if type != "Expense":
        return {"has_duplicate": False, "duplicates": []}
    
    service = TransactionService(db)
    duplicates = await service.check_duplicate_transaction(
        project_id=project_id,
        tx_date=tx_date,
        amount=amount,
        supplier_id=supplier_id,
        type=type
    )
    
    if not duplicates:
        return {"has_duplicate": False, "duplicates": []}
    
    # Format duplicate details - batch load all suppliers at once
    supplier_ids = [dup.supplier_id for dup in duplicates if dup.supplier_id]
    suppliers_map: dict[int, str] = {}
    if supplier_ids:
        from sqlalchemy import select as sa_select
        from backend.models.supplier import Supplier
        result = await db.execute(
            sa_select(Supplier.id, Supplier.name).where(Supplier.id.in_(supplier_ids))
        )
        suppliers_map = {row.id: row.name for row in result}

    duplicate_details = [
        {
            "id": dup.id,
            "tx_date": str(dup.tx_date),
            "amount": float(dup.amount),
            "supplier_id": dup.supplier_id,
            "supplier_name": suppliers_map.get(dup.supplier_id) if dup.supplier_id else None,
        }
        for dup in duplicates
    ]

    return {
        "has_duplicate": True,
        "duplicates": duplicate_details
    }


@router.post("/", response_model=TransactionOut)
async def create_transaction(db: DBSessionDep, data: TransactionCreate, user=Depends(require_permission("write", "transaction", project_id_param=None))):
    """Create transaction - accessible to all authenticated users"""
    project = await ProjectRepository(db).get_by_id(data.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate supplier if provided
    # Supplier is required only for Expense transactions (not for Income or fund transactions or when category is "אחר")

    # Check if category is "Other"
    is_other_category = False
    category_obj = None
    if data.category_id:
        category_obj = await CategoryRepository(db).get(data.category_id)
        if category_obj and category_obj.name == 'אחר':
            is_other_category = True

    if data.supplier_id is not None:
        supplier = await SupplierRepository(db).get(data.supplier_id)
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        if not supplier.is_active:
            raise HTTPException(status_code=400, detail="Cannot create transaction with inactive supplier")
    elif data.type == 'Expense' and not data.from_fund and not is_other_category:
        # Supplier is required for Expense transactions (not for Income, fund transactions, or when category is "אחר")
        raise HTTPException(status_code=400, detail="Supplier is required for expense transactions")

    # Validate transaction date is not before FIRST contract start (allow old contracts)
    first_start = await get_first_contract_start(db, data.project_id) if project else None
    try:
        validate_date_not_before_contract(data.tx_date, first_start)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Add user_id to transaction data
    transaction_data = data.model_dump()
    transaction_data['created_by_user_id'] = user.id

    # Handle fund operations if from_fund is True
    if data.from_fund:
        from backend.services.fund_service import FundService
        fund_service = FundService(db)
        fund = await fund_service.get_fund_by_project(data.project_id)
        if not fund:
            raise HTTPException(status_code=400, detail="Fund not found for this project")

        if data.type == 'Expense':
            # Deduct from fund for expenses
            await fund_service.deduct_from_fund(data.project_id, data.amount)
        elif data.type == 'Income':
            # Add to fund for income
            await fund_service.add_to_fund(data.project_id, data.amount)

    logger.info("יוצר עסקה עם created_by_user_id=%s, user=%s", user.id, user.full_name)

    # Create transaction (duplicate check is done inside TransactionService.create)
    try:
        transaction = await TransactionService(db).create(**transaction_data)
    except ValueError as e:
        error_msg = str(e)
        if (
            "זוהתה עסקה כפולה" in error_msg
            or "נמצאה חפיפה" in error_msg
            or "לא ניתן ליצור עסקה לתקופה" in error_msg
        ):
            raise HTTPException(status_code=409, detail=error_msg)
        logger.exception("שגיאה ביצירת עסקה")
        raise HTTPException(status_code=400, detail=error_msg)

    logger.info("עסקה נוצרה עם id=%s, created_by_user_id=%s", transaction.id, transaction.created_by_user_id)

    # Get project name for audit log
    project_name = project.name if project else f"פרויקט {transaction.project_id}"

    # Log create action with full details
    await AuditService(db).log_transaction_action(
        user_id=user.id,
        action='create',
        transaction_id=transaction.id,
        details={
            'project_id': transaction.project_id,
            'project_name': project_name,
            'type': transaction.type,
            'amount': str(transaction.amount),
            'category': transaction.category.name if transaction.category else None,
            'description': transaction.description,
            'tx_date': str(transaction.tx_date),
            'supplier_id': transaction.supplier_id,
            'payment_method': transaction.payment_method,
            'notes': transaction.notes,
            'is_exceptional': transaction.is_exceptional,
            'is_generated': transaction.is_generated,
            'file_path': transaction.file_path
        }
    )

    # Convert to dict with user info using shared mapper
    user_repo = UserRepository(db)
    result = await transaction_to_dict_with_user(transaction, user_repo)
    # Fallback category name from the validated category_obj if relationship not loaded
    if result.get('category') is None and category_obj:
        result['category'] = category_obj.name

    return result


@router.post("/{tx_id}/upload", response_model=TransactionOut)
async def upload_receipt(
    tx_id: int,
    db: DBSessionDep,
    file: UploadFile = File(...),
    user=Depends(require_permission("read", "transaction", resource_id_param="tx_id")),
):
    """Upload receipt for transaction - allowed to anyone who can read transactions"""
    tx = await TransactionRepository(db).get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    result = await TransactionService(db).attach_file(tx, file)

    # Log upload action
    await AuditService(db).log_transaction_action(
        user_id=user.id,
        action='upload_receipt',
        transaction_id=tx_id,
        details={'filename': file.filename}
    )

    # Convert to dict with user info using shared mapper
    user_repo = UserRepository(db)
    return await transaction_to_dict_with_user(result, user_repo)


@router.get("/{tx_id}/documents", response_model=list[dict])
async def get_transaction_documents(tx_id: int, db: DBSessionDep, user=Depends(get_current_user)):
    """Get all documents for a transaction - accessible to all authenticated users"""
    tx = await TransactionRepository(db).get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get all documents for this transaction
    docs = await DocumentRepository(db).get_by_transaction_id(tx_id)

    result = []

    for doc in docs:
        result.append({
            "id": doc.id,
            "transaction_id": doc.entity_id,
            # For new documents we store full S3 URL in file_path; for old ones this may still be a relative path
            "file_path": doc.file_path,
            "description": doc.description,
            "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None
        })

    return result


@router.put("/{tx_id}/documents/{doc_id}", response_model=dict)
async def update_transaction_document(
        tx_id: int,
        doc_id: int,
        db: DBSessionDep,
        description: str | None = Form(None),
        user=Depends(require_permission("update", "transaction", resource_id_param="tx_id"))
):
    """Update document description for a transaction"""
    # Verify transaction exists
    tx = await TransactionRepository(db).get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get the document
    doc_repo = DocumentRepository(db)
    doc = await doc_repo.get_by_id(doc_id)

    if not doc or doc.entity_type != "transaction" or doc.entity_id != tx_id:
        raise HTTPException(status_code=404, detail="Document not found")

    # Update description
    doc.description = description.strip() if description and description.strip() else None
    await doc_repo.update(doc)

    return {
        "id": doc.id,
        "transaction_id": doc.entity_id,
        "description": doc.description,
        "file_path": doc.file_path
    }


@router.post("/{tx_id}/supplier-document", response_model=dict)
async def upload_supplier_document(
    tx_id: int,
    db: DBSessionDep,
    file: UploadFile = File(...),
    user=Depends(require_permission("read", "transaction", resource_id_param="tx_id")),
):
    """Upload document for transaction - allowed to anyone who can read transactions"""
    tx = await TransactionRepository(db).get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Prepare upload prefix
    s3 = S3Service()

    # If transaction has supplier, use supplier prefix structure
    if tx.supplier_id:
        supplier = await SupplierRepository(db).get(tx.supplier_id)
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        supplier_name_sanitized = sanitize_filename(supplier.name)
        prefix = f"suppliers/{supplier_name_sanitized}"
        supplier_id = tx.supplier_id
    else:
        # If no supplier, use a generic transactions prefix
        prefix = "transactions"
        supplier_id = None

    # Upload to S3 (using thread to avoid blocking loop)
    # Reset file pointer
    await file.seek(0)

    import asyncio

    file_url = await asyncio.to_thread(
        s3.upload_file,
        prefix=prefix,
        file_obj=file.file,
        filename=file.filename or "supplier-document",
        content_type=file.content_type,
    )

    # Create document linked to transaction
    doc = Document(transaction_id=tx_id, entity_type="transaction", entity_id=tx_id, file_path=file_url, source_table="transaction", source_id=tx_id)
    await DocumentRepository(db).create(doc)

    return {
        "id": doc.id,
        "file_path": file_url,
        "supplier_id": supplier_id,
        "transaction_id": tx_id,
        "description": doc.description
    }


@router.delete("/{tx_id}/documents/{doc_id}")
async def delete_transaction_document(
        tx_id: int,
        doc_id: int,
        db: DBSessionDep,
        user=Depends(require_permission("update", "transaction", resource_id_param="tx_id"))
):
    """Delete document from transaction"""
    import asyncio

    # Verify transaction exists
    tx = await TransactionRepository(db).get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get the document
    doc_repo = DocumentRepository(db)
    doc = await doc_repo.get_by_id(doc_id)

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.entity_type != "transaction" or doc.entity_id != tx_id:
        raise HTTPException(status_code=400, detail="Document does not belong to this transaction")

    # Store file path before deletion
    file_path = doc.file_path

    # Delete the document from database
    await doc_repo.delete(doc)

    # Try to delete from S3 if file_path is an S3 URL
    if file_path and (
            "s3" in file_path.lower() or "amazonaws.com" in file_path or settings.AWS_S3_BASE_URL and file_path.startswith(
        settings.AWS_S3_BASE_URL)):
        try:
            s3 = S3Service()
            # Run in thread to avoid blocking
            await asyncio.to_thread(s3.delete_file, file_path)
        except Exception as e:
            # Log but don't fail - document is already deleted from DB
            logger.warning("מחיקת קובץ מ-S3 נכשלה", exc_info=True)

    return {"ok": True}


@router.put("/{tx_id}", response_model=TransactionOut)
async def update_transaction(tx_id: int, db: DBSessionDep, data: TransactionUpdate, user=Depends(require_permission("update", "transaction", resource_id_param="tx_id"))):
    """Update transaction - accessible to all authenticated users"""
    repo = TransactionRepository(db)
    tx = await repo.get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get project name for audit log
    project = await ProjectRepository(db).get_by_id(tx.project_id)
    project_name = project.name if project else f"פרויקט {tx.project_id}"

    # Validate transaction date is not before FIRST contract start (if updating tx_date)
    if data.tx_date is not None and project:
        first_start = await get_first_contract_start(db, tx.project_id)
        try:
            validate_date_not_before_contract(data.tx_date, first_start)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # Store old values for audit log
    old_values = {
        'amount': str(tx.amount),
        'type': tx.type,
        'category': tx.category.name if tx.category else '',
        'description': tx.description or '',
        'tx_date': str(tx.tx_date),
        'supplier_id': tx.supplier_id,
        'payment_method': tx.payment_method or '',
        'notes': tx.notes or '',
        'is_exceptional': tx.is_exceptional,
        'is_generated': tx.is_generated,
        'file_path': tx.file_path or ''
    }

    # Validate supplier if provided
    if data.supplier_id is not None:
        supplier = await SupplierRepository(db).get(data.supplier_id)
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        if not supplier.is_active:
            raise HTTPException(status_code=400, detail="Cannot update transaction with inactive supplier")

    # Check for duplicates if allow_duplicate is False
    if not data.allow_duplicate:
        # Resolve new values or fallback to existing
        new_date = data.tx_date if data.tx_date is not None else tx.tx_date
        new_amount = data.amount if data.amount is not None else tx.amount
        new_type = data.type if data.type is not None else tx.type
        new_supplier_id = data.supplier_id if data.supplier_id is not None else tx.supplier_id

        service = TransactionService(db)
        duplicates = await service.check_duplicate_transaction(
            project_id=tx.project_id,
            tx_date=new_date,
            amount=new_amount,
            supplier_id=new_supplier_id,
            type=new_type
        )

        # Filter out current transaction
        duplicates = [d for d in duplicates if d.id != tx_id]

        if duplicates:
            raise HTTPException(status_code=409, detail="זוהתה עסקה כפולה")

    update_data = data.model_dump(exclude_unset=True)
    if 'allow_duplicate' in update_data:
        del update_data['allow_duplicate']

    # Validate category if being updated (unless it's a cash register transaction)
    from_fund = update_data.get('from_fund', tx.from_fund if hasattr(tx, 'from_fund') else False)
    category_name = update_data.pop('category', None) if 'category' in update_data else None
    category_id = update_data.get('category_id') if 'category_id' in update_data else None

    if category_id is not None or category_name is not None:
        resolved_category = await resolve_category(
            db,
            category_id=category_id,
            category_name=category_name,
            allow_missing=from_fund
        )
        update_data['category_id'] = resolved_category.id if resolved_category else None
    elif ('category' in data.model_dump(exclude_unset=False) and category_name is None) or (
            'category_id' in update_data and update_data['category_id'] is None):
        if not from_fund:
            raise HTTPException(
                status_code=400,
                detail="לא ניתן להסיר קטגוריה מעסקה רגילה. רק עסקאות קופה יכולות להיות ללא קטגוריה."
            )

    # Normalize payment_method: API may send enum name (e.g. CENTRALIZED_YEAR_END); DB expects enum value (Hebrew)
    if "payment_method" in update_data:
        update_data["payment_method"] = normalize_payment_method_for_db(update_data.get("payment_method"))

    for k, v in update_data.items():
        setattr(tx, k, v)

    updated_tx = await repo.update(tx)

    # Log update action with full details
    new_values = {k: str(v) for k, v in update_data.items()}
    await AuditService(db).log_transaction_action(
        user_id=user.id,
        action='update',
        transaction_id=tx_id,
        details={
            'project_id': tx.project_id,
            'project_name': project_name,
            'old_values': old_values,
            'new_values': new_values
        }
    )

    # Convert to dict with user info using shared mapper
    user_repo = UserRepository(db)
    return await transaction_to_dict_with_user(updated_tx, user_repo)


@router.post("/{tx_id}/rollback")
async def rollback_transaction(tx_id: int, db: DBSessionDep, user=Depends(get_current_user)):
    """Rollback a transaction created by the current user with no documents (e.g. group transaction when document upload failed)."""
    repo = TransactionRepository(db)
    tx = await repo.get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.created_by_user_id is None:
        raise HTTPException(
            status_code=403,
            detail="Cannot rollback: transaction has no creator (legacy). Use delete instead."
        )
    if tx.created_by_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the creator can rollback this transaction")
    if len(tx.documents) > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot rollback transaction that has documents; use delete instead"
        )
    if getattr(tx, "from_fund", False) and tx.type == "Expense":
        from backend.services.fund_service import FundService
        fund_service = FundService(db)
        await fund_service.refund_to_fund(tx.project_id, tx.amount)
    await repo.delete(tx)
    return {"ok": True}


@router.delete("/{tx_id}")
async def delete_transaction(tx_id: int, db: DBSessionDep, user=Depends(require_permission("delete", "transaction", resource_id_param="tx_id"))):
    """Delete transaction - Admin only"""
    repo = TransactionRepository(db)
    tx = await repo.get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Restore fund balance if this was a fund transaction
    if getattr(tx, 'from_fund', False) and tx.type == 'Expense':
        from backend.services.fund_service import FundService
        fund_service = FundService(db)
        await fund_service.refund_to_fund(tx.project_id, tx.amount)

    # Get project name for audit log
    project = await ProjectRepository(db).get_by_id(tx.project_id)
    project_name = project.name if project else f"פרויקט {tx.project_id}"

    # Store transaction details for audit log
    tx_details = {
        'project_id': tx.project_id,
        'project_name': project_name,
        'type': tx.type,
        'amount': str(tx.amount),
        'category': tx.category.name if tx.category else None,
        'description': tx.description,
        'tx_date': str(tx.tx_date),
        'supplier_id': tx.supplier_id,
        'payment_method': tx.payment_method,
        'notes': tx.notes,
        'is_exceptional': tx.is_exceptional,
        'is_generated': tx.is_generated,
        'file_path': tx.file_path
    }

    await repo.delete(tx)

    # Log delete action
    await AuditService(db).log_transaction_action(
        user_id=user.id,
        action='delete',
        transaction_id=tx_id,
        details=tx_details
    )

    return {"ok": True}
