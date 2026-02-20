"""
Data mapping functions for converting ORM models to response dicts.

This module eliminates the copy-pasted Transaction-to-dict conversion that
appeared in 4 places across the transactions endpoint (create, upload_receipt,
update, list_by_project_with_users). All callers now use a single mapper.

SRP: Each function is responsible for mapping one model type.
DRY: The dict structure is defined in exactly one place.
"""

from __future__ import annotations

from backend.models.transaction import Transaction


def transaction_to_dict(tx: Transaction) -> dict:
    """Convert a Transaction ORM instance to a dict suitable for TransactionOut.

    Handles:
      - created_by_user relationship loading
      - is_generated inference from recurring_template_id
      - category name extraction from relationship
      - Safe getattr for optional fields
    """
    created_by_user = None
    if tx.created_by_user:
        created_by_user = {
            "id": tx.created_by_user.id,
            "full_name": tx.created_by_user.full_name,
            "email": tx.created_by_user.email,
        }

    is_generated_value = tx.is_generated
    if tx.recurring_template_id and not is_generated_value:
        is_generated_value = True

    category_name = tx.category.name if tx.category else None

    return {
        "id": tx.id,
        "project_id": tx.project_id,
        "tx_date": tx.tx_date,
        "type": tx.type,
        "amount": float(tx.amount),
        "description": tx.description,
        "category_id": tx.category_id,
        "category": category_name,
        "payment_method": tx.payment_method,
        "notes": tx.notes,
        "is_exceptional": tx.is_exceptional,
        "is_generated": is_generated_value,
        "file_path": tx.file_path,
        "supplier_id": tx.supplier_id,
        "created_by_user_id": tx.created_by_user_id,
        "created_at": tx.created_at,
        "from_fund": tx.from_fund or False,
        "recurring_template_id": tx.recurring_template_id,
        "period_start_date": tx.period_start_date,
        "period_end_date": tx.period_end_date,
        "created_by_user": created_by_user,
    }


async def transaction_to_dict_with_user(tx: Transaction, user_repo) -> dict:
    """Convert a Transaction and eagerly load creator user info.

    Use this in endpoint handlers where the created_by_user relationship
    may not be loaded yet.
    """
    result = transaction_to_dict(tx)

    if result["created_by_user"] is None and tx.created_by_user_id:
        creator = await user_repo.get_by_id(tx.created_by_user_id)
        if creator:
            result["created_by_user"] = {
                "id": creator.id,
                "full_name": creator.full_name,
                "email": creator.email,
            }

    return result
