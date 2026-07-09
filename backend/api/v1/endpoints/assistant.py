"""In-app guidance assistant – free-text chat that explains how to use the system.

Reuses the Anthropic/Claude setup already configured for error analysis
(see backend/services/error_notifier.py). No DB access; the endpoint only
proxies the conversation to Claude with a system prompt describing the system.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from backend.core.config import settings
from backend.core.deps import get_current_user
from backend.schemas.assistant import AssistantChatRequest, AssistantChatResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# Model kept in sync with the (cheap, fast) model used elsewhere for Hebrew replies.
_MODEL = "claude-haiku-4-5-20251001"
_MAX_TOKENS = 700

_SYSTEM_PROMPT = (
    "אתה עוזר הדרכה מובנה בתוך מערכת ניהול פרויקטים ובנייה בשם BMS. "
    "תפקידך היחיד הוא להסביר למשתמשים כיצד להשתמש במערכת, בעברית, בצורה ברורה, "
    "קצרה וידידותית. כשמתאים – ענה בשלבים ממוספרים.\n\n"
    "המערכת כוללת את המודולים הבאים:\n"
    "- לוח בקרה: תצוגת סיכום של פרויקטים, תקציבים ותנועות.\n"
    "- פרויקטים: יצירת פרויקט (כפתור 'פרויקט חדש'), הגדרת שם, כתובת, תאריכים "
    "ותקציב חודשי/שנתי, ותת-פרויקטים.\n"
    "- תנועות כספיות: הוספת תנועה בתוך פרויקט (סכום, תאריך, קטגוריה, ספק, תיאור) "
    "וצירוף חשבונית/קבלה, כולל תנועות קבועות (recurring).\n"
    "- הצעות מחיר: יצירת הצעה, חלוקה לנושאי עבודה ושורות הוצאה, הגדרת בניינים ודירות, "
    "ייצוא PDF או המרה לפרויקט.\n"
    "- דוחות: הפקת דוחות כספיים ותצוגות גרפיות.\n"
    "- ניהול משימות: לוח משימות לפי סטטוסים (לביצוע/בתהליך/הושלם), יצירת משימה עם "
    "כותרת, תיאור, תאריך יעד, שיוך לפרויקט ולמשתמש, ותצוגת יומן.\n"
    "- ספקים: ניהול ספקים ומסמכים.\n"
    "- מלאי (CEMS): ניהול נכסים, מתכלים, מחסנים, העברות והחזרות.\n"
    "- קבלת בניין: ניהול דיירים, מפתחות, רכבים מורשים וביקורי טכנאים.\n"
    "- הגדרות: פרופיל, ניהול משתמשים והרשאות.\n\n"
    "כללים: ענה רק על שאלות הקשורות לשימוש במערכת. אם נשאלת על נושא שאינו קשור "
    "למערכת, הסבר בנימוס שאתה עוזר רק בנוגע לשימוש במערכת BMS. אל תמציא מסכים או "
    "כפתורים שאינך בטוח בקיומם; אם אינך יודע, הצע למשתמש היכן לחפש או לפנות למנהל המערכת."
)


def _ask_claude(messages: list[dict]) -> str:
    """Synchronous Claude call (run in a threadpool to avoid blocking the loop)."""
    import anthropic

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model=_MODEL,
        max_tokens=_MAX_TOKENS,
        system=_SYSTEM_PROMPT,
        messages=messages,
    )
    return message.content[0].text


@router.post("/chat", response_model=AssistantChatResponse)
async def chat(
    payload: AssistantChatRequest,
    user=Depends(get_current_user),
):
    """Answer a free-text question about how to use the system."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="עוזר ההדרכה אינו זמין כרגע (לא הוגדר מפתח AI). פנה למנהל המערכת.",
        )

    claude_messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    try:
        reply = await run_in_threadpool(_ask_claude, claude_messages)
    except Exception as exc:  # noqa: BLE001 - surface a friendly Hebrew error
        logger.warning("Assistant chat failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="לא הצלחתי לקבל תשובה כרגע. נסה שוב בעוד רגע.",
        ) from exc

    return AssistantChatResponse(reply=reply)
