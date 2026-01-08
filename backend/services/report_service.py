from sqlalchemy import func, select, and_, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from typing import List, Dict, Any
from dateutil.relativedelta import relativedelta
import hashlib

from backend.models.transaction import Transaction
from backend.models.category import Category
from backend.models.project import Project
from backend.models.budget import Budget
from backend.models.supplier import Supplier
from backend.services.budget_service import BudgetService
from backend.services.fund_service import FundService
from backend.services.project_service import calculate_start_date, calculate_monthly_income_amount
import io
from io import BytesIO
import zipfile
import csv
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

try:
    from openpyxl.chart import PieChart, BarChart, LineChart, Reference

    CHARTS_AVAILABLE = True
except ImportError:
    CHARTS_AVAILABLE = False
    print("WARNING: openpyxl.chart not available - charts will be skipped")

# Hebrew Labels to avoid hardcoded strings in logic
REPORT_LABELS = {
    "project_report": "דוח פרויקט",
    "production_date": "תאריך הפקה",
    "financial_summary": "סיכום פיננסי",
    "details": "פירוט",
    "amount": "סכום",
    "total_income": "סה״כ הכנסות",
    "total_expenses": "סה״כ הוצאות",
    "balance_profit": "יתרה / רווח",
    "fund_status": "מצב קופה",
    "current_balance": "יתרה נוכחית",
    "monthly_deposit": "הפקדה חודשית",
    "budget_vs_actual": "תקציב מול ביצוע",
    "category": "קטגוריה",
    "budget": "תקציב",
    "used": "נוצל",
    "remaining": "נותר",
    "status": "סטטוס",
    "general": "כללי",
    "transaction_details": "פירוט תנועות",
    "date": "תאריך",
    "type": "סוג",
    "description": "תיאור",
    "income": "הכנסה",
    "expense": "הוצאה",
    "expenses": "הוצאות",
    "payment_method": "אמצעי תשלום",
    "notes": "הערות",
    "file": "קובץ",
    "yes": "כן",
    "no": "לא",
    "exception": "חריגה",
    "ok": "תקין",
    "profit": "רווח",
    "monthly_budget": "תקציב (חודשי)",
    "annual_budget": "תקציב (שנתי)",
    "categories": "קטגוריות",
    "supplier": "ספק"
}


class ReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _calculate_expenses_with_period(
            self,
            project_id: int | None,
            start_date: date,
            end_date: date,
            from_fund: bool = False
    ) -> float:
        """
        Calculate total expenses for a period, handling both regular transactions (sum)
        and period-based transactions (pro-rated split).
        If project_id is None, calculates for all projects.
        """
        # 1. Regular expenses
        query_regular = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.type == "Expense",
                Transaction.from_fund == from_fund,
                Transaction.tx_date >= start_date,
                Transaction.tx_date <= end_date,
                or_(
                    Transaction.period_start_date.is_(None),
                    Transaction.period_end_date.is_(None)
                )
            )
        )

        # 2. Period expenses
        query_period = select(Transaction).options(
            selectinload(Transaction.category)
        ).where(
            and_(
                Transaction.type == "Expense",
                Transaction.from_fund == from_fund,
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                Transaction.period_start_date <= end_date,
                Transaction.period_end_date >= start_date
            )
        )

        if project_id is not None:
            query_regular = query_regular.where(Transaction.project_id == project_id)
            query_period = query_period.where(Transaction.project_id == project_id)

        regular_expense = float((await self.db.execute(query_regular)).scalar_one())
        period_txs = (await self.db.execute(query_period)).scalars().all()

        period_expense = 0.0
        for tx in period_txs:
            total_days = (tx.period_end_date - tx.period_start_date).days + 1
            if total_days <= 0: continue

            daily_rate = float(tx.amount) / total_days
            overlap_start = max(tx.period_start_date, start_date)
            overlap_end = min(tx.period_end_date, end_date)
            overlap_days = (overlap_end - overlap_start).days + 1

            if overlap_days > 0:
                period_expense += daily_rate * overlap_days

        return regular_expense + period_expense

    async def _calculate_category_expenses_with_period(
            self,
            project_id: int | None,
            start_date: date,
            end_date: date,
            from_fund: bool = False
    ) -> Dict[str, float]:
        """
        Calculate expenses per category for a period, handling splitting.
        Returns {category_name: amount}
        If project_id is None, calculates for all projects.
        """
        # 1. Regular expenses grouped by category
        query_regular = select(
            Category.name.label('category'),
            func.coalesce(func.sum(Transaction.amount), 0).label('total_amount')
        ).outerjoin(
            Category, Transaction.category_id == Category.id
        ).where(
            and_(
                Transaction.type == "Expense",
                Transaction.from_fund == from_fund,
                Transaction.tx_date >= start_date,
                Transaction.tx_date <= end_date,
                or_(
                    Transaction.period_start_date.is_(None),
                    Transaction.period_end_date.is_(None)
                )
            )
        ).group_by(Category.name)

        # 2. Period expenses
        query_period = select(Transaction).options(selectinload(Transaction.category)).where(
            and_(
                Transaction.type == "Expense",
                Transaction.from_fund == from_fund,
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                Transaction.period_start_date <= end_date,
                Transaction.period_end_date >= start_date
            )
        )

        if project_id is not None:
            query_regular = query_regular.where(Transaction.project_id == project_id)
            query_period = query_period.where(Transaction.project_id == project_id)

        regular_results = await self.db.execute(query_regular)
        category_expenses = {}
        for row in regular_results:
            cat_name = row.category or REPORT_LABELS["general"]
            category_expenses[cat_name] = float(row.total_amount)

        period_txs = (await self.db.execute(query_period)).scalars().all()

        for tx in period_txs:
            total_days = (tx.period_end_date - tx.period_start_date).days + 1
            if total_days <= 0: continue

            daily_rate = float(tx.amount) / total_days
            overlap_start = max(tx.period_start_date, start_date)
            overlap_end = min(tx.period_end_date, end_date)
            overlap_days = (overlap_end - overlap_start).days + 1

            if overlap_days > 0:
                amount = daily_rate * overlap_days
                cat_name = tx.category.name if tx.category else REPORT_LABELS["general"]
                category_expenses[cat_name] = category_expenses.get(cat_name, 0.0) + amount

        return category_expenses

    async def project_profitability(self, project_id: int) -> dict:
        income_q = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Income",
                Transaction.from_fund == False  # Exclude fund transactions
            )
        )
        expense_q = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Expense",
                Transaction.from_fund == False  # Exclude fund transactions
            )
        )
        income_val = (await self.db.execute(income_q)).scalar_one()
        expense_val = (await self.db.execute(expense_q)).scalar_one()

        proj = (await self.db.execute(select(Project).where(Project.id == project_id))).scalar_one()

        income = float(income_val)
        expenses = float(expense_val)
        profit = income - expenses

        # Check if project has budgets or funds
        has_budget = proj.budget_monthly > 0 or proj.budget_annual > 0
        # Check fund exists
        fund_service = FundService(self.db)
        fund = await fund_service.get_fund_by_project(project_id)
        has_fund = fund is not None

        return {
            "project_id": project_id,
            "income": income,
            "expenses": expenses,
            "profit": profit,
            "budget_monthly": float(proj.budget_monthly or 0),
            "budget_annual": float(proj.budget_annual or 0),
            "has_budget": has_budget,
            "has_fund": has_fund
        }

    async def get_dashboard_snapshot(self) -> Dict[str, Any]:
        """Get comprehensive dashboard snapshot with real-time financial data"""
        # Rollback any failed transaction before starting
        try:
            await self.db.rollback()
        except Exception:
            pass  # Ignore if there's no transaction to rollback

        # Get all active projects
        projects_query = select(Project).where(Project.is_active == True)
        projects_result = await self.db.execute(projects_query)
        projects = list(projects_result.scalars().all())
        print(f"📋 Found {len(projects)} active projects")

        if not projects:
            return {
                "projects": [],
                "alerts": {
                    "budget_overrun": [],
                    "budget_warning": [],
                    "missing_proof": [],
                    "unpaid_recurring": [],
                    "negative_fund_balance": [],
                    "category_budget_alerts": []
                },
                "summary": {
                    "total_income": 0,
                    "total_expense": 0,
                    "total_profit": 0
                },
                "expense_categories": []
            }

        # Get current date
        current_date = date.today()

        # Initialize budget service for category budget alerts
        budget_service = BudgetService(self.db)

        # Pre-load ALL project data immediately to avoid lazy loading issues
        projects_data = []
        for project in projects:
            try:
                # Extract ALL attributes immediately while session is active
                project_dict = {
                    "id": project.id,
                    "name": project.name,
                    "description": project.description,
                    "start_date": project.start_date,
                    "end_date": project.end_date,
                    "budget_monthly": project.budget_monthly,
                    "budget_annual": project.budget_annual,
                    "num_residents": project.num_residents,
                    "monthly_price_per_apartment": project.monthly_price_per_apartment,
                    "address": project.address,
                    "city": project.city,
                    "relation_project": project.relation_project,
                    "is_parent_project": project.is_parent_project,
                    "image_url": project.image_url,
                    "is_active": project.is_active,
                    "manager_id": project.manager_id,
                    "created_at": project.created_at
                }
                projects_data.append(project_dict)
            except Exception as e:
                print(f"WARNING: Error loading project data: {e}")
                continue

        # Initialize result collections
        fund_service = FundService(self.db)

        # Calculate financial data for each project
        projects_with_finance = []
        total_income = 0
        total_expense = 0
        budget_overrun_projects = []
        budget_warning_projects = []
        missing_proof_projects = []
        unpaid_recurring_projects = []
        negative_fund_balance_projects = []  # Projects with negative fund balance
        category_budget_alerts = []  # Store category budget alerts
        category_budget_alerts = []

        # Process each project using pre-loaded data
        for proj_data in projects_data:
            project_id = proj_data["id"]
            project_start_date = proj_data["start_date"]
            project_created_at = proj_data["created_at"]
            project_budget_monthly = proj_data["budget_monthly"]
            project_budget_annual = proj_data["budget_annual"]

            # Calculate start date
            if project_start_date:
                calculation_start_date = project_start_date
            else:
                calculation_start_date = current_date - relativedelta(years=1)

            # Initialize financial variables
            yearly_income = 0.0
            yearly_expense = 0.0

            try:
                # Get income transactions
                yearly_income_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                    and_(
                        Transaction.project_id == project_id,
                        Transaction.type == "Income",
                        Transaction.tx_date >= calculation_start_date,
                        Transaction.tx_date <= current_date,
                        Transaction.from_fund == False
                    )
                )
                yearly_income = float((await self.db.execute(yearly_income_query)).scalar_one())
            except Exception as e:
                print(f"WARNING: Error getting income for project {project_id}: {e}")
                try:
                    await self.db.rollback()
                except Exception:
                    pass
                yearly_income = 0.0

            try:
                # Get expense transactions using pro-rata calculation
                yearly_expense = await self._calculate_expenses_with_period(
                    project_id,
                    calculation_start_date,
                    current_date,
                    from_fund=False
                )
            except Exception as e:
                print(f"WARNING: Error getting expenses for project {project_id}: {e}")
                try:
                    await self.db.rollback()
                except Exception:
                    pass
                yearly_expense = 0.0

            # Budget is NOT income - only actual transactions count
            # Calculate budget separately for budget overrun warnings (not for income calculation)
            # Access budget fields directly - they should already be loaded
            try:
                budget_annual = float(proj_data["budget_annual"] if proj_data["budget_annual"] is not None else 0)
                budget_monthly = float(proj_data["budget_monthly"] if proj_data["budget_monthly"] is not None else 0)
            except (AttributeError, ValueError) as e:
                # If there's an issue accessing budget fields, use defaults
                budget_annual = 0.0
                budget_monthly = 0.0

            # Calculate income from the monthly budget (treated as expected monthly income)
            # Calculate from project start date (or created_at if start_date not available)
            project_income = 0.0
            monthly_income = float(proj_data["budget_monthly"] or 0)
            if monthly_income > 0:
                # Use project start_date if available, otherwise use created_at date
                if proj_data["start_date"]:
                    income_calculation_start = proj_data["start_date"]
                elif proj_data.get("created_at"):
                    income_calculation_start = proj_data["created_at"].date() if hasattr(proj_data["created_at"],
                                                                                         'date') else proj_data[
                        "created_at"]
                else:
                    # Fallback: use calculation_start_date (which is already 1 year ago if no start_date)
                    income_calculation_start = calculation_start_date
                project_income = calculate_monthly_income_amount(monthly_income, income_calculation_start, current_date)
                yearly_income = 0.0

            # Income = actual transactions + project income (from monthly budget)
            # Budget is NOT included in income
            project_total_income = yearly_income + project_income

            profit = project_total_income - yearly_expense

            # Calculate profit percentage based on total income
            if project_total_income > 0:
                profit_percent = (profit / project_total_income * 100)
            else:
                profit_percent = 0

            # Determine status color based on profit percentage
            if profit_percent >= 10:
                status_color = "green"
            elif profit_percent <= -10:
                status_color = "red"
            else:
                status_color = "yellow"

            # Check for budget overrun and warnings
            # Calculate expected budget for the period (same logic as budget_income)
            yearly_budget = 0.0
            # Prioritize monthly budget if both are set
            if budget_monthly > 0:
                # Same logic as budget_income calculation
                if proj_data["start_date"]:
                    start_month = date(proj_data["start_date"].year, proj_data["start_date"].month, 1)
                else:
                    start_month = date(calculation_start_date.year, calculation_start_date.month, 1)
                end_month = date(current_date.year, current_date.month, 1)
                month_count = 0
                temp_month = start_month
                while temp_month <= end_month:
                    month_count += 1
                    if temp_month.month == 12:
                        temp_month = date(temp_month.year + 1, 1, 1)
                    else:
                        temp_month = date(temp_month.year, temp_month.month + 1, 1)
                yearly_budget = budget_monthly * month_count
            elif budget_annual > 0:
                # If only annual budget is set (and no monthly), calculate proportionally
                days_in_period = (current_date - calculation_start_date).days + 1
                days_in_year = 365
                yearly_budget = (budget_annual / days_in_year) * days_in_period
            if yearly_budget > 0:  # Only check if there's a budget
                budget_percentage = (yearly_expense / yearly_budget) * 100
                if yearly_expense > yearly_budget:
                    budget_overrun_projects.append(project_id)
                elif budget_percentage >= 70:  # Approaching budget (70% or more)
                    budget_warning_projects.append(project_id)

            # Check for missing proof (transactions without file_path, excluding fund transactions)
            missing_proof_query = select(func.count(Transaction.id)).where(
                and_(
                    Transaction.project_id == project_id,
                    Transaction.file_path.is_(None),
                    Transaction.tx_date >= calculation_start_date,
                    Transaction.tx_date <= current_date,
                    Transaction.from_fund == False  # Exclude fund transactions
                )
            )
            try:
                missing_proof_count = (await self.db.execute(missing_proof_query)).scalar_one()
                if missing_proof_count > 0:
                    missing_proof_projects.append(project_id)
            except Exception:
                # If query fails, rollback and continue
                try:
                    await self.db.rollback()
                except Exception:
                    pass

            # Check for unpaid recurring expenses (simplified - could be enhanced, excluding fund transactions)
            unpaid_recurring_query = select(func.count(Transaction.id)).where(
                and_(
                    Transaction.project_id == project_id,
                    Transaction.type == "Expense",
                    Transaction.is_exceptional == False,
                    Transaction.tx_date < current_date,
                    Transaction.file_path.is_(None),
                    Transaction.from_fund == False  # Exclude fund transactions
                )
            )
            try:
                unpaid_recurring_count = (await self.db.execute(unpaid_recurring_query)).scalar_one()
                if unpaid_recurring_count > 0:
                    unpaid_recurring_projects.append(project_id)
            except Exception:
                # If query fails, rollback and continue
                try:
                    await self.db.rollback()
                except Exception:
                    pass

            # Check for category budget alerts
            try:
                project_budget_alerts = await budget_service.check_category_budget_alerts(
                    project_id,
                    current_date
                )
                category_budget_alerts.extend(project_budget_alerts)
            except Exception:
                # If budget checking fails, rollback and continue without it
                # This prevents the transaction from being in a failed state
                try:
                    await self.db.rollback()
                except Exception:
                    pass

            # Check for negative fund balance
            try:
                fund = await fund_service.get_fund_by_project(project_id)
                if fund and float(fund.current_balance) < 0:
                    negative_fund_balance_projects.append(project_id)
            except Exception:
                # If fund check fails, rollback and continue
                try:
                    await self.db.rollback()
                except Exception:
                    pass
                # Continue without fund balance check for this project

            # Build project data
            project_data = {
                "id": project_id,
                "name": proj_data["name"],
                "description": proj_data["description"],
                "start_date": proj_data["start_date"].isoformat() if proj_data["start_date"] else None,
                "end_date": proj_data["end_date"].isoformat() if proj_data["end_date"] else None,
                "budget_monthly": float(proj_data["budget_monthly"] or 0),
                "budget_annual": float(proj_data["budget_annual"] or 0),
                "num_residents": proj_data["num_residents"],
                "monthly_price_per_apartment": float(proj_data["monthly_price_per_apartment"] or 0),
                "address": proj_data["address"],
                "city": proj_data["city"],
                "relation_project": proj_data["relation_project"],
                "is_parent_project": proj_data["is_parent_project"],
                "image_url": proj_data["image_url"],
                "is_active": proj_data["is_active"],
                "manager_id": proj_data["manager_id"],
                "created_at": proj_data["created_at"].isoformat() if proj_data["created_at"] else None,
                "income_month_to_date": project_total_income,
                "expense_month_to_date": yearly_expense,
                "profit_percent": round(profit_percent, 1),
                "status_color": status_color,
                "budget_monthly": float(proj_data["budget_monthly"] or 0),
                "budget_annual": float(proj_data["budget_annual"] or 0),
                "children": []
            }

            projects_with_finance.append(project_data)
            total_income += project_total_income  # project_total_income includes budgets
            total_expense += yearly_expense

        # Build project hierarchy
        project_map = {p["id"]: p for p in projects_with_finance}
        root_projects = []

        for project_data in projects_with_finance:
            if project_data["relation_project"] and project_data["relation_project"] in project_map:
                parent = project_map[project_data["relation_project"]]
                parent["children"].append(project_data)
            else:
                root_projects.append(project_data)

        # Calculate total profit
        total_profit = total_income - total_expense

        # Get expense categories breakdown (from earliest project start_date or 1 year ago)
        # Calculate the earliest calculation_start_date across all projects
        earliest_start = date.today() - relativedelta(years=1)
        for proj_data in projects_data:
            project_start = calculate_start_date(proj_data["start_date"])
            if project_start < earliest_start:
                earliest_start = project_start

        expense_categories = []
        try:
            cat_expenses_map = await self._calculate_category_expenses_with_period(
                None,  # All projects
                earliest_start,
                current_date,
                from_fund=False
            )
            for cat_name, amount in cat_expenses_map.items():
                if amount > 0:
                    expense_categories.append({
                        "category": cat_name,
                        "amount": amount,
                        "color": self._get_category_color(cat_name)
                    })
        except Exception as e:
            print(f"Error calculating expense categories: {e}")
            # If query fails, rollback and continue with empty categories
            try:
                await self.db.rollback()
            except Exception:
                pass

        return {
            "projects": projects_with_finance,  # Return all projects, not just root ones
            "alerts": {
                "budget_overrun": budget_overrun_projects,
                "budget_warning": budget_warning_projects,
                "missing_proof": missing_proof_projects,
                "unpaid_recurring": unpaid_recurring_projects,
                "negative_fund_balance": negative_fund_balance_projects,
                "category_budget_alerts": category_budget_alerts
            },
            "summary": {
                "total_income": round(total_income, 2),
                "total_expense": round(total_expense, 2),
                "total_profit": round(total_profit, 2)
            },
            "expense_categories": expense_categories
        }

    import hashlib

    def _get_category_color(self, category: str) -> str:
        """Get random-like, but consistent color for any category"""
        hash_object = hashlib.md5(category.encode())
        hex_color = "#" + hash_object.hexdigest()[:6]
        return hex_color

    async def get_project_expense_categories(self, project_id: int) -> List[Dict[str, Any]]:
        """Get expense categories breakdown for a specific project"""
        # Calculate for all time (wide range)
        start_date = date(2000, 1, 1)
        end_date = date(2100, 1, 1)

        cat_expenses_map = await self._calculate_category_expenses_with_period(
            project_id,
            start_date,
            end_date,
            from_fund=False
        )

        expense_categories = []
        for cat_name, amount in cat_expenses_map.items():
            if amount > 0:
                expense_categories.append({
                    "category": cat_name,
                    "amount": amount,
                    "color": self._get_category_color(cat_name)
                })

        return expense_categories

    async def get_project_transactions(self, project_id: int) -> List[Dict[str, Any]]:
        """Get all transactions for a specific project (including recurring ones)"""
        transactions_query = select(Transaction).options(
            selectinload(Transaction.category)
        ).where(Transaction.project_id == project_id).order_by(Transaction.tx_date.desc())
        transactions_result = await self.db.execute(transactions_query)
        transactions = list(transactions_result.scalars().all())

        return [
            {
                "id": tx.id,
                "project_id": tx.project_id,
                "tx_date": tx.tx_date.isoformat(),
                "type": tx.type,
                "amount": float(tx.amount),
                "description": tx.description,
                "category": tx.category.name if tx.category else None,
                "notes": tx.notes,
                "is_exceptional": tx.is_exceptional,
                "is_generated": getattr(tx, 'is_generated', False),
                "recurring_template_id": getattr(tx, 'recurring_template_id', None),
                "created_at": tx.created_at.isoformat() if hasattr(tx, 'created_at') and tx.created_at else None,
                "period_start_date": tx.period_start_date.isoformat() if hasattr(tx,
                                                                                 'period_start_date') and tx.period_start_date else None,
                "period_end_date": tx.period_end_date.isoformat() if hasattr(tx,
                                                                             'period_end_date') and tx.period_end_date else None
            }
            for tx in transactions
        ]

    async def get_expenses_by_transaction_date(
            self,
            project_id: int | None = None,
            start_date: date | None = None,
            end_date: date | None = None
    ) -> Dict[str, Any]:
        """
        Get expenses aggregated by transaction date for dashboard.
        Shows expenses related to specific transaction dates with aggregation.
        """
        # Build query
        query = select(
            Transaction.tx_date,
            func.sum(Transaction.amount).label('total_expense'),
            func.count(Transaction.id).label('transaction_count')
        ).where(
            Transaction.type == 'Expense',
            Transaction.from_fund == False
        )

        # Filter by project if provided
        if project_id:
            query = query.where(Transaction.project_id == project_id)

        # Filter by date range if provided
        if start_date:
            query = query.where(Transaction.tx_date >= start_date)
        if end_date:
            query = query.where(Transaction.tx_date <= end_date)

        # Group by date and order
        query = query.group_by(Transaction.tx_date).order_by(Transaction.tx_date.desc())

        result = await self.db.execute(query)
        rows = result.all()

        # Format results
        expenses_by_date = []
        total_expense = 0.0
        total_count = 0

        for row in rows:
            expense_amount = float(row.total_expense)
            total_expense += expense_amount
            total_count += row.transaction_count

            expenses_by_date.append({
                'date': row.tx_date.isoformat(),
                'expense': expense_amount,
                'transaction_count': row.transaction_count
            })

        return {
            'expenses_by_date': expenses_by_date,
            'total_expense': total_expense,
            'total_transaction_count': total_count,
            'period_start': start_date.isoformat() if start_date else None,
            'period_end': end_date.isoformat() if end_date else None
        }

    async def generate_custom_report(self, options, chart_images: Dict[str, bytes] = None) -> bytes:
        """Generate a custom report (PDF, Excel, or ZIP) based on options"""
        # options is expected to be ReportOptions instance, but using dynamic typing to avoid circular import at module level
        from backend.schemas.report import ReportOptions
        from sqlalchemy.orm import selectinload

        # 1. Fetch data based on options
        project_id = options.project_id

        # Fetch basic project info
        proj = (await self.db.execute(select(Project).where(Project.id == project_id))).scalar_one()

        # --- Transactions ---
        transactions = []
        if options.include_transactions:
            query = select(Transaction).options(
                selectinload(Transaction.category),
                selectinload(Transaction.supplier),
                selectinload(Transaction.project)
            ).where(Transaction.project_id == project_id)
            if options.start_date:
                query = query.where(Transaction.tx_date >= options.start_date)
            if options.end_date:
                query = query.where(Transaction.tx_date <= options.end_date)
            if options.transaction_types:
                # Assuming options.transaction_types is a list like ['Income', 'Expense']
                query = query.where(Transaction.type.in_(options.transaction_types))
            if options.only_recurring:
                query = query.where(Transaction.recurring_template_id.isnot(None))

            # Filter by Categories (list of category names)
            if options.categories and len(options.categories) > 0:
                # Join with Category table to filter by name
                query = query.join(Category, Transaction.category_id == Category.id).where(
                    Category.name.in_(options.categories))

            # Filter by Suppliers (list of supplier IDs)
            if options.suppliers and len(options.suppliers) > 0:
                query = query.where(Transaction.supplier_id.in_(options.suppliers))

            query = query.order_by(Transaction.tx_date.desc())
            result = await self.db.execute(query)
            transaction_objects = list(result.scalars().all())

            # Convert to dictionaries IMMEDIATELY while session is active to avoid lazy loading issues
            transactions = []
            for tx in transaction_objects:
                tx_dict = {
                    "id": tx.id,
                    "project_id": tx.project_id,
                    "tx_date": tx.tx_date,
                    "type": tx.type,
                    "amount": float(tx.amount),
                    "description": tx.description,
                    "category": tx.category.name if tx.category else None,
                    "category_obj": tx.category,  # Keep object reference if needed
                    "notes": tx.notes,
                    "is_exceptional": tx.is_exceptional,
                    "is_generated": getattr(tx, 'is_generated', False),
                    "recurring_template_id": getattr(tx, 'recurring_template_id', None),
                    "created_at": getattr(tx, 'created_at', None),
                    "period_start_date": getattr(tx, 'period_start_date', None),
                    "period_end_date": getattr(tx, 'period_end_date', None),
                    "file_path": getattr(tx, 'file_path', None),
                    "payment_method": getattr(tx, 'payment_method', None),
                    "project_name": tx.project.name if tx.project else "",
                    "supplier_name": tx.supplier.name if tx.supplier else None,
                }
                transactions.append(tx_dict)

        # --- Budgets ---
        budgets_data = []
        if options.include_budgets:
            budget_service = BudgetService(self.db)
            budgets_data = await budget_service.get_project_budgets_with_spending(project_id, options.end_date)

        # --- Funds ---
        fund_data = None
        if options.include_funds:
            fund_service = FundService(self.db)
            fund_data = await fund_service.get_fund_by_project(project_id)

        # --- Summary Data ---
        summary_data = {}
        if options.include_summary:
            # Re-calculate summary based on date range if provided
            # Otherwise use the standard project_profitability (which is mostly all-time)
            # For custom report, it's better to respect the date range for income/expense

            # Use filters similar to transactions but for aggregation
            # ... implementation ...
            summary_data = await self.project_profitability(project_id)  # Using standard for now, could be refined

        # 2. Generate Output
        if options.format == "pdf":
            return await self._generate_pdf(proj, options, transactions, budgets_data, fund_data, summary_data,
                                            chart_images)
        elif options.format == "excel":
            return await self._generate_excel(proj, options, transactions, budgets_data, fund_data, summary_data,
                                              chart_images)
        elif options.format == "zip":
            # For ZIP, we generate the PDF/Excel report AND include documents
            report_content = await self._generate_excel(proj, options, transactions, budgets_data, fund_data,
                                                        summary_data, chart_images)
            return await self._generate_zip(proj, options, report_content, transactions)

        raise ValueError("Invalid format")

    async def generate_supplier_report(self, options, chart_images: Dict[str, bytes] = None) -> bytes:
        """Generate a report for a specific supplier with all their transactions"""
        from backend.schemas.report import SupplierReportOptions
        from backend.models.supplier import Supplier
        from sqlalchemy.orm import selectinload

        # 1. Fetch supplier info
        supplier = (
            await self.db.execute(select(Supplier).where(Supplier.id == options.supplier_id))).scalar_one_or_none()
        if not supplier:
            raise ValueError(f"ספק עם מזהה {options.supplier_id} לא נמצא")

        # 2. Fetch transactions for this supplier
        transactions = []
        if options.include_transactions:
            query = select(Transaction).options(
                selectinload(Transaction.category),
                selectinload(Transaction.project),
                selectinload(Transaction.supplier)
            ).where(Transaction.supplier_id == options.supplier_id)

            if options.start_date:
                query = query.where(Transaction.tx_date >= options.start_date)
            if options.end_date:
                query = query.where(Transaction.tx_date <= options.end_date)
            if options.transaction_types:
                query = query.where(Transaction.type.in_(options.transaction_types))
            if options.only_recurring:
                query = query.where(Transaction.recurring_template_id.isnot(None))

            # Filter by Categories
            if options.categories and len(options.categories) > 0:
                query = query.join(Category, Transaction.category_id == Category.id).where(
                    Category.name.in_(options.categories))

            # Filter by Projects
            if options.project_ids and len(options.project_ids) > 0:
                query = query.where(Transaction.project_id.in_(options.project_ids))

            query = query.order_by(Transaction.tx_date.desc())
            result = await self.db.execute(query)
            transaction_objects = list(result.scalars().all())

            # Convert to dictionaries IMMEDIATELY while session is active to avoid lazy loading issues
            transactions = []
            for tx in transaction_objects:
                tx_dict = {
                    "id": tx.id,
                    "project_id": tx.project_id,
                    "tx_date": tx.tx_date,
                    "type": tx.type,
                    "amount": float(tx.amount),
                    "description": tx.description,
                    "category": tx.category.name if tx.category else None,
                    "notes": tx.notes,
                    "is_exceptional": tx.is_exceptional,
                    "is_generated": getattr(tx, 'is_generated', False),
                    "recurring_template_id": getattr(tx, 'recurring_template_id', None),
                    "created_at": getattr(tx, 'created_at', None),
                    "period_start_date": getattr(tx, 'period_start_date', None),
                    "period_end_date": getattr(tx, 'period_end_date', None),
                    "file_path": getattr(tx, 'file_path', None),
                    "payment_method": getattr(tx, 'payment_method', None),
                    "project_name": tx.project.name if tx.project else "",
                    "supplier_name": tx.supplier.name if tx.supplier else None,
                }
                transactions.append(tx_dict)

        # 3. Calculate summary for supplier
        summary_data = {
            "supplier_name": supplier.name,
            "total_income": 0.0,
            "total_expenses": 0.0,
            "total_amount": 0.0,
            "transaction_count": len(transactions)
        }

        for tx in transactions:
            tx_type = tx.get('type') if isinstance(tx, dict) else tx.type
            tx_amount = tx.get('amount') if isinstance(tx, dict) else float(tx.amount)
            if tx_type == "Income":
                summary_data["total_income"] += float(tx_amount)
            else:
                summary_data["total_expenses"] += float(tx_amount)

        summary_data["total_amount"] = summary_data["total_income"] - summary_data["total_expenses"]

        # 4. Generate output
        if options.format == "pdf":
            return await self._generate_supplier_pdf(supplier, options, transactions, summary_data, chart_images)
        elif options.format == "excel":
            return await self._generate_supplier_excel(supplier, options, transactions, summary_data, chart_images)
        elif options.format == "zip":
            report_content = await self._generate_supplier_excel(supplier, options, transactions, summary_data,
                                                                 chart_images)
            return await self._generate_supplier_zip(supplier, options, report_content, transactions)

        raise ValueError("פורמט לא תקין")

    async def _generate_supplier_pdf(self, supplier, options, transactions, summary, chart_images=None) -> bytes:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        import os

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=18)

        # Register Hebrew Font (same logic as _generate_pdf)
        font_name = 'Helvetica'
        try:
            services_dir = os.path.dirname(__file__)
            backend_dir = os.path.dirname(services_dir)
            project_root = os.path.dirname(backend_dir)

            possible_paths = [
                os.path.join(backend_dir, 'static', 'fonts', 'Heebo-Regular.ttf'),
                os.path.join(project_root, 'backend', 'static', 'fonts', 'Heebo-Regular.ttf'),
                '/app/backend/static/fonts/Heebo-Regular.ttf',
                'backend/static/fonts/Heebo-Regular.ttf',
            ]

            font_path = None
            for path in possible_paths:
                if os.path.exists(path):
                    font_path = os.path.abspath(path)
                    break

            font_loaded = False
            if font_path and os.path.exists(font_path):
                try:
                    pdfmetrics.registerFont(TTFont('Hebrew', font_path))
                    font_name = 'Hebrew'
                    font_loaded = True
                except Exception:
                    pass
        except Exception:
            pass

        styles = getSampleStyleSheet()
        style_normal = ParagraphStyle('HebrewNormal', parent=styles['Normal'], fontName=font_name, fontSize=10,
                                      alignment=1)
        style_title = ParagraphStyle('HebrewTitle', parent=styles['Heading1'], fontName=font_name, fontSize=16,
                                     alignment=1, textColor=colors.HexColor('#1E3A8A'))
        style_h2 = ParagraphStyle('HebrewHeading2', parent=styles['Heading2'], fontName=font_name, fontSize=12,
                                  alignment=1, textColor=colors.HexColor('#1F2937'))

        elements = []

        # Use arabic-reshaper and python-bidi for proper RTL support
        try:
            import arabic_reshaper
            from bidi.algorithm import get_display
            bidi_available = True
        except ImportError:
            bidi_available = False

        def format_text(text):
            if not text: return ""
            if not isinstance(text, str): text = str(text)
            if font_loaded and bidi_available:
                try:
                    reshaped_text = arabic_reshaper.reshape(text)
                    bidi_text = get_display(reshaped_text)
                    return bidi_text
                except Exception:
                    return text
            return text

        elements.append(Paragraph(format_text(f"דוח ספק: {supplier.name}"), style_title))
        elements.append(
            Paragraph(format_text(f"{REPORT_LABELS['production_date']}: {date.today().strftime('%d/%m/%Y')}"),
                      style_normal))
        elements.append(Spacer(1, 20))

        # Summary
        elements.append(Paragraph(format_text("סיכום"), style_h2))
        elements.append(Spacer(1, 10))
        data = [
            [format_text("פרט"), format_text(REPORT_LABELS['amount'])],
            [format_text("סה״כ הכנסות"), f"{summary['total_income']:,.2f} ₪"],
            [format_text("סה״כ הוצאות"), f"{summary['total_expenses']:,.2f} ₪"],
            [format_text("סה״כ עסקאות"), f"{summary['transaction_count']}"],
        ]
        t = Table(data, colWidths=[200, 150])
        t.setStyle(TableStyle([
            ('FONT', (0, 0), (-1, -1), font_name),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 0), (1, 0), colors.HexColor('#DBEAFE')),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('PADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 20))

        # Transactions
        if transactions:
            elements.append(Paragraph(format_text(REPORT_LABELS['transaction_details']), style_h2))
            elements.append(Spacer(1, 10))
            tx_data = [[format_text(REPORT_LABELS['date']), format_text("פרויקט"), format_text(REPORT_LABELS['type']),
                        format_text(REPORT_LABELS['amount']), format_text(REPORT_LABELS['description'])]]
            for tx in transactions:
                tx_type = REPORT_LABELS['income'] if tx.type == "Income" else REPORT_LABELS['expense']
                tx_desc = tx.description or ""
                if len(tx_desc) > 30:
                    tx_desc = tx_desc[:27] + "..."

                project_name = tx.project.name if tx.project else ""
                if len(project_name) > 20:
                    project_name = project_name[:17] + "..."

                tx_data.append([
                    str(tx.tx_date),
                    format_text(project_name),
                    format_text(tx_type),
                    f"{tx.amount:,.2f}",
                    format_text(tx_desc)
                ])

            tx_table = Table(tx_data, repeatRows=1, colWidths=[80, 100, 60, 80, 200])
            tx_table.setStyle(TableStyle([
                ('FONT', (0, 0), (-1, -1), font_name),
                ('GRID', (0, 0), (-1, -1), 0.25, colors.grey),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#FFEDD5')),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('PADDING', (0, 0), (-1, -1), 4),
            ]))
            elements.append(tx_table)

        doc.build(elements)
        buffer.seek(0)
        return buffer.read()

    async def _generate_supplier_excel(self, supplier, options, transactions, summary, chart_images=None) -> bytes:
        wb = Workbook()
        wb.remove(wb.active)

        # Styles
        header_font = Font(bold=True, color="FFFFFF")
        fill_blue = PatternFill(start_color="3b82f6", end_color="3b82f6", fill_type="solid")
        fill_orange = PatternFill(start_color="f59e0b", end_color="f59e0b", fill_type="solid")

        # Summary Sheet
        ws = wb.create_sheet("סיכום")
        ws.sheet_view.rightToLeft = True

        ws.append([f"דוח ספק: {supplier.name}"])
        ws.append([f"{REPORT_LABELS['production_date']}: {date.today().strftime('%d/%m/%Y')}"])
        ws.append([])

        ws.append(["פרט", "סכום"])
        ws.append(["סה״כ הכנסות", summary['total_income']])
        ws.append(["סה״כ הוצאות", summary['total_expenses']])
        ws.append(["סה״כ עסקאות", summary['transaction_count']])

        for cell in ws[4]:
            cell.font = header_font
            cell.fill = fill_blue
            cell.alignment = Alignment(horizontal='center')

        ws.column_dimensions['A'].width = 20
        ws.column_dimensions['B'].width = 15

        # Transactions Sheet
        if transactions:
            ws_tx = wb.create_sheet(REPORT_LABELS['transaction_details'][:30])
            ws_tx.sheet_view.rightToLeft = True
            headers = [
                REPORT_LABELS['date'],
                "פרויקט",
                REPORT_LABELS['type'],
                REPORT_LABELS['amount'],
                REPORT_LABELS['category'],
                REPORT_LABELS['description'],
                REPORT_LABELS['payment_method'],
                REPORT_LABELS['notes'],
                REPORT_LABELS['file']
            ]
            ws_tx.append(headers)

            for cell in ws_tx[1]:
                cell.font = header_font
                cell.fill = fill_orange
                cell.alignment = Alignment(horizontal='center')

            for tx in transactions:
                # Transactions are now dictionaries, access fields directly
                if isinstance(tx, dict):
                    cat_name = tx.get('category') or ""
                    tx_type = REPORT_LABELS['income'] if tx.get('type') == "Income" else REPORT_LABELS['expense']
                    project_name = tx.get('project_name') or ""

                    row = [
                        tx.get('tx_date'),
                        project_name,
                        tx_type,
                        tx.get('amount'),
                        cat_name,
                        tx.get('description') or "",
                        tx.get('payment_method') or "",
                        tx.get('notes') or "",
                        REPORT_LABELS['yes'] if tx.get('file_path') else REPORT_LABELS['no']
                    ]
                else:
                    # Fallback for Transaction objects
                    cat_name = tx.category.name if tx.category else ""
                    tx_type = REPORT_LABELS['income'] if tx.type == "Income" else REPORT_LABELS['expense']
                    project_name = tx.project.name if tx.project else ""

                    row = [
                        tx.tx_date,
                        project_name,
                        tx_type,
                        tx.amount,
                        cat_name,
                        tx.description or "",
                        tx.payment_method or "",
                        tx.notes or "",
                        REPORT_LABELS['yes'] if tx.file_path else REPORT_LABELS['no']
                    ]
                ws_tx.append(row)

            ws_tx.column_dimensions['A'].width = 12
            ws_tx.column_dimensions['B'].width = 20
            ws_tx.column_dimensions['C'].width = 10
            ws_tx.column_dimensions['D'].width = 12
            ws_tx.column_dimensions['E'].width = 15
            ws_tx.column_dimensions['F'].width = 30
            ws_tx.column_dimensions['G'].width = 15
            ws_tx.column_dimensions['H'].width = 20

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.read()

    async def _generate_supplier_zip(self, supplier, options, report_content, transactions) -> bytes:
        from backend.services.s3_service import S3Service
        try:
            s3_service = S3Service()
            has_s3 = True
        except Exception:
            has_s3 = False

        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
            ext = "xlsx"
            zf.writestr(f"supplier_{supplier.id}_report.{ext}", report_content)

            if has_s3 and options.include_transactions:
                for tx in transactions:
                    if tx.file_path:
                        try:
                            content = s3_service.get_file_content(tx.file_path)
                            if content:
                                fname = f"{tx.tx_date}_{tx.id}.{tx.file_path.split('.')[-1]}"
                                zf.writestr(f"documents/{fname}", content)
                        except Exception:
                            pass

        output.seek(0)
        return output.read()

    async def _create_chart_image(self, chart_type: str, data: Dict[str, Any], summary: Dict[str, Any] = None,
                            transactions: List[Dict] = None) -> io.BytesIO:
        """Create a chart image using matplotlib and return as BytesIO"""

        # הנחה: REPORT_LABELS מוגדר ברמת המחלקה או גלובלית.
        # אם לא, יש להגדיר אותו כאן או להשתמש במחרוזות ישירות.
        labels_dict = getattr(self, 'REPORT_LABELS', {
            'income': 'הכנסות',
            'expenses': 'הוצאות',
            'general': 'כללי',
            'category': 'קטגוריה',
            'amount': 'סכום',
            'date': 'תאריך'
        })

        try:
            import matplotlib
            matplotlib.use('Agg')  # Use non-interactive backend
            import matplotlib.pyplot as plt
            import matplotlib.font_manager as fm

            plt.rcdefaults()

            # ניסיון להגדיר פונט עברי
            try:
                hebrew_fonts = ['Arial Hebrew', 'David', 'Guttman Yad-Brush', 'FrankRuehl', 'Miriam', 'New Peninim MT',
                                'Arial']
                for font_name in hebrew_fonts:
                    prop = fm.FontProperties(family=font_name)
                    if fm.findfont(prop):
                        plt.rcParams['font.family'] = font_name
                        break
            except:
                pass

            fig, ax = plt.subplots(figsize=(7, 5), dpi=130)
            fig.patch.set_facecolor('white')
            ax.set_facecolor('white')
            # נוסיף ריווח פנימי
            plt.subplots_adjust(top=0.85, right=0.98, left=0.15)

            # --- תרשים עוגה: הכנסות מול הוצאות ---
            if chart_type == "income_expense_pie" and summary:
                income = summary.get('income', 0)
                expenses = summary.get('expenses', 0)

                labels = []
                sizes = []
                colors_list = []

                if income > 0:
                    labels.append(labels_dict['income'])
                    sizes.append(income)
                    colors_list.append('#10b981')
                if expenses > 0:
                    labels.append(labels_dict['expenses'])
                    sizes.append(expenses)
                    colors_list.append('#ef4444')

                if not sizes or sum(sizes) == 0:
                    ax.text(0.5, 0.5, 'אין נתונים', ha='center', va='center', fontsize=20, fontweight='bold', color='gray')
                else:
                    single_value = len(sizes) == 1
                    ax.axis('equal')
                    pie_colors = colors_list if not single_value else ['#10b981' if labels and labels[0] == labels_dict['income'] else '#ef4444']
                    wedges, texts, autotexts = ax.pie(
                        sizes, colors=pie_colors, autopct=(lambda p: f'{p:.1f}%' if not single_value else None),
                        startangle=90, textprops={'fontsize': 18, 'weight': 'bold', 'color': 'white'}, shadow=True
                    )
                    for i, wedge in enumerate(wedges):
                        wedge.set_edgecolor('white')
                        wedge.set_linewidth(2)
                    legend = ax.legend(
                        wedges,
                        labels,
                        title="מקרא",
                        loc="upper right",
                        bbox_to_anchor=(1.0, 1),
                        fontsize=14,
                        frameon=True
                    )
                    legend.get_title().set_fontsize(15)
                    legend.get_title().set_fontweight('bold')
                    for txt in legend.get_texts():
                        txt.set_fontsize(14)
                        txt.set_fontweight('bold')
                    if single_value:
                        label_desc = labels[0]
                        ax.text(0, 0, f"{label_desc}\n₪{sizes[0]:,.2f}", ha='center', va='center', fontsize=24, color='#64748b', fontweight='bold')
                    ax.set_title(f"{labels_dict['income']} מול {labels_dict['expenses']}", fontsize=18,
                                 fontweight='bold', color='#334155')

            # --- תרשים עוגה: הוצאות לפי קטגוריה ---
            elif chart_type == "expense_by_category_pie" and transactions:
                category_expenses = {}
                for tx in transactions:
                    if tx.get('type') == 'Expense':
                        cat = tx.get('category') or labels_dict['general']
                        category_expenses[cat] = category_expenses.get(cat, 0) + tx.get('amount', 0)

                category_expenses = {k: v for k, v in category_expenses.items() if v > 0}

                if category_expenses:
                    sorted_pairs = sorted(category_expenses.items(), key=lambda x: x[1], reverse=True)
                    labels = [p[0] for p in sorted_pairs]
                    sizes = [p[1] for p in sorted_pairs]

                    colors = plt.cm.tab20(range(len(labels)))
                    ax.axis('equal')
                    wedges, texts, autotexts = ax.pie(
                        sizes, colors=colors, autopct='%1.1f%%',
                        startangle=90, textprops={'fontsize': 12, 'weight': 'bold', 'color': 'white'}, shadow=True
                    )
                    for wedge in wedges:
                        wedge.set_edgecolor('white')
                        wedge.set_linewidth(2)

                    legend = ax.legend(
                        wedges, labels, title="מקרא", loc="upper right", bbox_to_anchor=(1.0, 1), fontsize=12)
                    legend.get_title().set_fontsize(13)
                    legend.get_title().set_fontweight('bold')
                    for txt in legend.get_texts():
                        txt.set_fontsize(12)
                        txt.set_fontweight('bold')
                    ax.set_title(f"{labels_dict['expenses']} לפי {labels_dict['category']}", fontsize=16,
                                 fontweight='bold', color='#334155')
                else:
                    ax.text(0.5, 0.5, 'אין נתונים', ha='center', va='center', fontsize=14)

            # --- תרשים עמודות: הוצאות לפי קטגוריה ---
            elif chart_type == "expense_by_category_bar" and transactions:
                category_expenses = {}
                for tx in transactions:
                    if tx.get('type') == 'Expense':
                        cat = tx.get('category') or labels_dict['general']
                        category_expenses[cat] = category_expenses.get(cat, 0) + tx.get('amount', 0)

                if category_expenses:
                    sorted_cats = sorted(category_expenses.items(), key=lambda x: x[1], reverse=True)
                    categories = [x[0] for x in sorted_cats]
                    amounts = [x[1] for x in sorted_cats]

                    bars = ax.bar(categories, amounts, color=plt.cm.Pastel1(range(len(categories))), edgecolor='grey')
                    ax.set_ylabel(labels_dict['amount'] + ' (₪)')
                    ax.tick_params(axis='x', rotation=45)

                    for bar in bars:
                        height = bar.get_height()
                        ax.text(bar.get_x() + bar.get_width() / 2., height, f'{height:,.0f}', ha='center', va='bottom')
                    ax.set_title(f"{labels_dict['expenses']} לפי {labels_dict['category']}", fontsize=14,
                                 fontweight='bold')
                else:
                    ax.text(0.5, 0.5, 'אין נתונים', ha='center', va='center', fontsize=14)

            # --- תרשים קו: מגמות לאורך זמן ---
            elif chart_type == "trends_line" and transactions:
                from collections import defaultdict
                daily_data = defaultdict(lambda: {'income': 0, 'expense': 0})

                for tx in transactions:
                    tx_date = tx.get('tx_date')
                    if isinstance(tx_date, str):
                        tx_date = date.fromisoformat(tx_date)
                    date_str = tx_date.strftime('%Y-%m-%d')

                    if tx.get('type') == 'Income':
                        daily_data[date_str]['income'] += tx.get('amount', 0)
                    else:
                        daily_data[date_str]['expense'] += tx.get('amount', 0)

                if daily_data:
                    sorted_dates = sorted(daily_data.keys())
                    incomes = [daily_data[d]['income'] for d in sorted_dates]
                    expenses = [daily_data[d]['expense'] for d in sorted_dates]

                    ax.plot(sorted_dates, incomes, marker='o', label=labels_dict['income'], color='#10b981')
                    ax.plot(sorted_dates, expenses, marker='s', label=labels_dict['expenses'], color='#ef4444')
                    ax.fill_between(sorted_dates, incomes, alpha=0.1, color='#10b981')
                    ax.fill_between(sorted_dates, expenses, alpha=0.1, color='#ef4444')
                    ax.tick_params(axis='x', rotation=45)
                    ax.legend()
                    ax.set_title("מגמות לאורך זמן", fontsize=14, fontweight='bold')
                else:
                    ax.text(0.5, 0.5, 'אין נתונים', ha='center', va='center', fontsize=14)

            # שמירת התוצאה
            img_buffer = io.BytesIO()
            plt.savefig(img_buffer, format='png', dpi=150, bbox_inches='tight')
            plt.close(fig)
            img_buffer.seek(0)
            return img_buffer

        except ImportError:
            print("Matplotlib not installed")
            return io.BytesIO()
        except Exception as e:
            print(f"Error: {e}")
            return io.BytesIO()


    async def _generate_pdf(self, project, options, transactions, budgets, fund, summary, chart_images=None) -> bytes:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        import os

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=18)

        # Register Hebrew Font
        font_name = 'Helvetica'  # Default fallback
        try:
            # Get the base directory of the services folder
            services_dir = os.path.dirname(__file__)
            backend_dir = os.path.dirname(services_dir)
            project_root = os.path.dirname(backend_dir)

            # Paths to check for the font (in order of preference)
            possible_paths = [
                os.path.join(backend_dir, 'static', 'fonts', 'Heebo-Regular.ttf'),  # Relative from services/
                os.path.join(project_root, 'backend', 'static', 'fonts', 'Heebo-Regular.ttf'),  # From project root
                '/app/backend/static/fonts/Heebo-Regular.ttf',  # Docker absolute path
                'backend/static/fonts/Heebo-Regular.ttf',  # Run from root (string path)
            ]

            font_path = None
            print(f"🔍 Looking for Hebrew font in {len(possible_paths)} possible locations...")
            print(f"   Services dir: {services_dir}")
            print(f"   Backend dir: {backend_dir}")
            print(f"   Project root: {project_root}")

            for path in possible_paths:
                if os.path.exists(path):
                    font_path = os.path.abspath(path)  # Use absolute path
                    print(f"✓ Found font at: {font_path}")
                    break
                else:
                    print(f"✗ Not found: {path}")

            # If font not found or corrupted, try to download it (Self-healing)
            if not font_path or (font_path and os.path.exists(font_path)):
                # Check if existing font is valid by trying to read it
                if font_path and os.path.exists(font_path):
                    try:
                        # Quick validation - try to open as TTFont
                        test_font = TTFont(font_path)
                        test_font.close()
                        print(f"✓ Existing font file is valid")
                    except Exception:
                        print(f"WARNING: Existing font file appears corrupted, will try to re-download")
                        font_path = None  # Mark as not found so we try to download

                if not font_path:
                    try:
                        import urllib.request
                        print("Font not found or corrupted. Attempting to download Heebo-Regular.ttf...")

                        # Determine where to save
                        if os.path.exists('/app/backend/static'):
                            target_dir = '/app/backend/static/fonts'
                        else:
                            # Dev environment or fallback
                            target_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'fonts')

                        os.makedirs(target_dir, exist_ok=True)
                        target_path = os.path.join(target_dir, 'Heebo-Regular.ttf')

                        # Try multiple URLs
                        urls = [
                            "https://github.com/google/fonts/raw/main/ofl/heebo/static/Heebo-Regular.ttf",
                            "https://raw.githubusercontent.com/google/fonts/main/ofl/heebo/static/Heebo-Regular.ttf",
                        ]

                        downloaded = False
                        for url in urls:
                            try:
                                print(f"Trying to download from: {url}")
                                urllib.request.urlretrieve(url, target_path)
                                # Validate the downloaded file
                                test_font = TTFont(target_path)
                                test_font.close()
                                font_path = target_path
                                downloaded = True
                                print(f"✓ Successfully downloaded and validated font from {url}")
                                break
                            except Exception as e:
                                print(f"✗ Failed to download/validate from {url}: {e}")
                                if os.path.exists(target_path):
                                    os.remove(target_path)
                                continue

                        if not downloaded:
                            print("WARNING: Could not download valid font file")
                    except Exception as e:
                        print(f"Failed to download font: {e}")

            font_loaded = False
            if font_path and os.path.exists(font_path):
                try:
                    pdfmetrics.registerFont(TTFont('Hebrew', font_path))
                    font_name = 'Hebrew'
                    font_loaded = True
                    print(f"✓ Successfully registered Hebrew font from {font_path}")
                except Exception as e:
                    print(f"✗ Failed to register font from {font_path}: {e}")
                    font_path = None  # Mark as failed so we try system fonts

            # Try Windows system fonts with Hebrew support (if Heebo not found or failed)
            if not font_loaded and os.name == 'nt':  # Windows
                windows_fonts = [
                    r'C:\Windows\Fonts\arial.ttf',  # Arial (has Hebrew support)
                    r'C:\Windows\Fonts\tahoma.ttf',  # Tahoma (has Hebrew support)
                    r'C:\Windows\Fonts\arialuni.ttf',  # Arial Unicode MS (full Unicode support)
                ]
                print("🔍 Trying Windows system fonts with Hebrew support...")
                for win_font in windows_fonts:
                    if os.path.exists(win_font):
                        try:
                            pdfmetrics.registerFont(TTFont('Hebrew', win_font))
                            font_name = 'Hebrew'
                            font_loaded = True
                            print(f"✓ Successfully using Windows system font: {win_font}")
                            break
                        except Exception as e3:
                            print(f"✗ Failed to load {win_font}: {e3}")
                            continue

            # Try Linux system font as last resort (only if not Windows)
            if not font_loaded and os.name != 'nt':
                try:
                    pdfmetrics.registerFont(TTFont('Hebrew', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
                    font_name = 'Hebrew'
                    font_loaded = True
                    print("✓ Using system DejaVu font as fallback")
                except Exception as e2:
                    print(f"✗ Failed to load system font: {e2}")
                    font_loaded = False

        except Exception as e:
            print(f"✗ Warning: Hebrew font not found ({e}), using default Helvetica")
            font_loaded = False

        if not font_loaded:
            print("WARNING: WARNING: Hebrew font not loaded! Text will not display correctly.")

        styles = getSampleStyleSheet()
        style_normal = ParagraphStyle('HebrewNormal', parent=styles['Normal'], fontName=font_name, fontSize=11, alignment=1,
                                      leading=16, spaceAfter=10,
                                      textColor=colors.HexColor('#111827'))  # שחור כהה ונגיש יותר
        style_title = ParagraphStyle('HebrewTitle', parent=styles['Heading1'], fontName=font_name, fontSize=22, alignment=1,
                                     textColor=colors.HexColor('#0B2353'), leading=30, spaceAfter=25, spaceBefore=10,
                                     backColor=colors.HexColor('#DBEAFE'))  # רקע ותוספות ניגוד
        style_h2 = ParagraphStyle('HebrewHeading2', parent=styles['Heading2'], fontName=font_name, fontSize=15, alignment=1,
                                  textColor=colors.HexColor('#173162'), leading=22, spaceBefore=15, spaceAfter=12,
                                  backColor=colors.HexColor('#E0E7FF'))  # highlight מעודכן

        elements = []

        # Use arabic-reshaper and python-bidi for proper RTL support
        try:
            import arabic_reshaper
            from bidi.algorithm import get_display
            bidi_available = True
        except ImportError:
            bidi_available = False
            print("WARNING: arabic-reshaper or python-bidi not available, using simple text formatting")

        def format_text(text):
            if not text: return ""
            if not isinstance(text, str): text = str(text)

            # If font is loaded and bidi is available, use proper RTL shaping
            if font_loaded and bidi_available:
                try:
                    # Reshape Arabic/Hebrew text for proper display
                    reshaped_text = arabic_reshaper.reshape(text)
                    # Get bidirectional display
                    bidi_text = get_display(reshaped_text)
                    return bidi_text
                except Exception as e:
                    # Only log first error to avoid spam
                    if not hasattr(format_text, '_logged_error'):
                        print(f"WARNING: Error in bidi processing: {e}, using text as-is")
                        format_text._logged_error = True
                    return text
            else:
                # Fallback: use text as-is
                return text

        # Add Logo at the top
        try:
            from reportlab.platypus import Image
            # Try to find logo in multiple locations
            logo_paths = [
                os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'frontend', 'public', 'logo.png'),
                os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'frontend', 'public', 'logo.png'),
                'frontend/public/logo.png',
            ]
            logo_path = None
            for path in logo_paths:
                if os.path.exists(path):
                    logo_path = path
                    break

            if logo_path:
                logo = Image(logo_path, width=100, height=100)
                logo.hAlign = 'CENTER'
                elements.append(logo)
                elements.append(Spacer(1, 10))
        except Exception as e:
            print(f"Could not load logo: {e}")

        elements.append(Paragraph(format_text(f"{REPORT_LABELS['project_report']}: {project.name}"), style_title))
        elements.append(Paragraph(format_text(f"{REPORT_LABELS['production_date']}: {date.today().strftime('%d/%m/%Y')}"),
                                  style_normal))
        elements.append(Spacer(1, 20))

        # Summary
        if options.include_summary and summary:
            elements.append(Paragraph(format_text(REPORT_LABELS['financial_summary']), style_h2))
            elements.append(Spacer(1, 10))
            data = [
                [format_text(REPORT_LABELS['details']), format_text(REPORT_LABELS['amount'])],
                [format_text(REPORT_LABELS['total_income']), f"{summary['income']:,.2f} ₪"],
                [format_text(REPORT_LABELS['total_expenses']), f"{summary['expenses']:,.2f} ₪"],
                [format_text(REPORT_LABELS['balance_profit']), f"{summary['profit']:,.2f} ₪"],
            ]
            t = Table(data, colWidths=[200, 150], style=[
                ('FONT', (0, 0), (-1, -1), font_name),
                ('GRID', (0, 0), (-1, -1), 1.2, colors.HexColor('#64748B')),  # גבול עבה יותר
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A8A')),  # header כחול כהה
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F8FAFC')),  # תאים פנימיים לבן
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('PADDING', (0, 0), (-1, -1), 12),
            ])
            elements.append(t)
            elements.append(Spacer(1, 28))

        # Fund
        if options.include_funds and fund:
            elements.append(Paragraph(format_text(REPORT_LABELS['fund_status']), style_h2))
            elements.append(Spacer(1, 10))
            data = [
                [format_text(REPORT_LABELS['current_balance']), f"{fund.current_balance:,.2f} ₪"],
                [format_text(REPORT_LABELS['monthly_deposit']), f"{fund.monthly_amount:,.2f} ₪"]
            ]
            t = Table(data, colWidths=[200, 150])
            t.setStyle(TableStyle([
                ('FONT', (0, 0), (-1, -1), font_name),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#D1FAE5')),  # Emerald-100
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('PADDING', (0, 0), (-1, -1), 8),
            ]))
            elements.append(t)
            elements.append(Spacer(1, 20))

        # Budgets
        if options.include_budgets and budgets:
            elements.append(Paragraph(format_text(REPORT_LABELS['budget_vs_actual']), style_h2))
            elements.append(Spacer(1, 10))
            budget_table_data = [[format_text(REPORT_LABELS['category']), format_text(REPORT_LABELS['budget']),
                                  format_text(REPORT_LABELS['used']), format_text(REPORT_LABELS['remaining'])]]
            for b in budgets:
                cat_name = b['category'] if b['category'] else REPORT_LABELS['general']
                budget_table_data.append([
                    format_text(cat_name),
                    f"{b['amount']:,.2f}",
                    f"{b['spent_amount']:,.2f}",
                    f"{b['remaining_amount']:,.2f}"
                ])

            bt = Table(budget_table_data, colWidths=[120, 100, 100, 100], style=[
                ('FONT', (0, 0), (-1, -1), font_name),
                ('GRID', (0, 0), (-1, -1), 1.2, colors.HexColor('#7C3AED')),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7C3AED')),  # Violet-700 header
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F3F4F6')),  # bg
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('PADDING', (0, 0), (-1, -1), 10),
            ])
            elements.append(bt)
            elements.append(Spacer(1, 28))

        # Transactions - Group by category and create separate tables
        if options.include_transactions and transactions:
            elements.append(Paragraph(format_text(REPORT_LABELS['transaction_details']), style_h2))
            elements.append(Spacer(1, 10))

            # Group transactions by category
            transactions_by_category = {}
            # Get selected categories if any
            selected_categories = set(options.categories) if options.categories and len(options.categories) > 0 else None

            for tx in transactions:
                if isinstance(tx, dict):
                    cat_name = tx.get('category') or REPORT_LABELS['general']
                else:
                    cat_name = tx.category.name if tx.category else REPORT_LABELS['general']

                # Only include transactions from selected categories if categories were selected
                if selected_categories is None or cat_name in selected_categories:
                    if cat_name not in transactions_by_category:
                        transactions_by_category[cat_name] = []
                    transactions_by_category[cat_name].append(tx)

            # Create a table for each category
            for cat_name, cat_transactions in transactions_by_category.items():
                # Category header
                elements.append(Paragraph(format_text(f"{REPORT_LABELS['category']}: {cat_name}"), style_h2))
                elements.append(Spacer(1, 7))
                elements.append(Table([[""]], colWidths=[520], rowHeights=[4], style=[
                    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#E0E7FF'))]))  # קו צבעוני בעובי 4
                elements.append(Spacer(1, 7))
                # Check if any transaction has a supplier
                has_suppliers = any(
                    (tx.get('supplier_name') if isinstance(tx, dict) else (tx.supplier.name if tx.supplier else None))
                    for tx in cat_transactions
                ) if cat_transactions else False
                # Build table headers
                if has_suppliers:
                    tx_data = [[
                        format_text(REPORT_LABELS['date']),
                        format_text(REPORT_LABELS['type']),
                        format_text(REPORT_LABELS['amount']),
                        format_text(REPORT_LABELS['supplier']),
                        format_text(REPORT_LABELS['description'])
                    ]]
                    col_widths = [70, 50, 70, 80, 200]
                else:
                    tx_data = [[
                        format_text(REPORT_LABELS['date']),
                        format_text(REPORT_LABELS['type']),
                        format_text(REPORT_LABELS['amount']),
                        format_text(REPORT_LABELS['description'])
                    ]]
                    col_widths = [80, 60, 80, 250]
                # Add transaction rows
                for tx in cat_transactions:
                    if isinstance(tx, dict):
                        tx_type = REPORT_LABELS['income'] if tx.get('type') == "Income" else REPORT_LABELS['expense']
                        tx_desc = tx.get('description') or ""
                        # Truncate description nicely
                        if len(tx_desc) > 40:
                            tx_desc = tx_desc[:37] + "..."
                        supplier_name = tx.get('supplier_name') or ""
                        if len(supplier_name) > 25:
                            supplier_name = supplier_name[:22] + "..."
                        tx_date = tx.get('tx_date')
                        tx_amount = tx.get('amount', 0)
                    else:
                        tx_type = REPORT_LABELS['income'] if tx.type == "Income" else REPORT_LABELS['expense']
                        tx_desc = tx.description or ""
                        # Truncate description nicely
                        if len(tx_desc) > 40:
                            tx_desc = tx_desc[:37] + "..."
                        supplier_name = tx.supplier.name if tx.supplier else ""
                        if len(supplier_name) > 25:
                            supplier_name = supplier_name[:22] + "..."
                        tx_date = tx.tx_date
                        tx_amount = tx.amount
                    if has_suppliers:
                        tx_data.append([
                            str(tx_date),
                            format_text(tx_type),
                            f"{tx_amount:,.2f}",
                            format_text(supplier_name),
                            format_text(tx_desc)
                        ])
                    else:
                        tx_data.append([
                            str(tx_date),
                            format_text(tx_type),
                            f"{tx_amount:,.2f}",
                            format_text(tx_desc)
                        ])
                # Create and style table
                tx_table = Table(tx_data, repeatRows=1, colWidths=col_widths, style=[
                    ('FONT', (0, 0), (-1, -1), font_name),
                    ('GRID', (0, 0), (-1, -1), 0.75, colors.HexColor('#C2410C')),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#C2410C')),  # Orange-800 header
                    ('FONTSIZE', (0, 0), (-1, -1), 10),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#FFFBEB')),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('PADDING', (0, 0), (-1, -1), 5),
                ])
                elements.append(tx_table)
                elements.append(Spacer(1, 18))  # Space between category tables

        # Charts
        if options.include_charts:
            elements.append(Spacer(1, 20))
            elements.append(Paragraph(format_text("גרפים"), style_h2))
            elements.append(Spacer(1, 10))

            CHART_TITLES = {
                "income_expense_pie": "עוגת הכנסות מול הוצאות",
                "expense_by_category_pie": "הוצאות לפי קטגוריה (גרף עוגה)",
                "expense_by_category_bar": "הוצאות לפי קטגוריה (גרף עמודות)",
                "trends_line": "מגמות הכנסות/הוצאות לאורך זמן"
            }

            charts_to_render = {}

            # Use provided images if available
            if chart_images:
                charts_to_render = chart_images
            # Otherwise generate them if chart_types provided
            else:
                # Always generate all relevant charts if not specified
                chart_types = options.chart_types or [
                    "income_expense_pie",
                    "expense_by_category_pie",
                    "expense_by_category_bar",
                    "trends_line"
                ]
                for chart_type in chart_types:
                    try:
                        print(f"INFO: Creating chart: {chart_type}")
                        chart_buffer = self._create_chart_image(chart_type, {}, summary, transactions)
                        if chart_buffer:
                            chart_buffer.seek(0)
                            chart_bytes = chart_buffer.read()
                            if chart_bytes:
                                chart_name = CHART_TITLES.get(chart_type, chart_type)
                                charts_to_render[chart_name] = chart_bytes
                    except Exception as e:
                        print(f"WARNING: Error preparing chart {chart_type}: {e}")

            if charts_to_render:
                for chart_name, image_bytes in charts_to_render.items():
                    try:
                        img_buffer = BytesIO(image_bytes)
                        # Reduced size: width=320, height=240 (was 400x250)
                        img = RLImage(img_buffer, width=320, height=240)
                        elements.append(Paragraph(format_text(f"גרף: {chart_name}"), styles['Heading2']))
                        elements.append(Spacer(1, 10))
                        elements.append(img)
                        elements.append(Spacer(1, 20))
                    except Exception as e:
                        print(f"WARNING: Failed to add chart {chart_name} to PDF: {e}")

        doc.build(elements)
        buffer.seek(0)
        return buffer.read()


    async def _generate_excel(self, project, options, transactions, budgets, fund, summary, chart_images=None) -> bytes:
        wb = Workbook()
        ws = wb.active
        ws.title = "דוח"
        ws.sheet_view.rightToLeft = True

        # Styles - matching PDF colors with more prominent headers
        from openpyxl.styles import Border, Side
        header_font = Font(bold=True, color="FFFFFF", size=11)
        title_font = Font(bold=True, size=16, color="FFFFFF")  # White text for better contrast
        h2_font = Font(bold=True, size=14, color="FFFFFF")  # White text, larger size
        fill_blue = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")  # Blue-100
        fill_green = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")  # Emerald-100
        fill_purple = PatternFill(start_color="EDE9FE", end_color="EDE9FE", fill_type="solid")  # Violet-100
        fill_orange = PatternFill(start_color="FFEDD5", end_color="FFEDD5", fill_type="solid")  # Orange-100
        fill_blue_header = PatternFill(start_color="2563eb", end_color="2563eb",
                                       fill_type="solid")  # Blue-600 for headers (darker, more prominent)
        fill_title = PatternFill(start_color="1e40af", end_color="1e40af", fill_type="solid")  # Blue-800 for title
        fill_h2 = PatternFill(start_color="3b82f6", end_color="3b82f6", fill_type="solid")  # Blue-500 for section headers
        thin_border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )

        current_row = 1

        # Title
        ws.merge_cells(f'A{current_row}:B{current_row}')
        title_cell = ws[f'A{current_row}']
        title_cell.value = f"{REPORT_LABELS['project_report']}: {project.name}"
        title_cell.font = title_font
        title_cell.fill = fill_title
        title_cell.alignment = Alignment(horizontal='center', vertical='center')
        title_cell.border = thin_border
        current_row += 1

        ws.merge_cells(f'A{current_row}:B{current_row}')
        date_cell = ws[f'A{current_row}']
        date_cell.value = f"{REPORT_LABELS['production_date']}: {date.today().strftime('%d/%m/%Y')}"
        date_cell.alignment = Alignment(horizontal='center', vertical='center')
        current_row += 2  # Spacer

        # 1. Summary
        if options.include_summary and summary:
            ws.merge_cells(f'A{current_row}:B{current_row}')
            summary_header = ws[f'A{current_row}']
            summary_header.value = REPORT_LABELS['financial_summary']
            summary_header.font = h2_font
            summary_header.fill = fill_h2
            summary_header.alignment = Alignment(horizontal='center', vertical='center')
            summary_header.border = thin_border
            current_row += 1

            # Summary table headers
            ws[f'A{current_row}'] = REPORT_LABELS['details']
            ws[f'B{current_row}'] = REPORT_LABELS['amount']
            for col in ['A', 'B']:
                cell = ws[f'{col}{current_row}']
                cell.font = header_font
                cell.fill = fill_blue_header
                cell.alignment = Alignment(horizontal='center', vertical='center')
                cell.border = thin_border
            current_row += 1

            # Summary data
            ws[f'A{current_row}'] = REPORT_LABELS['total_income']
            ws[f'B{current_row}'] = f"{summary['income']:,.2f} ₪"
            for col in ['A', 'B']:
                ws[f'{col}{current_row}'].border = thin_border
            current_row += 1

            ws[f'A{current_row}'] = REPORT_LABELS['total_expenses']
            ws[f'B{current_row}'] = f"{summary['expenses']:,.2f} ₪"
            for col in ['A', 'B']:
                ws[f'{col}{current_row}'].border = thin_border
            current_row += 1

            ws[f'A{current_row}'] = REPORT_LABELS['balance_profit']
            ws[f'B{current_row}'] = f"{summary['profit']:,.2f} ₪"
            for col in ['A', 'B']:
                ws[f'{col}{current_row}'].border = thin_border
            current_row += 2  # Spacer

            ws.column_dimensions['A'].width = 20
            ws.column_dimensions['B'].width = 20

        # 2. Fund
        if options.include_funds and fund:
            ws.merge_cells(f'A{current_row}:B{current_row}')
            fund_header = ws[f'A{current_row}']
            fund_header.value = REPORT_LABELS['fund_status']
            fund_header.font = h2_font
            fund_header.fill = fill_h2
            fund_header.alignment = Alignment(horizontal='center', vertical='center')
            fund_header.border = thin_border
            current_row += 1

            ws[f'A{current_row}'] = REPORT_LABELS['current_balance']
            ws[f'B{current_row}'] = f"{fund.current_balance:,.2f} ₪"
            ws[f'A{current_row}'].fill = fill_green
            for col in ['A', 'B']:
                ws[f'{col}{current_row}'].border = thin_border
            current_row += 1

            ws[f'A{current_row}'] = REPORT_LABELS['monthly_deposit']
            ws[f'B{current_row}'] = f"{fund.monthly_amount:,.2f} ₪"
            ws[f'A{current_row}'].fill = fill_green
            for col in ['A', 'B']:
                ws[f'{col}{current_row}'].border = thin_border
            current_row += 2  # Spacer

        # 3. Budgets
        if options.include_budgets and budgets:
            ws.merge_cells(f'A{current_row}:D{current_row}')
            budget_header = ws[f'A{current_row}']
            budget_header.value = REPORT_LABELS['budget_vs_actual']
            budget_header.font = h2_font
            budget_header.fill = fill_h2
            budget_header.alignment = Alignment(horizontal='center', vertical='center')
            budget_header.border = thin_border
            current_row += 1

            # Budget table headers
            ws[f'A{current_row}'] = REPORT_LABELS['category']
            ws[f'B{current_row}'] = REPORT_LABELS['budget']
            ws[f'C{current_row}'] = REPORT_LABELS['used']
            ws[f'D{current_row}'] = REPORT_LABELS['remaining']
            for col in ['A', 'B', 'C', 'D']:
                cell = ws[f'{col}{current_row}']
                cell.font = header_font
                cell.fill = fill_purple
                cell.alignment = Alignment(horizontal='center', vertical='center')
                cell.border = thin_border
            current_row += 1

            for b in budgets:
                cat_name = b['category'] if b['category'] else REPORT_LABELS['general']
                ws[f'A{current_row}'] = cat_name
                ws[f'B{current_row}'] = f"{b['amount']:,.2f}"
                ws[f'C{current_row}'] = f"{b['spent_amount']:,.2f}"
                ws[f'D{current_row}'] = f"{b['remaining_amount']:,.2f}"
                for col in ['A', 'B', 'C', 'D']:
                    ws[f'{col}{current_row}'].border = thin_border
                current_row += 1

            ws.column_dimensions['A'].width = 20
            ws.column_dimensions['B'].width = 15
            ws.column_dimensions['C'].width = 15
            ws.column_dimensions['D'].width = 15
            current_row += 1  # Spacer

        # 4. Transactions - Group by category (same as PDF)
        if options.include_transactions and transactions:
            ws.merge_cells(f'A{current_row}:E{current_row}')
            tx_header = ws[f'A{current_row}']
            tx_header.value = REPORT_LABELS['transaction_details']
            tx_header.font = h2_font
            tx_header.fill = fill_h2
            tx_header.alignment = Alignment(horizontal='center', vertical='center')
            tx_header.border = thin_border
            current_row += 1

            # Group transactions by category
            transactions_by_category = {}
            selected_categories = set(options.categories) if options.categories and len(options.categories) > 0 else None

            for tx in transactions:
                if isinstance(tx, dict):
                    cat_name = tx.get('category') or REPORT_LABELS['general']
                else:
                    cat_name = tx.category.name if tx.category else REPORT_LABELS['general']

                if selected_categories is None or cat_name in selected_categories:
                    if cat_name not in transactions_by_category:
                        transactions_by_category[cat_name] = []
                    transactions_by_category[cat_name].append(tx)

            # Create a table for each category
            for cat_name, cat_transactions in transactions_by_category.items():
                # Check if any transaction has a supplier
                has_suppliers = any(
                    (tx.get('supplier_name') if isinstance(tx, dict) else (tx.supplier.name if tx.supplier else None))
                    for tx in cat_transactions
                ) if cat_transactions else False

                # Category header
                max_col = 'E' if has_suppliers else 'D'
                ws.merge_cells(f'A{current_row}:{max_col}{current_row}')
                cat_header = ws[f'A{current_row}']
                cat_header.value = f"{REPORT_LABELS['category']}: {cat_name}"
                cat_header.font = h2_font
                cat_header.fill = fill_h2
                cat_header.alignment = Alignment(horizontal='center', vertical='center')
                cat_header.border = thin_border
                current_row += 1

                # Build table headers
                if has_suppliers:
                    ws[f'A{current_row}'] = REPORT_LABELS['date']
                    ws[f'B{current_row}'] = REPORT_LABELS['type']
                    ws[f'C{current_row}'] = REPORT_LABELS['amount']
                    ws[f'D{current_row}'] = REPORT_LABELS['supplier']
                    ws[f'E{current_row}'] = REPORT_LABELS['description']
                    for col in ['A', 'B', 'C', 'D', 'E']:
                        cell = ws[f'{col}{current_row}']
                        cell.font = header_font
                        cell.fill = fill_orange
                        cell.alignment = Alignment(horizontal='center', vertical='center')
                        cell.border = thin_border
                    current_row += 1

                    for tx in cat_transactions:
                        if isinstance(tx, dict):
                            tx_type = REPORT_LABELS['income'] if tx.get('type') == "Income" else REPORT_LABELS['expense']
                            supplier_name = tx.get('supplier_name') or ""
                            tx_desc = tx.get('description') or ""
                            tx_date = tx.get('tx_date')
                            tx_amount = tx.get('amount', 0)
                        else:
                            tx_type = REPORT_LABELS['income'] if tx.type == "Income" else REPORT_LABELS['expense']
                            supplier_name = tx.supplier.name if tx.supplier else ""
                            tx_desc = tx.description or ""
                            tx_date = tx.tx_date
                            tx_amount = tx.amount

                        ws[f'A{current_row}'] = str(tx_date)
                        ws[f'B{current_row}'] = tx_type
                        ws[f'C{current_row}'] = f"{tx_amount:,.2f}"
                        ws[f'D{current_row}'] = supplier_name
                        ws[f'E{current_row}'] = tx_desc
                        for col in ['A', 'B', 'C', 'D', 'E']:
                            ws[f'{col}{current_row}'].border = thin_border
                        current_row += 1
                else:
                    ws[f'A{current_row}'] = REPORT_LABELS['date']
                    ws[f'B{current_row}'] = REPORT_LABELS['type']
                    ws[f'C{current_row}'] = REPORT_LABELS['amount']
                    ws[f'D{current_row}'] = REPORT_LABELS['description']
                    for col in ['A', 'B', 'C', 'D']:
                        cell = ws[f'{col}{current_row}']
                        cell.font = header_font
                        cell.fill = fill_orange
                        cell.alignment = Alignment(horizontal='center', vertical='center')
                        cell.border = thin_border
                    current_row += 1

                    for tx in cat_transactions:
                        if isinstance(tx, dict):
                            tx_type = REPORT_LABELS['income'] if tx.get('type') == "Income" else REPORT_LABELS['expense']
                            tx_desc = tx.get('description') or ""
                            tx_date = tx.get('tx_date')
                            tx_amount = tx.get('amount', 0)
                        else:
                            tx_type = REPORT_LABELS['income'] if tx.type == "Income" else REPORT_LABELS['expense']
                            tx_desc = tx.description or ""
                            tx_date = tx.tx_date
                            tx_amount = tx.amount

                        ws[f'A{current_row}'] = str(tx_date)
                        ws[f'B{current_row}'] = tx_type
                        ws[f'C{current_row}'] = f"{tx_amount:,.2f}"
                        ws[f'D{current_row}'] = tx_desc
                        for col in ['A', 'B', 'C', 'D']:
                            ws[f'{col}{current_row}'].border = thin_border
                        current_row += 1

                current_row += 1  # Spacer between categories

            # Set column widths for transactions (set all possible columns)
            ws.column_dimensions['A'].width = 12
            ws.column_dimensions['B'].width = 10
            ws.column_dimensions['C'].width = 12
            ws.column_dimensions['D'].width = 20  # Can be supplier or description
            ws.column_dimensions['E'].width = 30  # Description when supplier exists

        # Charts - Add as images (same as PDF)
        if options.include_charts:
            try:
                current_row += 2  # Spacer

                # Add charts section header
                ws.merge_cells(f'A{current_row}:E{current_row}')
                charts_header = ws[f'A{current_row}']
                charts_header.value = "גרפים"
                charts_header.font = h2_font
                charts_header.fill = fill_h2
                charts_header.alignment = Alignment(horizontal='center', vertical='center')
                charts_header.border = thin_border
                current_row += 2

                from openpyxl.drawing.image import Image as XLImage

                CHART_TITLES = {
                    "income_expense_pie": "הכנסות מול הוצאות",
                    "expense_by_category_pie": "הוצאות לפי קטגוריה (עוגה)",
                    "expense_by_category_bar": "הוצאות לפי קטגוריה (עמודות)",
                    "trends_line": "מגמות לאורך זמן"
                }

                charts_to_render = {}

                # Use provided images if available
                if chart_images:
                    charts_to_render = chart_images
                # Otherwise generate them if chart_types provided
                elif options.chart_types:
                    for chart_type in options.chart_types:
                        try:
                            print(f"INFO: Creating chart for Excel: {chart_type}")
                            chart_buffer = self._create_chart_image(chart_type, {}, summary, transactions)
                            if chart_buffer:
                                chart_buffer.seek(0)
                                chart_bytes = chart_buffer.read()
                                if chart_bytes:
                                    chart_name = CHART_TITLES.get(chart_type, chart_type)
                                    charts_to_render[chart_name] = chart_bytes
                        except Exception as e:
                            print(f"WARNING: Error preparing chart {chart_type}: {e}")

                if charts_to_render:
                    # Note: We use current_row instead of fixed row=5 to append after existing content
                    row = current_row
                    for chart_name, image_bytes in charts_to_render.items():
                        try:
                            # המר bytes לתמונה
                            img_buffer = BytesIO(image_bytes)
                            img = XLImage(img_buffer)

                            # Fixed Aspect Ratio: 480x360 (4:3) roughly matches figsize(10, 6) cropped
                            # Using 480 width and calculating height to maintain aspect if possible,
                            # but simpler to use fixed nice size that matches cells roughly.
                            img.width = 480
                            img.height = 320

                            # הוסף תמונה לגיליון
                            ws.add_image(img, f'A{row}')

                            # Adjust row height
                            ws.row_dimensions[row].height = 240

                            row += 16  # Spacer
                        except Exception as e:
                            print(f"WARNING: Failed to add chart {chart_name} to Excel: {e}")

                    current_row = row  # Update global row tracker

            except Exception as e:
                import traceback
                print(f"WARNING: Error in charts section in Excel: {e}")
                traceback.print_exc()
                # Continue without charts

        # Limit the used range to only the rows and columns we actually used
        # This ensures the rest of the sheet is empty
        max_col = 'E'  # Maximum column we might use
        if current_row > 1:
            # Set the print area to only the used range
            ws.print_area = f'A1:{max_col}{current_row - 1}'
            # Delete any rows/columns beyond what we used (optional, but ensures clean sheet)
            # Note: openpyxl doesn't have a direct way to delete unused rows/columns,
            # but limiting print_area and not setting values beyond current_row achieves the goal

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.read()


    async def _generate_zip(self, project, options, report_content, transactions) -> bytes:
        from backend.services.s3_service import S3Service
        try:
            s3_service = S3Service()
            has_s3 = True
        except Exception:
            has_s3 = False

        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
            # Report File
            ext = "xlsx" if options.format == "zip" else "pdf"  # Default to excel inside zip if zip requested directly?
            # Actually, if options.format is zip, we generated excel above.
            zf.writestr(f"report.{ext}", report_content)

            if has_s3:
                # Add Contract if requested
                if options.include_project_contract and project.contract_file_url:
                    try:
                        contract_content = s3_service.get_file_content(project.contract_file_url)
                        if contract_content:
                            fname = project.contract_file_url.split('/')[-1]
                            zf.writestr(f"contract_{fname}", contract_content)
                    except Exception as e:
                        print(f"Error adding contract to ZIP: {e}")

                # Add Image if requested
                if options.include_project_image and project.image_url:
                    try:
                        # Assuming image_url is a path or key relative to bucket/base
                        image_content = s3_service.get_file_content(project.image_url)
                        if image_content:
                            fname = project.image_url.split('/')[-1]
                            zf.writestr(f"project_image_{fname}", image_content)
                    except Exception as e:
                        print(f"Error adding image to ZIP: {e}")

                # Documents
                if options.include_transactions:
                    for tx in transactions:
                        file_path = tx.get('file_path') if isinstance(tx, dict) else getattr(tx, 'file_path', None)
                        if file_path:
                            try:
                                content = s3_service.get_file_content(file_path)
                                if content:
                                    # Safe filename
                                    tx_date = tx.get('tx_date') if isinstance(tx, dict) else tx.tx_date
                                    tx_id = tx.get('id') if isinstance(tx, dict) else tx.id
                                    fname = f"{tx_date}_{tx_id}.{file_path.split('.')[-1]}"
                                    zf.writestr(f"documents/{fname}", content)
                            except Exception:
                                pass

        output.seek(0)
        return output.read()


    async def generate_excel_report(self, project_id: int) -> bytes:
        """Generate Excel report for a project"""
        # Fetch data
        project_data = await self.project_profitability(project_id)
        transactions = await self.get_project_transactions(project_id)
        expense_categories = await self.get_project_expense_categories(project_id)

        # Get Project details
        proj = (await self.db.execute(select(Project).where(Project.id == project_id))).scalar_one()

        wb = Workbook()

        # Styles
        header_font = Font(bold=True, color="FFFFFF")
        fill_blue = PatternFill(start_color="3b82f6", end_color="3b82f6", fill_type="solid")
        fill_orange = PatternFill(start_color="f59e0b", end_color="f59e0b", fill_type="solid")
        fill_green = PatternFill(start_color="10b981", end_color="10b981", fill_type="solid")

        # 1. Summary Sheet
        ws_summary = wb.active
        ws_summary.title = REPORT_LABELS['financial_summary'][:30]
        ws_summary.sheet_view.rightToLeft = True

        summary_data = [
            [f"{REPORT_LABELS['project_report']}: {proj.name}"],
            [f"{REPORT_LABELS['production_date']}: {date.today().strftime('%d/%m/%Y')}"],
            [],
            [REPORT_LABELS['financial_summary']],
            [REPORT_LABELS['total_income'], project_data["income"]],
            [REPORT_LABELS['total_expenses'], project_data["expenses"]],
            [REPORT_LABELS['profit'], project_data["profit"]],
            [REPORT_LABELS['monthly_budget'], project_data["budget_monthly"]],
            [REPORT_LABELS['annual_budget'], project_data["budget_annual"]],
        ]

        for row in summary_data:
            ws_summary.append(row)

        ws_summary.column_dimensions['A'].width = 20
        ws_summary['D1'].fill = fill_blue  # Just an example if we had headers properly

        # 2. Transactions Sheet
        ws_tx = wb.create_sheet(REPORT_LABELS['transaction_details'][:30])
        ws_tx.sheet_view.rightToLeft = True
        headers = [
            REPORT_LABELS['date'],
            REPORT_LABELS['type'],
            REPORT_LABELS['amount'],
            REPORT_LABELS['category'],
            REPORT_LABELS['description'],
            REPORT_LABELS['payment_method'],
            REPORT_LABELS['notes'],
            REPORT_LABELS['file']
        ]
        ws_tx.append(headers)
        for cell in ws_tx[1]:
            cell.font = header_font
            cell.fill = fill_orange
            cell.alignment = Alignment(horizontal='center')

        for tx in transactions:
            tx_type = REPORT_LABELS['income'] if tx["type"] == "Income" else REPORT_LABELS['expense']
            row = [
                tx["tx_date"],
                tx_type,
                tx["amount"],
                tx["category"] or "",
                tx["description"] or "",
                tx.get("payment_method") or "",
                tx["notes"] or "",
                REPORT_LABELS['yes'] if tx.get("file_path") else REPORT_LABELS['no']
            ]
            ws_tx.append(row)

        ws_tx.column_dimensions['A'].width = 12
        ws_tx.column_dimensions['B'].width = 10
        ws_tx.column_dimensions['C'].width = 12
        ws_tx.column_dimensions['D'].width = 15
        ws_tx.column_dimensions['E'].width = 30

        # 3. Categories Breakdown
        ws_cat = wb.create_sheet(REPORT_LABELS['categories'][:30])
        ws_cat.sheet_view.rightToLeft = True
        ws_cat.append([REPORT_LABELS['category'], REPORT_LABELS['amount']])
        for cell in ws_cat[1]:
            cell.font = header_font
            cell.fill = fill_green
            cell.alignment = Alignment(horizontal='center')

        for cat in expense_categories:
            ws_cat.append([cat["category"], cat["amount"]])

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.read()


async def generate_zip_export(self, project_id: int) -> bytes:
    """Generate ZIP export with Excel report and transaction documents"""
    # Generate Excel
    excel_data = await self.generate_excel_report(project_id)

    # Get transactions for documents
    transactions = await self.get_project_transactions(project_id)

    # Initialize S3 Service
    from backend.services.s3_service import S3Service
    try:
        s3_service = S3Service()
        has_s3 = True
    except Exception:
        has_s3 = False
        print("Warning: S3 Service not available for ZIP export")

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add Excel report
        zf.writestr(f"project_{project_id}_report.xlsx", excel_data)

        # Add documents
        if has_s3:
            for tx in transactions:
                file_path = tx.get("file_path")
                if file_path:
                    try:
                        # Extract filename from path or URL
                        original_filename = file_path.split("/")[-1]
                        # Use transaction ID and date to make filename unique and meaningful
                        ext = original_filename.split(".")[-1] if "." in original_filename else "bin"
                        filename = f"{tx['tx_date']}_{tx['type']}_{tx['id']}.{ext}"

                        content = s3_service.get_file_content(file_path)
                        if content:
                            zf.writestr(f"documents/{filename}", content)
                    except Exception as e:
                        print(f"Error adding file {file_path} to ZIP: {e}")

    output.seek(0)
    return output.read()
