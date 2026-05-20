"""User-facing strings related to consumable reorder requests."""

NOT_FOUND = "Reorder request not found."
QUANTITY_REQUESTED_POSITIVE = "Quantity requested must be positive."
QUANTITY_RECEIVED_POSITIVE = "Quantity received must be positive."
ALREADY_RECEIVED = "Cannot cancel a reorder that has already been received."
ALREADY_CANCELLED = "Reorder request is already cancelled."


def cannot_mark_ordered(current_status: str) -> str:
    return f"Cannot mark as ordered: current status is {current_status}."


def cannot_mark_received(current_status: str) -> str:
    return f"Cannot mark as received: current status is {current_status}."
