from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import Response
from typing import Optional
import mimetypes
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.core.deps import DBSessionDep, get_current_user
from backend.iam.decorators import require_permission
from backend.services.unforeseen_transaction_service import UnforeseenTransactionService
from backend.services.s3_service import S3Service
from backend.repositories.supplier_document_repository import SupplierDocumentRepository
from backend.models.supplier_document import SupplierDocument
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
    user = Depends(require_permission("write", "transaction", project_id_param=None))
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


@router.get("/documents/{document_id}/view")
async def view_unforeseen_document(
    document_id: int,
    db: DBSessionDep,
    user=Depends(get_current_user),
):
    """Stream a document for viewing (for docs linked to unforeseen transaction expense/income). Enables opening documents in the site even when S3 is private."""
    doc_repo = SupplierDocumentRepository(db)
    doc = await doc_repo.get_by_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="מסמך לא נמצא")
    if not doc.unforeseen_transaction_expense_id and not doc.unforeseen_transaction_income_id:
        raise HTTPException(status_code=404, detail="מסמך לא שייך לעסקה לא צפויה")

    file_path = doc.file_path
    if not file_path:
        raise HTTPException(status_code=404, detail="נתיב קובץ חסר")

    s3 = S3Service()
    content = await asyncio.to_thread(s3.get_file_content, file_path)
    if not content:
        raise HTTPException(status_code=404, detail="לא ניתן לטעון את הקובץ")

    # Infer media type and filename for response
    filename = file_path.split("/")[-1] if "/" in file_path else file_path
    media_type, _ = mimetypes.guess_type(filename)
    if not media_type:
        media_type = "application/octet-stream"

    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=300",
        },
    )


@router.get("/by-resulting-transaction/{resulting_transaction_id}", response_model=dict)
async def get_unforeseen_transaction_by_resulting(
    resulting_transaction_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Get an unforeseen transaction by the ID of its resulting (created) transaction"""
    service = UnforeseenTransactionService(db)
    tx = await service.get_by_resulting_transaction_id(resulting_transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="עסקה לא צפויה לא נמצאה")
    return await service._format_transaction(tx)


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
    user = Depends(require_permission("update", "transaction", resource_id_param="tx_id", project_id_param=None))
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
    user = Depends(require_permission("delete", "transaction", resource_id_param="tx_id", project_id_param=None))
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
    user = Depends(require_permission("delete", "transaction", resource_id_param="tx_id", project_id_param=None))
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
    user = Depends(require_permission("update", "transaction", resource_id_param="tx_id", project_id_param=None))
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
    
    if not settings.AWS_S3_BUCKET:
        raise HTTPException(
            status_code=503,
            detail="העלאת קבצים אינה זמינה: AWS_S3_BUCKET לא מוגדר. הגדר AWS_S3_BUCKET ב-.env להעלאת מסמכים."
        )
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
    doc = SupplierDocument(
        file_path=file_url,
        description=description,
        transaction_id=None,
        unforeseen_transaction_expense_id=expense_id,
    )
    doc = await doc_repo.create(doc)
    
    return {
        "id": doc.id,
        "file_path": doc.file_path,
        "description": doc.description,
        "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None
    }


@router.post("/{tx_id}/incomes/{income_id}/document")
async def upload_income_document(
    tx_id: int,
    income_id: int,
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    db: DBSessionDep = None,
    user = Depends(require_permission("update", "transaction", resource_id_param="tx_id", project_id_param=None))
):
    """Upload a document for an income"""
    import asyncio
    
    # Verify transaction and income exist
    service = UnforeseenTransactionService(db)
    tx = await service.get_by_id(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="עסקה לא צפויה לא נמצאה")
    
    income = await service.repo.get_income_by_id(income_id)
    if not income or income.unforeseen_transaction_id != tx_id:
        raise HTTPException(status_code=404, detail="הכנסה לא נמצאה")
    
    if not settings.AWS_S3_BUCKET:
        raise HTTPException(
            status_code=503,
            detail="העלאת קבצים אינה זמינה: AWS_S3_BUCKET לא מוגדר. הגדר AWS_S3_BUCKET ב-.env להעלאת מסמכים."
        )
    # Upload to S3
    await file.seek(0)
    s3 = S3Service()
    file_url = await asyncio.to_thread(
        s3.upload_file,
        prefix="unforeseen-transactions",
        file_obj=file.file,
        filename=file.filename or "income-document",
        content_type=file.content_type,
    )
    
    # Create supplier document
    doc_repo = SupplierDocumentRepository(db)
    doc = SupplierDocument(
        file_path=file_url,
        description=description,
        transaction_id=None,
        unforeseen_transaction_income_id=income_id,
    )
    doc = await doc_repo.create(doc)
    
    return {
        "id": doc.id,
        "file_path": doc.file_path,
        "description": doc.description,
        "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None
    }
