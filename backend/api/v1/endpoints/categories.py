from fastapi import APIRouter, Depends, HTTPException, Query
from backend.core.deps import DBSessionDep, get_current_user, require_admin
from backend.models.category import Category
from backend.repositories.category_repository import CategoryRepository
from backend.schemas.category import CategoryCreate, CategoryOut, CategoryUpdate
from backend.services.audit_service import AuditService

router = APIRouter()


@router.get("/", response_model=list[CategoryOut])
async def list_categories(
    db: DBSessionDep,
    include_inactive: bool = Query(False),
    tree: bool = Query(False, description="Return as tree structure (only top-level parents)"),
    user = Depends(get_current_user)
):
    """List all categories - accessible to all authenticated users"""
    repo = CategoryRepository(db)
    if tree:
        return await repo.list_tree(include_inactive=include_inactive)
    return await repo.list(include_inactive=include_inactive)


@router.get("/{category_id}", response_model=CategoryOut)
async def get_category(
    category_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Get category by ID - accessible to all authenticated users"""
    repo = CategoryRepository(db)
    category = await repo.get(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.get("/{category_id}/suppliers", response_model=list[dict])
async def get_category_suppliers(
    category_id: int,
    db: DBSessionDep,
    user = Depends(get_current_user)
):
    """Get all suppliers for a category with transaction counts - accessible to all authenticated users"""
    from sqlalchemy import select, func
    from backend.repositories.supplier_repository import SupplierRepository
    from backend.models.supplier import Supplier
    from backend.models.transaction import Transaction
    
    category = await CategoryRepository(db).get(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    repo = SupplierRepository(db)
    suppliers = await repo.list()
    
    # Filter suppliers by category_id
    category_suppliers = [s for s in suppliers if s.category_id == category_id]
    
    # Get transaction counts for each supplier
    result = []
    for s in category_suppliers:
        count_query = select(func.count(Transaction.id)).where(Transaction.supplier_id == s.id)
        count_result = await db.execute(count_query)
        transaction_count = count_result.scalar_one() or 0
        
        result.append({
            "id": s.id, 
            "name": s.name, 
            "category": s.category.name if s.category else None,
            "transaction_count": transaction_count
        })
    
    return result


@router.post("/", response_model=CategoryOut)
async def create_category(
    data: CategoryCreate,
    db: DBSessionDep,
    user = Depends(require_admin())
):
    """Create a new category - Admin only"""
    repo = CategoryRepository(db)
    
    # Validate parent exists if provided
    if data.parent_id is not None:
        parent = await repo.get(data.parent_id)
        if not parent:
            raise HTTPException(
                status_code=404,
                detail="קטגוריית אב לא נמצאה"
            )
        if not parent.is_active:
            raise HTTPException(
                status_code=400,
                detail="לא ניתן ליצור תת-קטגוריה תחת קטגוריה לא פעילה"
            )
    
    # Validate that category name doesn't already exist under the same parent
    existing = await repo.get_by_name(data.name, parent_id=data.parent_id)
    if existing:
        raise HTTPException(
            status_code=422,
            detail=[{
                "type": "value_error",
                "loc": ["body", "name"],
                "msg": "קטגוריה עם שם זה כבר קיימת תחת אותה קטגוריית אב",
                "input": data.name
            }]
        )
    
    category = Category(**data.model_dump())
    created_category = await repo.create(category)
    
    # Log create action
    await AuditService(db).log_action(
        user_id=user.id,
        action='create',
        entity='category',
        entity_id=str(created_category.id),
        details={'name': created_category.name, 'parent_id': created_category.parent_id}
    )
    
    return created_category


@router.put("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: DBSessionDep,
    user = Depends(require_admin())
):
    """Update a category - Admin only (only is_active can be updated, name cannot be changed)"""
    repo = CategoryRepository(db)
    category = await repo.get(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Only allow updating is_active, name cannot be changed
    # Check if name was provided in the request (even though it's not in the schema)
    update_data = data.model_dump(exclude_unset=True)
    if 'name' in update_data:
        raise HTTPException(
            status_code=400,
            detail="לא ניתן לערוך את שם הקטגוריה. אם צריך לשנות את השם, יש למחוק את הקטגוריה הישנה וליצור חדשה."
        )
    
    # Update fields (only is_active)
    for key, value in update_data.items():
        setattr(category, key, value)
    
    updated_category = await repo.update(category)
    
    # Log update action
    await AuditService(db).log_action(
        user_id=user.id,
        action='update',
        entity='category',
        entity_id=str(updated_category.id),
        details={'name': updated_category.name}
    )
    
    return updated_category


@router.delete("/{category_id}")
async def delete_category(
    category_id: int,
    db: DBSessionDep,
    user = Depends(require_admin())
):
    """Delete a category (hard delete) - Admin only. Cannot delete if suppliers in this category have transactions."""
    from sqlalchemy import select, func
    from backend.repositories.supplier_repository import SupplierRepository
    from backend.models.supplier import Supplier
    from backend.models.transaction import Transaction
    
    repo = CategoryRepository(db)
    category = await repo.get(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if any suppliers in this category have transactions
    supplier_repo = SupplierRepository(db)
    all_suppliers = await supplier_repo.list()
    category_suppliers = [s for s in all_suppliers if s.category_id == category_id]
    
    # Only prevent deletion if suppliers have transactions
    # If suppliers exist but have no transactions, we'll set their category_id to NULL before deletion
    if category_suppliers:
        supplier_ids = [s.id for s in category_suppliers]
        # Count transactions for these suppliers
        count_query = select(func.count(Transaction.id)).where(Transaction.supplier_id.in_(supplier_ids))
        result = await db.execute(count_query)
        transaction_count = result.scalar_one() or 0
        
        if transaction_count > 0:
            supplier_names = [s.name for s in category_suppliers]
            raise HTTPException(
                status_code=400,
                detail=f"לא ניתן למחוק קטגוריה זו כי יש {transaction_count} עסקאות הקשורות לספקים בקטגוריה זו. הספקים: {', '.join(supplier_names)}"
            )
        
        # If suppliers exist but have no transactions, set their category_id to NULL
        # This allows the category to be deleted
        from sqlalchemy import update
        update_query = update(Supplier).where(Supplier.id.in_(supplier_ids)).values(category_id=None)
        await db.execute(update_query)
        await db.commit()
    
    # Check for direct category references in transactions (not through suppliers)
    from backend.models.recurring_transaction import RecurringTransactionTemplate
    direct_tx_count_query = select(func.count(Transaction.id)).where(Transaction.category_id == category_id)
    direct_tx_result = await db.execute(direct_tx_count_query)
    direct_tx_count = direct_tx_result.scalar_one() or 0
    
    if direct_tx_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"לא ניתן למחוק קטגוריה זו כי יש {direct_tx_count} עסק{direct_tx_count > 1 and 'ות' or 'ה'} שמתייחס{direct_tx_count > 1 and 'ות' or 'ה'} ישירות לקטגוריה זו"
        )
    
    # Check for recurring templates that reference this category
    template_count_query = select(func.count(RecurringTransactionTemplate.id)).where(RecurringTransactionTemplate.category_id == category_id)
    template_result = await db.execute(template_count_query)
    template_count = template_result.scalar_one() or 0
    
    if template_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"לא ניתן למחוק קטגוריה זו כי יש {template_count} תבנית{template_count > 1 and 'יות' or ''} מחזורית שמתייחס{template_count > 1 and 'ות' or 'ת'} לקטגוריה זו"
        )
    
    # Log delete action before removal
    await AuditService(db).log_action(
        user_id=user.id,
        action='delete',
        entity='category',
        entity_id=str(category.id),
        details={'name': category.name}
    )
    
    try:
        await repo.delete(category)
        return {"message": "Category deleted successfully"}
    except Exception as e:
        # Check if it's a foreign key constraint error
        error_msg = str(e)
        error_lower = error_msg.lower()
        if "foreign key" in error_lower or "violates foreign key constraint" in error_lower or "asyncpg" in error_lower:
            # Check if it's suppliers preventing deletion
            if category_suppliers:
                supplier_names = [s.name for s in category_suppliers]
                raise HTTPException(
                    status_code=400,
                    detail=f"לא ניתן למחוק קטגוריה זו כי יש {len(category_suppliers)} ספק{len(category_suppliers) > 1 and 'ים' or ''} שמתייחס{len(category_suppliers) > 1 and 'ים' or ''} לקטגוריה זו: {', '.join(supplier_names)}"
                )
            
            # Try to identify what's preventing the deletion
            from backend.models.transaction import Transaction
            from backend.models.recurring_transaction import RecurringTransactionTemplate
            
            # Check for transactions
            tx_count_query = select(func.count(Transaction.id)).where(Transaction.category_id == category_id)
            tx_result = await db.execute(tx_count_query)
            tx_count = tx_result.scalar_one() or 0
            
            # Check for recurring templates
            template_count_query = select(func.count(RecurringTransactionTemplate.id)).where(RecurringTransactionTemplate.category_id == category_id)
            template_result = await db.execute(template_count_query)
            template_count = template_result.scalar_one() or 0
            
            if tx_count > 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"לא ניתן למחוק קטגוריה זו כי יש {tx_count} עסק{tx_count > 1 and 'ות' or 'ה'} שמתייחס{tx_count > 1 and 'ות' or 'ה'} ישירות לקטגוריה זו"
                )
            if template_count > 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"לא ניתן למחוק קטגוריה זו כי יש {template_count} תבנית{template_count > 1 and 'יות' or ''} מחזורית שמתייחס{template_count > 1 and 'ות' or 'ת'} לקטגוריה זו"
                )
            
            raise HTTPException(
                status_code=400,
                detail="לא ניתן למחוק קטגוריה זו בגלל תלויות במערכת. יש לבדוק אם יש עסקאות, תבניות מחזוריות או פריטים אחרים הקשורים לקטגוריה זו."
            )
        raise

