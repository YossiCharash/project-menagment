"""Exceptions raised by the stock-alert domain."""

from backend.core.exceptions.cems.base import CEMSNotFoundError
from backend.messages.cems import alert_messages


class StockAlertNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(alert_messages.NOT_FOUND)
