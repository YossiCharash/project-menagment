"""User-facing strings related to asset categories."""

NOT_FOUND = "Category not found."
PARENT_NOT_FOUND = "קטגוריית האב לא נמצאה."
SELF_PARENT = "קטגוריה לא יכולה להיות ההורה של עצמה."
CYCLE_DETECTED = "זוהה מעגל בהיררכיית הקטגוריות."
DESCENDANT_AS_PARENT = "לא ניתן להגדיר קטגוריה צאצאית כהורה."
HAS_ITEMS = "לא ניתן למחוק קטגוריה שמשויכים אליה פריטים"


def max_depth_exceeded(max_depth: int) -> str:
    return f"עומק מקסימלי של היררכיה הוא {max_depth} רמות."
