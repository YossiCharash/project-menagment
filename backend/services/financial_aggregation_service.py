from datetime import datetime, date
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, extract

from backend.models.project import Project
from backend.models.transaction import Transaction
from backend.models.subproject import Subproject
from backend.services.project_service import calculate_monthly_income_amount


class FinancialAggregationService:
    """Service for aggregating financial data across parent projects and subprojects"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_parent_project_financial_summary(
        self, 
        parent_project_id: int, 
        start_date: Optional[date] = None, 
        end_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Get consolidated financial summary for a parent project including all subprojects
        
        Args:
            parent_project_id: ID of the parent project
            start_date: Start date for filtering transactions (optional)
            end_date: End date for filtering transactions (optional)
            
        Returns:
            Dictionary containing consolidated financial data
        """
        # Get parent project
        parent_project = self.db.query(Project).filter(
            Project.id == parent_project_id,
            Project.is_active == True
        ).first()
        
        if not parent_project:
            raise ValueError(f"Parent project with ID {parent_project_id} not found")
        
        # Get all subprojects
        subprojects = self.db.query(Project).filter(
            Project.relation_project == parent_project_id,
            Project.is_active == True
        ).all()
        
        # Get all transactions for parent project (including period transactions that overlap)
        parent_transactions_query = self.db.query(Transaction).filter(
            Transaction.project_id == parent_project_id,
            Transaction.from_fund == False
        )
        
        # For regular transactions, filter by tx_date
        # For period transactions, check if period overlaps with date range
        if start_date or end_date:
            date_conditions = []
            if start_date:
                date_conditions.append(
                    or_(
                        # Regular transaction: tx_date in range
                        and_(
                            Transaction.period_start_date.is_(None),
                            Transaction.period_end_date.is_(None),
                            Transaction.tx_date >= start_date
                        ),
                        # Period transaction: period overlaps with range
                        and_(
                            Transaction.period_start_date.is_not(None),
                            Transaction.period_end_date.is_not(None),
                            Transaction.period_start_date <= (end_date if end_date else date.today()),
                            Transaction.period_end_date >= (start_date if start_date else date(1900, 1, 1))
                        )
                    )
                )
            if end_date:
                if start_date:
                    # Already handled in the or_ condition above
                    pass
                else:
                    date_conditions.append(
                        or_(
                            # Regular transaction: tx_date in range
                            and_(
                                Transaction.period_start_date.is_(None),
                                Transaction.period_end_date.is_(None),
                                Transaction.tx_date <= end_date
                            ),
                            # Period transaction: period overlaps with range
                            and_(
                                Transaction.period_start_date.is_not(None),
                                Transaction.period_end_date.is_not(None),
                                Transaction.period_start_date <= end_date,
                                Transaction.period_end_date >= date(1900, 1, 1)
                            )
                        )
                    )
            
            if date_conditions:
                parent_transactions_query = parent_transactions_query.filter(and_(*date_conditions))
        
        parent_transactions = parent_transactions_query.all()
        
        # Calculate parent project financials with proportional amounts for period transactions
        parent_transaction_income = 0.0
        parent_expense = 0.0
        
        effective_start_date = start_date if start_date else date(1900, 1, 1)
        effective_end_date = end_date if end_date else date.today()
        
        for t in parent_transactions:
            if t.type == 'Income':
                if t.period_start_date and t.period_end_date:
                    # Period transaction - calculate proportional amount
                    total_days = (t.period_end_date - t.period_start_date).days + 1
                    if total_days > 0:
                        overlap_start = max(t.period_start_date, effective_start_date)
                        overlap_end = min(t.period_end_date, effective_end_date)
                        if overlap_start <= overlap_end:
                            overlap_days = (overlap_end - overlap_start).days + 1
                            daily_rate = float(t.amount) / total_days
                            parent_transaction_income += daily_rate * overlap_days
                else:
                    # Regular transaction - use full amount
                    parent_transaction_income += float(t.amount)
            elif t.type == 'Expense':
                if t.period_start_date and t.period_end_date:
                    # Period transaction - calculate proportional amount
                    total_days = (t.period_end_date - t.period_start_date).days + 1
                    if total_days > 0:
                        overlap_start = max(t.period_start_date, effective_start_date)
                        overlap_end = min(t.period_end_date, effective_end_date)
                        if overlap_start <= overlap_end:
                            overlap_days = (overlap_end - overlap_start).days + 1
                            daily_rate = float(t.amount) / total_days
                            parent_expense += daily_rate * overlap_days
                else:
                    # Regular transaction - use full amount
                    parent_expense += float(t.amount)
        
        # Calculate income from monthly budget (expected monthly income)
        parent_project_income = 0.0
        monthly_income = float(parent_project.budget_monthly or 0)
        if monthly_income > 0:
            # Use project start_date if available, otherwise use created_at date
            if parent_project.start_date:
                income_calculation_start = parent_project.start_date
            elif hasattr(parent_project, 'created_at') and parent_project.created_at:
                income_calculation_start = parent_project.created_at.date() if hasattr(parent_project.created_at, 'date') else parent_project.created_at
            else:
                # Fallback: use start_date if provided, otherwise use project creation date
                income_calculation_start = start_date if start_date else (parent_project.created_at.date() if hasattr(parent_project, 'created_at') and parent_project.created_at else date.today())
            
            # Use end_date if provided, otherwise use today
            calculation_end_date = end_date if end_date else date.today()
            
            # Only calculate if start date is within the date range
            if income_calculation_start <= calculation_end_date:
                # Adjust start date to be within the date range (if start_date filter is provided)
                if start_date and income_calculation_start < start_date:
                    effective_start = start_date
                else:
                    effective_start = income_calculation_start
                parent_project_income = calculate_monthly_income_amount(monthly_income, effective_start, calculation_end_date)
        
        parent_income = parent_transaction_income + parent_project_income
        parent_profit = parent_income - parent_expense
        parent_profit_margin = (parent_profit / parent_income * 100) if parent_income > 0 else 0
        
        # Calculate subproject financials
        subproject_financials = []
        total_subproject_income = 0
        total_subproject_expense = 0
        
        for subproject in subprojects:
            # Get all transactions for subproject (including period transactions that overlap)
            subproject_transactions_query = self.db.query(Transaction).filter(
                Transaction.project_id == subproject.id,
                Transaction.from_fund == False
            )
            
            # For regular transactions, filter by tx_date
            # For period transactions, check if period overlaps with date range
            if start_date or end_date:
                date_conditions = []
                if start_date:
                    date_conditions.append(
                        or_(
                            # Regular transaction: tx_date in range
                            and_(
                                Transaction.period_start_date.is_(None),
                                Transaction.period_end_date.is_(None),
                                Transaction.tx_date >= start_date
                            ),
                            # Period transaction: period overlaps with range
                            and_(
                                Transaction.period_start_date.is_not(None),
                                Transaction.period_end_date.is_not(None),
                                Transaction.period_start_date <= (end_date if end_date else date.today()),
                                Transaction.period_end_date >= (start_date if start_date else date(1900, 1, 1))
                            )
                        )
                    )
                if end_date and not start_date:
                    date_conditions.append(
                        or_(
                            # Regular transaction: tx_date in range
                            and_(
                                Transaction.period_start_date.is_(None),
                                Transaction.period_end_date.is_(None),
                                Transaction.tx_date <= end_date
                            ),
                            # Period transaction: period overlaps with range
                            and_(
                                Transaction.period_start_date.is_not(None),
                                Transaction.period_end_date.is_not(None),
                                Transaction.period_start_date <= end_date,
                                Transaction.period_end_date >= date(1900, 1, 1)
                            )
                        )
                    )
                
                if date_conditions:
                    subproject_transactions_query = subproject_transactions_query.filter(and_(*date_conditions))
            
            subproject_transactions = subproject_transactions_query.all()
            
            # Calculate subproject financials with proportional amounts for period transactions
            subproject_transaction_income = 0.0
            subproject_expense = 0.0
            
            for t in subproject_transactions:
                if t.type == 'Income':
                    if t.period_start_date and t.period_end_date:
                        # Period transaction - calculate proportional amount
                        total_days = (t.period_end_date - t.period_start_date).days + 1
                        if total_days > 0:
                            overlap_start = max(t.period_start_date, effective_start_date)
                            overlap_end = min(t.period_end_date, effective_end_date)
                            if overlap_start <= overlap_end:
                                overlap_days = (overlap_end - overlap_start).days + 1
                                daily_rate = float(t.amount) / total_days
                                subproject_transaction_income += daily_rate * overlap_days
                    else:
                        # Regular transaction - use full amount
                        subproject_transaction_income += float(t.amount)
                elif t.type == 'Expense':
                    if t.period_start_date and t.period_end_date:
                        # Period transaction - calculate proportional amount
                        total_days = (t.period_end_date - t.period_start_date).days + 1
                        if total_days > 0:
                            overlap_start = max(t.period_start_date, effective_start_date)
                            overlap_end = min(t.period_end_date, effective_end_date)
                            if overlap_start <= overlap_end:
                                overlap_days = (overlap_end - overlap_start).days + 1
                                daily_rate = float(t.amount) / total_days
                                subproject_expense += daily_rate * overlap_days
                    else:
                        # Regular transaction - use full amount
                        subproject_expense += float(t.amount)
            
            # Calculate income from monthly budget (expected monthly income)
            subproject_project_income = 0.0
            subproject_monthly_income = float(subproject.budget_monthly or 0)
            if subproject_monthly_income > 0:
                # Use project start_date if available, otherwise use created_at date
                if subproject.start_date:
                    income_calculation_start = subproject.start_date
                elif hasattr(subproject, 'created_at') and subproject.created_at:
                    income_calculation_start = subproject.created_at.date() if hasattr(subproject.created_at, 'date') else subproject.created_at
                else:
                    # Fallback: use start_date if provided, otherwise use project creation date
                    income_calculation_start = start_date if start_date else (subproject.created_at.date() if hasattr(subproject, 'created_at') and subproject.created_at else date.today())
                
                # Use end_date if provided, otherwise use today
                calculation_end_date = end_date if end_date else date.today()
                
                # Only calculate if start date is within the date range
                if income_calculation_start <= calculation_end_date:
                    # Adjust start date to be within the date range (if start_date filter is provided)
                    if start_date and income_calculation_start < start_date:
                        effective_start = start_date
                    else:
                        effective_start = income_calculation_start
                    subproject_project_income = calculate_monthly_income_amount(subproject_monthly_income, effective_start, calculation_end_date)
            
            subproject_income = subproject_transaction_income + subproject_project_income
            subproject_profit = subproject_income - subproject_expense
            subproject_profit_margin = (subproject_profit / subproject_income * 100) if subproject_income > 0 else 0
            
            # Determine status
            if subproject_profit_margin >= 10:
                status = 'green'
            elif subproject_profit_margin <= -10:
                status = 'red'
            else:
                status = 'yellow'
            
            subproject_financials.append({
                'id': subproject.id,
                'name': subproject.name,
                'income': subproject_income,
                'expense': subproject_expense,
                'profit': subproject_profit,
                'profit_margin': subproject_profit_margin,
                'status': status
            })
            
            total_subproject_income += subproject_income
            total_subproject_expense += subproject_expense
        
        # Calculate consolidated totals
        total_income = parent_income + total_subproject_income
        total_expense = parent_expense + total_subproject_expense
        total_profit = total_income - total_expense
        total_profit_margin = (total_profit / total_income * 100) if total_income > 0 else 0
        
        return {
            'parent_project': {
                'id': parent_project.id,
                'name': parent_project.name,
                'description': parent_project.description,
                'address': parent_project.address,
                'city': parent_project.city,
                'num_residents': parent_project.num_residents,
                'monthly_price_per_apartment': parent_project.monthly_price_per_apartment,
                'budget_monthly': parent_project.budget_monthly,
                'budget_annual': parent_project.budget_annual
            },
            'financial_summary': {
                'total_income': total_income,
                'total_expense': total_expense,
                'net_profit': total_profit,
                'profit_margin': total_profit_margin,
                'subproject_count': len(subprojects),
                'active_subprojects': len([sp for sp in subprojects if sp.is_active])
            },
            'parent_financials': {
                'income': parent_income,
                'expense': parent_expense,
                'profit': parent_profit,
                'profit_margin': parent_profit_margin
            },
            'subproject_financials': subproject_financials,
            'date_range': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None
            }
        }
    
    def get_monthly_financial_summary(
        self, 
        parent_project_id: int, 
        year: int, 
        month: int
    ) -> Dict[str, Any]:
        """Get financial summary for a specific month"""
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month + 1, 1)
        
        return self.get_parent_project_financial_summary(
            parent_project_id, 
            start_date, 
            end_date
        )
    
    def get_yearly_financial_summary(
        self, 
        parent_project_id: int, 
        year: int
    ) -> Dict[str, Any]:
        """Get financial summary for a specific year"""
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)
        
        return self.get_parent_project_financial_summary(
            parent_project_id, 
            start_date, 
            end_date
        )
    
    def get_custom_range_financial_summary(
        self, 
        parent_project_id: int, 
        start_date: date, 
        end_date: date
    ) -> Dict[str, Any]:
        """Get financial summary for a custom date range"""
        return self.get_parent_project_financial_summary(
            parent_project_id, 
            start_date, 
            end_date
        )
    
    def get_subproject_performance_comparison(
        self, 
        parent_project_id: int, 
        start_date: Optional[date] = None, 
        end_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """
        Get performance comparison of all subprojects
        
        Returns:
            List of subproject performance data sorted by profitability
        """
        summary = self.get_parent_project_financial_summary(
            parent_project_id, 
            start_date, 
            end_date
        )
        
        subprojects = summary['subproject_financials']
        
        # Sort by profit margin (descending)
        subprojects.sort(key=lambda x: x['profit_margin'], reverse=True)
        
        return subprojects
    
    def get_financial_trends(
        self, 
        parent_project_id: int, 
        years_back: int = 5
    ) -> Dict[str, Any]:
        """
        Get financial trends over the last N years
        
        Args:
            parent_project_id: ID of the parent project
            years_back: Number of years to look back
            
        Returns:
            Dictionary containing yearly trends
        """
        trends = []
        current_year = datetime.now().year
        
        for i in range(years_back):
            year = current_year - i
            
            # Get yearly summary
            yearly_summary = self.get_yearly_financial_summary(
                parent_project_id, 
                year
            )
            
            trends.append({
                'year': year,
                'income': yearly_summary['financial_summary']['total_income'],
                'expense': yearly_summary['financial_summary']['total_expense'],
                'profit': yearly_summary['financial_summary']['net_profit'],
                'profit_margin': yearly_summary['financial_summary']['profit_margin']
            })
        
        # Reverse to get chronological order
        trends.reverse()
        
        return {
            'trends': trends,
            'period_years': years_back
        }
    
    def _get_month_name(self, month: int) -> str:
        """Get Hebrew month name"""
        month_names = [
            'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
            'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
        ]
        return month_names[month - 1]
