"""Exceptions raised by the stock-alert domain."""

from backend.cems.core.exceptions.base import CEMSNotFoundError
from backend.cems.messages import alert_messages


class StockAlertNotFoundError(CEMSNotFoundError):
    def __init__(self) -> None:
        super().__init__(alert_messages.NOT_FOUND)
