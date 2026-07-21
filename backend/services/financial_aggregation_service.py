from datetime import datetime, date
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, select

from backend.models.project import Project
from backend.models.transaction import Transaction
from backend.models.subproject import Subproject
from backend.services.project_service import calculate_monthly_income_amount


class FinancialAggregationService:
    """Service for aggregating financial data across parent projects and subprojects"""
    
    def __init__(self, db: AsyncSession):
        self.db = db

    def _build_date_conditions(self, start_date: Optional[date], end_date: Optional[date]) -> list:
        """Build the transaction date-overlap filter shared by parent + subprojects.

        Regular transactions are matched by tx_date; period transactions are matched
        by period overlap. Behaviour is intentionally identical to the previous inline
        logic (note: when both dates are given, regular transactions are only bounded
        by start_date, matching the original implementation).
        """
        date_conditions: list = []
        if start_date:
            date_conditions.append(
                or_(
                    and_(
                        Transaction.period_start_date.is_(None),
                        Transaction.period_end_date.is_(None),
                        Transaction.tx_date >= start_date
                    ),
                    and_(
                        Transaction.period_start_date.is_not(None),
                        Transaction.period_end_date.is_not(None),
                        Transaction.period_start_date <= (end_date if end_date else date.today()),
                        Transaction.period_end_date >= start_date
                    )
                )
            )
        elif end_date:
            date_conditions.append(
                or_(
                    and_(
                        Transaction.period_start_date.is_(None),
                        Transaction.period_end_date.is_(None),
                        Transaction.tx_date <= end_date
                    ),
                    and_(
                        Transaction.period_start_date.is_not(None),
                        Transaction.period_end_date.is_not(None),
                        Transaction.period_start_date <= end_date,
                        Transaction.period_end_date >= date(1900, 1, 1)
                    )
                )
            )
        return date_conditions

    def _sum_income_expense(self, transactions: list, effective_start_date: date, effective_end_date: date) -> tuple:
        """Sum income/expense for a list of transactions, prorating period transactions."""
        income = 0.0
        expense = 0.0
        for t in transactions:
            if t.type not in ('Income', 'Expense'):
                continue
            if t.period_start_date and t.period_end_date:
                total_days = (t.period_end_date - t.period_start_date).days + 1
                if total_days > 0:
                    overlap_start = max(t.period_start_date, effective_start_date)
                    overlap_end = min(t.period_end_date, effective_end_date)
                    if overlap_start <= overlap_end:
                        overlap_days = (overlap_end - overlap_start).days + 1
                        amount = float(t.amount) / total_days * overlap_days
                    else:
                        amount = 0.0
                else:
                    amount = 0.0
            else:
                amount = float(t.amount)
            if t.type == 'Income':
                income += amount
            else:
                expense += amount
        return income, expense

    def _monthly_budget_income(self, project, start_date: Optional[date], end_date: Optional[date]) -> float:
        """Expected monthly-budget income for a project within the date range."""
        monthly_income = float(project.budget_monthly or 0)
        if monthly_income <= 0:
            return 0.0
        if project.start_date:
            income_calculation_start = project.start_date
        elif hasattr(project, 'created_at') and project.created_at:
            income_calculation_start = project.created_at.date() if hasattr(project.created_at, 'date') else project.created_at
        else:
            income_calculation_start = start_date if start_date else (
                project.created_at.date() if hasattr(project, 'created_at') and project.created_at else date.today()
            )
        calculation_end_date = end_date if end_date else date.today()
        if income_calculation_start > calculation_end_date:
            return 0.0
        if start_date and income_calculation_start < start_date:
            effective_start = start_date
        else:
            effective_start = income_calculation_start
        return calculate_monthly_income_amount(monthly_income, effective_start, calculation_end_date)

    async def get_parent_project_financial_summary(
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
        result = await self.db.execute(
            select(Project).where(
                Project.id == parent_project_id,
                Project.is_active == True
            )
        )
        parent_project = result.scalar_one_or_none()
        
        if not parent_project:
            raise ValueError(f"Parent project with ID {parent_project_id} not found")
        
        # Get all subprojects
        result = await self.db.execute(
            select(Project).where(
                Project.relation_project == parent_project_id,
                Project.is_active == True
            )
        )
        subprojects = list(result.scalars().all())
        
        # Build the date-overlap filter once and reuse for parent + all subprojects.
        date_conditions = self._build_date_conditions(start_date, end_date)

        effective_start_date = start_date if start_date else date(1900, 1, 1)
        effective_end_date = end_date if end_date else date.today()

        # Parent project transactions (single query)
        parent_transactions_query = select(Transaction).where(
            Transaction.project_id == parent_project_id,
            Transaction.from_fund == False
        )
        if date_conditions:
            parent_transactions_query = parent_transactions_query.where(and_(*date_conditions))
        parent_transactions = list((await self.db.execute(parent_transactions_query)).scalars().all())

        parent_transaction_income, parent_expense = self._sum_income_expense(
            parent_transactions, effective_start_date, effective_end_date
        )
        parent_project_income = self._monthly_budget_income(parent_project, start_date, end_date)

        parent_income = parent_transaction_income + parent_project_income
        parent_profit = parent_income - parent_expense
        parent_profit_margin = (parent_profit / parent_income * 100) if parent_income > 0 else 0

        # Subproject transactions - fetch ALL in a single query and group in memory.
        # Previously this ran one transactions query per subproject (N+1), which was a
        # major source of parent-project page slowness for parents with many subprojects.
        subproject_ids = [sp.id for sp in subprojects]
        transactions_by_subproject: Dict[int, list] = {sp_id: [] for sp_id in subproject_ids}
        if subproject_ids:
            subproject_tx_query = select(Transaction).where(
                Transaction.project_id.in_(subproject_ids),
                Transaction.from_fund == False
            )
            if date_conditions:
                subproject_tx_query = subproject_tx_query.where(and_(*date_conditions))
            all_subproject_txs = (await self.db.execute(subproject_tx_query)).scalars().all()
            for t in all_subproject_txs:
                transactions_by_subproject[t.project_id].append(t)

        # Calculate subproject financials
        subproject_financials = []
        total_subproject_income = 0
        total_subproject_expense = 0

        for subproject in subprojects:
            subproject_transactions = transactions_by_subproject.get(subproject.id, [])

            subproject_transaction_income, subproject_expense = self._sum_income_expense(
                subproject_transactions, effective_start_date, effective_end_date
            )
            subproject_project_income = self._monthly_budget_income(subproject, start_date, end_date)

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
    
    async def get_monthly_financial_summary(
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

        return await self.get_parent_project_financial_summary(
            parent_project_id,
            start_date,
            end_date
        )
    
    async def get_yearly_financial_summary(
        self,
        parent_project_id: int,
        year: int
    ) -> Dict[str, Any]:
        """Get financial summary for a specific year"""
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)

        return await self.get_parent_project_financial_summary(
            parent_project_id,
            start_date,
            end_date
        )
    
    async def get_custom_range_financial_summary(
        self,
        parent_project_id: int,
        start_date: date,
        end_date: date
    ) -> Dict[str, Any]:
        """Get financial summary for a custom date range"""
        return await self.get_parent_project_financial_summary(
            parent_project_id,
            start_date,
            end_date
        )
    
    async def get_subproject_performance_comparison(
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
        summary = await self.get_parent_project_financial_summary(
            parent_project_id,
            start_date,
            end_date
        )
        
        subprojects = summary['subproject_financials']
        
        # Sort by profit margin (descending)
        subprojects.sort(key=lambda x: x['profit_margin'], reverse=True)
        
        return subprojects
    
    async def get_financial_trends(
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
            yearly_summary = await self.get_yearly_financial_summary(
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
