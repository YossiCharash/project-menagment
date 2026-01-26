from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import DBSessionDep, get_current_user
from backend.services.unforeseen_transaction_service import UnforeseenTransactionService
from backend.services.s3_service import S3Service
from backend.repositories.supplier_document_repository import SupplierDocumentRepository
from backend.schemas.unforeseen_transaction import (
    UnforeseenTransactionCreate,
    UnforeseenTransactionUpdate,
    UnforeseenTransactionOut,
    UnforeseenTransactionExpenseOut
)

router = APIRouter()


@router.post("/", response_model=dict)
async def create_unforeseen_transaction(
    data: UnforeseenTransactionCreate,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Create a new unforeseen transaction"""
    service = UnforeseenTransactionService(db)
    try:
        tx = await service.create(data, user_id=user.id if user else None)
        return await service._format_transaction(tx)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[dict])
async def list_unforeseen_transactions(
    project_id: int = Query(..., description="Project ID"),
    contract_period_id: Optional[int] = Query(None, description="Filter by contract period"),
    include_executed: bool = Query(True, description="Include executed transactions"),
    db: DBSessionDep = None,
    user = Depends(get_current_user)
):
    """List unforeseen transactions for a project"""
    service = UnforeseenTransactionService(db)
    return await service.list_by_project(project_id, contract_period_id, include_executed)


@router.get("/contract-period/{contract_period_id}", response_model=list[dict])
async def list_unforeseen_transactions_by_contract_period(
    contract_period_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """List all unforeseen transactions for a contract period"""
    service = UnforeseenTransactionService(db)
    return await service.list_by_contract_period(contract_period_id)


@router.get("/{tx_id}", response_model=dict)
async def get_unforeseen_transaction(
    tx_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Get an unforeseen transaction by ID"""
    service = UnforeseenTransactionService(db)
    tx = await service.get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="עסקה לא צפויה לא נמצאה")
    return await service._format_transaction(tx)


@router.put("/{tx_id}", response_model=dict)
async def update_unforeseen_transaction(
    tx_id: int,
    data: UnforeseenTransactionUpdate,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Update an unforeseen transaction"""
    service = UnforeseenTransactionService(db)
    try:
        tx = await service.update(tx_id, data, user_id=user.id if user else None)
        if not tx:
            raise HTTPException(status_code=404, detail="עסקה לא צפויה לא נמצאה")
        return await service._format_transaction(tx)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{tx_id}")
async def delete_unforeseen_transaction(
    tx_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Delete an unforeseen transaction"""
    service = UnforeseenTransactionService(db)
    try:
        success = await service.delete(tx_id)
        if not success:
            raise HTTPException(status_code=404, detail="עסקה לא צפויה לא נמצאה")
        return {"message": "עסקה נמחקה בהצלחה"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{tx_id}/execute", response_model=dict)
async def execute_unforeseen_transaction(
    tx_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Execute an unforeseen transaction and create resulting transaction"""
    service = UnforeseenTransactionService(db)
    try:
        result_tx = await service.execute(tx_id, user_id=user.id if user else None)
        if result_tx is None:
            # Transaction was executed but no balance transaction was created
            tx = await service.get_by_id(tx_id)
            if not tx:
                raise HTTPException(status_code=404, detail="עסקה לא צפויה לא נמצאה")
            return {
                "message": "עסקה בוצעה בהצלחה (אין יתרה)",
                "transaction": await service._format_transaction(tx)
            }
        
        # Return the executed transaction info
        tx = await service.get_by_id(tx_id)
        return {
            "message": "עסקה בוצעה בהצלחה",
            "transaction": await service._format_transaction(tx),
            "resulting_transaction": {
                "id": result_tx.id,
                "amount": float(result_tx.amount),
                "type": result_tx.type,
                "description": result_tx.description
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{tx_id}/expenses/{expense_id}/document")
async def upload_expense_document(
    tx_id: int,
    expense_id: int,
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    db: DBSessionDep = None,
    user = Depends(get_current_user)
):
    """Upload a document for an expense"""
    import asyncio
    
    # Verify transaction and expense exist
    service = UnforeseenTransactionService(db)
    tx = await service.get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="עסקה לא צפויה לא נמצאה")
    
    expense = await service.repo.get_expense_by_id(expense_id)
    if not expense or expense.unforeseen_transaction_id != tx_id:
        raise HTTPException(status_code=404, detail="הוצאה לא נמצאה")
    
    # Upload to S3
    await file.seek(0)
    s3 = S3Service()
    file_url = await asyncio.to_thread(
        s3.upload_file,
        prefix="unforeseen-transactions",
        file_obj=file.file,
        filename=file.filename or "expense-document",
        content_type=file.content_type,
    )
    
    # Create supplier document
    doc_repo = SupplierDocumentRepository(db)
    doc = await doc_repo.create({
        "file_path": file_url,
        "description": description,
        "transaction_id": None  # Not linked to a regular transaction
    })
    
    # Link document to expense
    expense.document_id = doc.id
    await service.repo.update_expense(expense, {})
    
    return {
        "id": doc.id,
        "file_path": doc.file_path,
        "description": doc.description,
        "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None
    }
