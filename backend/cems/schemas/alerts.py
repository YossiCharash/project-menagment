import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from backend.cems.models.consumable import AlertType


class StockAlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    item_id: uuid.UUID
    alert_type: AlertType
    quantity_at_alert: Decimal
    resolved: bool
    resolved_at: Optional[datetime]
    created_at: datetime


class DashboardSummary(BaseModel):
    total_fixed_assets: int
    active_assets: int
    in_transfer_assets: int
    in_warehouse_assets: int
    retired_assets: int
    total_consumables: int
    low_stock_count: int
    pending_transfers: int
    pending_returns: int
    unresolved_alerts: int


class WarehouseSummary(BaseModel):
    warehouse_id: uuid.UUID
    warehouse_name: str
    total_assets_in_warehouse: int
    total_consumables: int
    low_stock_items: int
    pending_returns: int
