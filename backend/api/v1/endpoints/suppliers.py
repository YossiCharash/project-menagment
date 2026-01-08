from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from backend.core.deps import DBSessionDep, require_roles, get_current_user, require_admin
from backend.models.user import UserRole
from backend.models.supplier import Supplier
from backend.models.supplier_document import SupplierDocument
from backend.repositories.supplier_repository import SupplierRepository
from backend.repositories.supplier_document_repository import SupplierDocumentRepository
from backend.schemas.supplier import SupplierCreate, SupplierOut, SupplierUpdate
from backend.services.audit_service import AuditService
from backend.services.supplier_service import SupplierService
from backend.core.config import settings
from sqlalchemy import select, func
from backend.models.transaction import Transaction
from backend.models.recurring_transaction import RecurringTransactionTemplate
import os
import re
import shutil
from uuid import uuid4

router = APIRouter()


def sanitize_filename(name: str) -> str:
    """Sanitize supplier name to be used as directory name"""
    # Remove or replace invalid characters for Windows/Linux file paths
    # Keep only alphanumeric, Hebrew, spaces, and common punctuation
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


@router.get("/", response_model=list[SupplierOut])
async def list_suppliers(db: DBSessionDep, user = Depends(get_current_user)):
    """List suppliers - accessible to all authenticated users"""
    return await SupplierRepository(db).list()


@router.get("/{supplier_id}", response_model=SupplierOut)
async def get_supplier(supplier_id: int, db: DBSessionDep, user = Depends(get_current_user)):
    """Get supplier by ID - accessible to all authenticated users"""
    repo = SupplierRepository(db)
    supplier = await repo.get(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


@router.post("/", response_model=SupplierOut)
async def create_supplier(db: DBSessionDep, data: SupplierCreate, user = Depends(get_current_user)):
    """Create supplier - accessible to all authenticated users"""
    service = SupplierService(db)
    
    # Check if supplier with same name exists
    repo = SupplierRepository(db)
    # The name is unique in DB but let's check explicitly or catch exception
    # Currently SupplierRepository doesn't have get_by_name but could fail on DB constraint
    # We will let the DB constraint handle it or catch IntegrityError if we want, but simple create is fine
    
    try:
        created_supplier = await service.create(**data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
         # Handle potential unique constraint error
         if "unique constraint" in str(e).lower():
             raise HTTPException(status_code=400, detail="Supplier with this name already exists")
         raise e
    
    # Log create action
    await AuditService(db).log_supplier_action(
        user_id=user.id,
        action='create',
        supplier_id=created_supplier.id,
        details={'name': created_supplier.name}
    )
    
    return created_supplier


@router.put("/{supplier_id}", response_model=SupplierOut)
async def update_supplier(supplier_id: int, db: DBSessionDep, data: SupplierUpdate, user = Depends(get_current_user)):
    """Update supplier - accessible to all authenticated users"""
    service = SupplierService(db)
    repo = SupplierRepository(db)
    
    supplier = await repo.get(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    # Store old values for audit log
    old_values = {'name': supplier.name, 'is_active': str(supplier.is_active)}
    if supplier.category:
        old_values['category'] = supplier.category.name if hasattr(supplier.category, 'name') else str(supplier.category)
    
    try:
        updated_supplier = await service.update(supplier_id, **data.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Log update action
    new_values = {k: str(v) for k, v in data.model_dump(exclude_unset=True).items()}
    await AuditService(db).log_supplier_action(
        user_id=user.id,
        action='update',
        supplier_id=supplier_id,
        details={'old_values': old_values, 'new_values': new_values}
    )
    
    return updated_supplier


@router.get("/{supplier_id}/transaction-count")
async def get_supplier_transaction_count(supplier_id: int, db: DBSessionDep, user = Depends(get_current_user)):
    """Get transaction count for a supplier"""
    supplier = await SupplierRepository(db).get(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    count_query = select(func.count(Transaction.id)).where(Transaction.supplier_id == supplier_id)
    result = await db.execute(count_query)
    count = result.scalar_one() or 0
    
    return {"supplier_id": supplier_id, "transaction_count": count}


@router.delete("/{supplier_id}")
async def delete_supplier(
    supplier_id: int, 
    db: DBSessionDep, 
    transfer_to_supplier_id: int | None = Query(None, description="Supplier ID to transfer transactions to"),
    user = Depends(require_admin())
):
    """Delete supplier - Admin only. If transfer_to_supplier_id is provided, transfers all transactions to that supplier before deletion."""
    repo = SupplierRepository(db)
    supplier = await repo.get(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    # If transfer_to_supplier_id is provided, transfer transactions
    if transfer_to_supplier_id is not None:
        if transfer_to_supplier_id == supplier_id:
            raise HTTPException(status_code=400, detail="Cannot transfer transactions to the same supplier")
        
        transfer_to_supplier = await repo.get(transfer_to_supplier_id)
        if not transfer_to_supplier:
            raise HTTPException(status_code=404, detail="Transfer target supplier not found")
        
        # Transfer all transactions
        transactions_query = select(Transaction).where(Transaction.supplier_id == supplier_id)
        result = await db.execute(transactions_query)
        transactions = result.scalars().all()
        
        for tx in transactions:
            tx.supplier_id = transfer_to_supplier_id
        
        # Transfer all recurring transaction templates
        templates_query = select(RecurringTransactionTemplate).where(RecurringTransactionTemplate.supplier_id == supplier_id)
        templates_result = await db.execute(templates_query)
        templates = templates_result.scalars().all()
        
        for template in templates:
            template.supplier_id = transfer_to_supplier_id
        
        await db.commit()
    
    # Store supplier details for audit log
    supplier_details = {'name': supplier.name}
    if transfer_to_supplier_id is not None:
        supplier_details['transferred_to_supplier_id'] = transfer_to_supplier_id
    
    await repo.delete(supplier)
    
    # Log delete action
    await AuditService(db).log_supplier_action(
        user_id=user.id,
        action='delete',
        supplier_id=supplier_id,
        details=supplier_details
    )
    
    return {"ok": True}


@router.get("/{supplier_id}/documents", response_model=list[dict])
async def list_supplier_documents(supplier_id: int, db: DBSessionDep, user = Depends(get_current_user)):
    """List all documents for a supplier (only from transactions) - accessible to all authenticated users"""
    from sqlalchemy import select, and_
    
    supplier = await SupplierRepository(db).get(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    # Only get documents that are linked to transactions (transaction_id is not null)
    docs_query = select(SupplierDocument).where(
        and_(
            SupplierDocument.supplier_id == supplier_id,
            SupplierDocument.transaction_id.isnot(None)
        )
    )
    docs_result = await db.execute(docs_query)
    docs = docs_result.scalars().all()
    # Convert file paths to relative URLs
    uploads_dir = get_uploads_dir()
    suppliers_dir = os.path.join(uploads_dir, 'suppliers')
    
    # Get supplier name for directory
    supplier_name = sanitize_filename(supplier.name)
    supplier_specific_dir = os.path.join(suppliers_dir, supplier_name)
    # Also keep ID-based directory for backward compatibility
    supplier_id_dir = os.path.join(suppliers_dir, str(supplier_id))
    
    result = []
    
    for doc in docs:
        original_path = doc.file_path
        actual_file_path = None
        
        # Strategy 1: Check if file exists at stored path (absolute)
        if os.path.exists(doc.file_path):
            actual_file_path = doc.file_path
        
        # Strategy 2: If not found, try to resolve relative paths
        elif not os.path.isabs(doc.file_path):
            filename = os.path.basename(doc.file_path)
            # Try multiple possible locations, including supplier name-based directory
            possible_paths = [
                os.path.join(uploads_dir, doc.file_path.lstrip('./')),
                os.path.join(supplier_specific_dir, filename),  # New: supplier name-based dir
                os.path.join(supplier_id_dir, filename),  # ID-based dir (backward compatibility)
                os.path.join(suppliers_dir, filename),  # Old location (backward compatibility)
                os.path.join(suppliers_dir, str(supplier_id), filename),  # Explicit supplier ID dir
                os.path.join(uploads_dir, 'suppliers', filename),
                os.path.join(uploads_dir, 'suppliers', str(supplier_id), filename),
                os.path.join(uploads_dir, 'suppliers', supplier_name, filename),
            ]
            
            for possible_path in possible_paths:
                if os.path.exists(possible_path):
                    actual_file_path = possible_path
                    # Update the database record with correct path
                    try:
                        doc.file_path = actual_file_path
                        await SupplierDocumentRepository(db).update(doc)
                    except Exception:
                        pass
                    break
        
        # Strategy 3: If still not found, check if filename exists in supplier directories
        if not actual_file_path:
            filename = os.path.basename(doc.file_path)
            # First check supplier name-based directory
            possible_path = os.path.join(supplier_specific_dir, filename)
            if os.path.exists(possible_path):
                actual_file_path = possible_path
                # Update the database record
                try:
                    doc.file_path = actual_file_path
                    await SupplierDocumentRepository(db).update(doc)
                except Exception:
                    pass
            # Check ID-based directory (old format)
            elif os.path.exists(os.path.join(supplier_id_dir, filename)):
                possible_path = os.path.join(supplier_id_dir, filename)
                actual_file_path = possible_path
                # Move to supplier name-based directory and update DB
                try:
                    new_path = os.path.join(supplier_specific_dir, filename)
                    os.makedirs(supplier_specific_dir, exist_ok=True)
                    shutil.move(possible_path, new_path)
                    doc.file_path = new_path
                    await SupplierDocumentRepository(db).update(doc)
                    actual_file_path = new_path
                except Exception:
                    pass
            # Fallback to old suppliers directory
            elif os.path.exists(os.path.join(suppliers_dir, filename)):
                possible_path = os.path.join(suppliers_dir, filename)
                actual_file_path = possible_path
                # Move to supplier name-based directory and update DB
                try:
                    new_path = os.path.join(supplier_specific_dir, filename)
                    os.makedirs(supplier_specific_dir, exist_ok=True)
                    shutil.move(possible_path, new_path)
                    doc.file_path = new_path
                    await SupplierDocumentRepository(db).update(doc)
                    actual_file_path = new_path
                except Exception:
                    pass
        
        # If file still not found, skip this document (don't show it)
        if not actual_file_path:
            # Skip this document - don't add it to the result
            continue
        
        # Verify file actually exists before adding to result
        if not os.path.exists(actual_file_path):
            continue
        
        # Final verification: make absolutely sure file exists
        if not os.path.isfile(actual_file_path):
            continue
        
        # Get relative path from uploads directory
        try:
            if os.path.isabs(actual_file_path):
                rel_path = os.path.relpath(actual_file_path, uploads_dir).replace('\\', '/')
            else:
                rel_path = actual_file_path.replace('\\', '/').lstrip('./')
            
            # Ensure it starts with suppliers/ if it's a supplier document
            if not rel_path.startswith('suppliers/'):
                # Extract filename and prepend suppliers/{supplier_name}/
                filename = os.path.basename(actual_file_path)
                rel_path = f"suppliers/{supplier_name}/{filename}"
            # If it's in old suppliers/ location (with ID or without subdirectory), update to supplier name-based
            elif rel_path.startswith('suppliers/') and not rel_path.startswith(f'suppliers/{supplier_name}/'):
                # Check if it's in ID-based directory
                if rel_path.startswith(f'suppliers/{supplier_id}/'):
                    # Replace ID with supplier name
                    filename = os.path.basename(actual_file_path)
                    rel_path = f"suppliers/{supplier_name}/{filename}"
                elif not '/' in rel_path.replace('suppliers/', ''):
                    # It's directly in suppliers/ without subdirectory
                    filename = os.path.basename(actual_file_path)
                    rel_path = f"suppliers/{supplier_name}/{filename}"
        except ValueError:
            # If paths are on different drives or can't be related, use filename
            filename = os.path.basename(actual_file_path)
            rel_path = f"suppliers/{supplier_name}/{filename}"
        
        # Verify the final path would be accessible
        final_full_path = os.path.join(uploads_dir, rel_path.replace('/', os.sep))
        if not os.path.isfile(final_full_path):
            # Skip document if path doesn't exist
            continue
        
        result.append({
            "id": doc.id,
            "supplier_id": doc.supplier_id,
            "transaction_id": doc.transaction_id,
            "file_path": f"/uploads/{rel_path}",
            "description": doc.description,
            "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None
        })
        # Document added to result
    
    # Returning documents
    return result


# Removed: Direct upload to suppliers is no longer allowed
# Documents must be uploaded through transactions
