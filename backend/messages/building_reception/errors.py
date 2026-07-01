"""User-facing error messages for the Building Reception Desk domain (דלפק הבניין).

Plain messages are class attributes; parameterised messages are
``@staticmethod`` formatters. Hebrew strings appear in the UI verbatim — do
not translate or rephrase without a product decision.
"""

from __future__ import annotations


class BuildingReceptionErrorMessages:
    """Static registry of user-facing building-reception error strings."""

    # --- plain messages -------------------------------------------------
    BUILDING_NOT_FOUND = "הבניין לא נמצא במערכת"
    APARTMENT_NOT_FOUND = "הדירה לא נמצאה במערכת"
    TENANT_NOT_FOUND = "הדייר לא נמצא במערכת"
    KEY_NOT_FOUND = "המפתח לא נמצא במערכת"
    VEHICLE_NOT_FOUND = "הרכב לא נמצא במערכת"
    DELIVERY_NOT_FOUND = "המשלוח לא נמצא במערכת"
    INVALID_KEY_DIRECTION = "כיוון מסירת מפתח לא תקין. ערכים מותרים: out (מסירה) או return (החזרה)"
    NO_CURRENT_TENANT = "לא קיים דייר נוכחי בדירה זו להחלפה"
    DELIVERY_ALREADY_DELIVERED = "המשלוח כבר סומן כנמסר"
    BUILDING_NAME_REQUIRED = "שם הבניין הוא שדה חובה"
    INVALID_FLOORS_COUNT = "מספר הקומות חייב להיות מספר חיובי"
    INVALID_UNITS_PER_FLOOR = "מספר היחידות בקומה חייב להיות מספר חיובי"
    TENANT_NAME_REQUIRED = "שם הדייר הוא שדה חובה"
    APARTMENT_UNIT_REQUIRED = "מספר הדירה הוא שדה חובה"
    KEY_LABEL_REQUIRED = "תיאור המפתח הוא שדה חובה"
    COUNTERPARTY_NAME_REQUIRED = "שם מקבל/מחזיר המפתח הוא שדה חובה"
    VEHICLE_PLATE_REQUIRED = "מספר רישוי הרכב הוא שדה חובה"
    VEHICLE_OWNER_REQUIRED = "שם בעל הרכב הוא שדה חובה"
    DELIVERY_TITLE_REQUIRED = "כותרת המשלוח היא שדה חובה"

    # --- formatted messages --------------------------------------------

    @staticmethod
    def building_not_found_by_id(building_id: int) -> str:
        """Message shown when a building id cannot be resolved."""
        return f"הבניין עם המזהה {building_id} לא נמצא במערכת"

    @staticmethod
    def apartment_not_found_by_id(apartment_id: int) -> str:
        """Message shown when an apartment id cannot be resolved."""
        return f"הדירה עם המזהה {apartment_id} לא נמצאה במערכת"

    @staticmethod
    def tenant_not_found_by_id(tenant_id: int) -> str:
        """Message shown when a tenant id cannot be resolved."""
        return f"הדייר עם המזהה {tenant_id} לא נמצא במערכת"

    @staticmethod
    def key_not_found_by_id(key_id: int) -> str:
        """Message shown when a key id cannot be resolved."""
        return f"המפתח עם המזהה {key_id} לא נמצא במערכת"

    @staticmethod
    def vehicle_not_found_by_id(vehicle_id: int) -> str:
        """Message shown when a vehicle id cannot be resolved."""
        return f"הרכב עם המזהה {vehicle_id} לא נמצא במערכת"

    @staticmethod
    def delivery_not_found_by_id(delivery_id: int) -> str:
        """Message shown when a delivery id cannot be resolved."""
        return f"המשלוח עם המזהה {delivery_id} לא נמצא במערכת"

    @staticmethod
    def invalid_key_direction(direction: str) -> str:
        """Message shown when an unsupported key-transfer direction is supplied."""
        return (
            f"כיוון מסירת מפתח '{direction}' אינו תקין. "
            f"ערכים מותרים: out (מסירה) או return (החזרה)"
        )
