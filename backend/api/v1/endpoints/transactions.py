from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import os
import re
from uuid import uuid4

from backend.core.deps import DBSessionDep, require_roles, get_current_user, require_admin
from backend.core.config import settings
from backend.repositories.transaction_repository import TransactionRepository
from backend.repositories.project_repository import ProjectRepository
from backend.repositories.supplier_repository import SupplierRepository
from backend.repositories.supplier_document_repository import SupplierDocumentRepository
from backend.repositories.category_repository import CategoryRepository
from backend.models.supplier_document import SupplierDocument
from backend.schemas.transaction import TransactionCreate, TransactionOut, TransactionUpdate
from backend.services.transaction_service import TransactionService
from backend.services.audit_service import AuditService
from backend.models.user import UserRole
from backend.services.s3_service import S3Service

router = APIRouter()


def sanitize_filename(name: str) -> str:
    """Sanitize supplier name to be used as directory name"""
    # Remove or replace invalid characters for Windows/Linux file paths
    sanitized = re.sub(r'[<>:"/\\|?*]', '_', name)
    # Remove leading/trailing spaces and dots
    sanitized = sanitized.strip(' .')
    # Replace multiple spaces/underscores with single underscore
    sanitized = re.sub(r'[\s_]+', '_', sanitized)
    # If empty after sanitization, use a default
    if not sanitized:
        sanitized = 'supplier'
    return sanitized


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
            continue

    return result


@router.post("/", response_model=TransactionOut)
async def create_transaction(db: DBSessionDep, data: TransactionCreate, user=Depends(get_current_user)):
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

    # Validate transaction date is not before project contract start date
    if project and project.start_date:
        # Convert project.start_date to date if it's datetime
        project_start_date = project.start_date
        if hasattr(project_start_date, 'date'):
            project_start_date = project_start_date.date()

        if data.tx_date < project_start_date:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"לא ניתן ליצור עסקה לפני תאריך תחילת החוזה. "
                    f"תאריך תחילת החוזה: {project_start_date.strftime('%d/%m/%Y')}, "
                    f"תאריך העסקה: {data.tx_date.strftime('%d/%m/%Y')}"
                )
            )

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

    # Debug: Print to verify user_id is being set
    print(f"DEBUG: Creating transaction with created_by_user_id={user.id}, user={user.full_name}")

    # Create transaction (duplicate check is done inside TransactionService.create)
    try:
        transaction = await TransactionService(db).create(**transaction_data)
    except ValueError as e:
        # Convert ValueError from duplicate check to HTTPException
        error_msg = str(e)
        if "זוהתה עסקה כפולה" in error_msg:
            raise HTTPException(status_code=409, detail=error_msg)
        raise HTTPException(status_code=400, detail=error_msg)

    # Debug: Verify transaction was created with user_id
    print(f"DEBUG: Transaction created with id={transaction.id}, created_by_user_id={transaction.created_by_user_id}")

    # Get project name for audit log
    project_name = project.name if project else f"Project {transaction.project_id}"

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

    # Convert to dict with user info
    from backend.repositories.user_repository import UserRepository
    user_repo = UserRepository(db)

    result = {
        'id': transaction.id,
        'project_id': transaction.project_id,
        'tx_date': transaction.tx_date,
        'type': transaction.type,
        'amount': float(transaction.amount),
        'description': transaction.description,
        'category': transaction.category or (category_obj.name if category_obj else None),
        'category_id': transaction.category_id,
        'payment_method': transaction.payment_method,
        'notes': transaction.notes,
        'is_exceptional': transaction.is_exceptional,
        'is_generated': transaction.is_generated,
        'file_path': transaction.file_path,
        'supplier_id': transaction.supplier_id,
        'created_by_user_id': transaction.created_by_user_id,
        'created_at': transaction.created_at,
        'created_by_user': None,
        'from_fund': transaction.from_fund if hasattr(transaction, 'from_fund') else False,
        'recurring_template_id': getattr(transaction, 'recurring_template_id', None),
        'period_start_date': getattr(transaction, 'period_start_date', None),
        'period_end_date': getattr(transaction, 'period_end_date', None)
    }

    # Load user info if exists
    if transaction.created_by_user_id:
        creator = await user_repo.get_by_id(transaction.created_by_user_id)
        if creator:
            result['created_by_user'] = {
                'id': creator.id,
                'full_name': creator.full_name,
                'email': creator.email
            }

    return result


@router.post("/{tx_id}/upload", response_model=TransactionOut)
async def upload_receipt(tx_id: int, db: DBSessionDep, file: UploadFile = File(...), user=Depends(get_current_user)):
    """Upload receipt for transaction - accessible to all authenticated users"""
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

    # Convert to dict with user info
    from backend.repositories.user_repository import UserRepository
    user_repo = UserRepository(db)

    transaction_dict = {
        'id': result.id,
        'project_id': result.project_id,
        'tx_date': result.tx_date,
        'type': result.type,
        'amount': float(result.amount),
        'description': result.description,
        'category': result.category,
        'category_id': result.category_id,
        'payment_method': result.payment_method,
        'notes': result.notes,
        'is_exceptional': result.is_exceptional,
        'is_generated': result.is_generated,
        'file_path': result.file_path,
        'supplier_id': result.supplier_id,
        'created_by_user_id': result.created_by_user_id,
        'created_at': result.created_at,
        'created_by_user': None,
        'recurring_template_id': getattr(result, 'recurring_template_id', None),
        'period_start_date': getattr(result, 'period_start_date', None),
        'period_end_date': getattr(result, 'period_end_date', None)
    }

    # Load user info if exists
    if result.created_by_user_id:
        creator = await user_repo.get_by_id(result.created_by_user_id)
        if creator:
            transaction_dict['created_by_user'] = {
                'id': creator.id,
                'full_name': creator.full_name,
                'email': creator.email
            }

    return transaction_dict


@router.get("/{tx_id}/documents", response_model=list[dict])
async def get_transaction_documents(tx_id: int, db: DBSessionDep, user=Depends(get_current_user)):
    """Get all documents for a transaction - accessible to all authenticated users"""
    from sqlalchemy import select, and_

    tx = await TransactionRepository(db).get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get all documents for this transaction
    docs_query = select(SupplierDocument).where(SupplierDocument.transaction_id == tx_id)
    docs_result = await db.execute(docs_query)
    docs = docs_result.scalars().all()

    result = []

    for doc in docs:
        result.append({
            "id": doc.id,
            "supplier_id": doc.supplier_id,
            "transaction_id": doc.transaction_id,
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
        user=Depends(get_current_user)
):
    """Update document description for a transaction - accessible to all authenticated users"""
    from sqlalchemy import select, and_

    # Verify transaction exists
    tx = await TransactionRepository(db).get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get the document
    docs_query = select(SupplierDocument).where(
        and_(
            SupplierDocument.id == doc_id,
            SupplierDocument.transaction_id == tx_id
        )
    )
    docs_result = await db.execute(docs_query)
    doc = docs_result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Update description
    doc.description = description.strip() if description and description.strip() else None
    await SupplierDocumentRepository(db).update(doc)

    return {
        "id": doc.id,
        "transaction_id": doc.transaction_id,
        "description": doc.description,
        "file_path": doc.file_path
    }


@router.post("/{tx_id}/supplier-document", response_model=dict)
async def upload_supplier_document(tx_id: int, db: DBSessionDep, file: UploadFile = File(...),
                                   user=Depends(get_current_user)):
    """Upload document for transaction - accessible to all authenticated users"""
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

    # Create supplier document linked to transaction (supplier_id can be None)
    doc = SupplierDocument(supplier_id=supplier_id, transaction_id=tx_id, file_path=file_url)
    await SupplierDocumentRepository(db).create(doc)

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
        user=Depends(get_current_user)
):
    """Delete document from transaction - accessible to all authenticated users"""
    from sqlalchemy import select, and_
    import asyncio

    # Verify transaction exists
    tx = await TransactionRepository(db).get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get the document
    doc_repo = SupplierDocumentRepository(db)
    doc = await doc_repo.get_by_id(doc_id)

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.transaction_id != tx_id:
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
            print(f"Warning: Failed to delete file from S3: {e}")

    return {"ok": True}


@router.put("/{tx_id}", response_model=TransactionOut)
async def update_transaction(tx_id: int, db: DBSessionDep, data: TransactionUpdate, user=Depends(get_current_user)):
    """Update transaction - accessible to all authenticated users"""
    repo = TransactionRepository(db)
    tx = await repo.get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get project name for audit log
    project = await ProjectRepository(db).get_by_id(tx.project_id)
    project_name = project.name if project else f"Project {tx.project_id}"

    # Validate transaction date is not before project contract start date (if updating tx_date)
    if data.tx_date is not None and project and project.start_date:
        # Convert project.start_date to date if it's datetime
        project_start_date = project.start_date
        if hasattr(project_start_date, 'date'):
            project_start_date = project_start_date.date()

        if data.tx_date < project_start_date:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"לא ניתן לעדכן עסקה לתאריך לפני תאריך תחילת החוזה. "
                    f"תאריך תחילת החוזה: {project_start_date.strftime('%d/%m/%Y')}, "
                    f"תאריך העסקה: {data.tx_date.strftime('%d/%m/%Y')}"
                )
            )

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
        service = TransactionService(db)
        resolved_category = await service._resolve_category(
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

    # Convert to dict with user info
    from backend.repositories.user_repository import UserRepository
    user_repo = UserRepository(db)

    result = {
        'id': updated_tx.id,
        'project_id': updated_tx.project_id,
        'tx_date': updated_tx.tx_date,
        'type': updated_tx.type,
        'amount': float(updated_tx.amount),
        'description': updated_tx.description,
        'category': updated_tx.category.name if updated_tx.category else None,
        'category_id': updated_tx.category_id,
        'payment_method': updated_tx.payment_method,
        'notes': updated_tx.notes,
        'is_exceptional': updated_tx.is_exceptional,
        'is_generated': updated_tx.is_generated,
        'file_path': updated_tx.file_path,
        'supplier_id': updated_tx.supplier_id,
        'created_by_user_id': updated_tx.created_by_user_id,
        'created_at': updated_tx.created_at,
        'created_by_user': None,
        'recurring_template_id': getattr(updated_tx, 'recurring_template_id', None),
        'period_start_date': getattr(updated_tx, 'period_start_date', None),
        'period_end_date': getattr(updated_tx, 'period_end_date', None)
    }

    # Load user info if exists
    if updated_tx.created_by_user_id:
        creator = await user_repo.get_by_id(updated_tx.created_by_user_id)
        if creator:
            result['created_by_user'] = {
                'id': creator.id,
                'full_name': creator.full_name,
                'email': creator.email
            }

    return result


@router.delete("/{tx_id}")
async def delete_transaction(tx_id: int, db: DBSessionDep, user=Depends(require_admin())):
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
    project_name = project.name if project else f"Project {tx.project_id}"

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
