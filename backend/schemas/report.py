from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import date

class ReportOptions(BaseModel):
    project_id: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    include_summary: bool = True
    include_budgets: bool = True
    include_funds: bool = False
    include_transactions: bool = True
    transaction_types: Optional[List[str]] = None  # ["Income", "Expense"]
    only_recurring: bool = False
    
    # Filter options
    categories: Optional[List[str]] = None # List of category names
    suppliers: Optional[List[int]] = None # List of supplier IDs
    
    # Extra inclusions for ZIP
    include_project_image: bool = False
    include_project_contract: bool = False
    
    # Chart options
    include_charts: bool = False
    chart_types: Optional[List[str]] = None  # ["income_expense_pie", "expense_by_category_pie", "expense_by_category_bar", "trends_line"]
    
    format: str = "pdf"  # "pdf", "excel", "zip"

class CustomReportRequest(ReportOptions):
    chart_images: Optional[Dict[str, str]] = None

class SupplierReportOptions(BaseModel):
    supplier_id: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    include_transactions: bool = True
    transaction_types: Optional[List[str]] = None  # ["Income", "Expense"]
    only_recurring: bool = False
    
    # Filter options
    categories: Optional[List[str]] = None # List of category names
    project_ids: Optional[List[int]] = None # List of project IDs to filter by
    
    format: str = "excel"  # "pdf", "excel", "zip"

class SupplierReportRequest(SupplierReportOptions):
    chart_images: Optional[Dict[str, str]] = None
