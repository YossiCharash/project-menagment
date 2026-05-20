"""User-facing strings related to consumable inventory items."""

ITEM_NOT_FOUND = "Consumable item not found."
ITEM_NOT_FOUND_SHORT = "Item not found."
QUANTITY_MUST_BE_POSITIVE = "Quantity must be positive."
SAME_WAREHOUSE = "Source and target warehouse must be different."


def insufficient_stock(available: object, requested: object) -> str:
    return f"Insufficient stock. Available: {available}, requested: {requested}."
