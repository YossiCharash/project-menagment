from datetime import date, timedelta, datetime
from typing import Dict, List, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.repositories.contract_period_repository import ContractPeriodRepository
from backend.repositories.project_repository import ProjectRepository
from backend.repositories.transaction_repository import TransactionRepository
from backend.repositories.budget_repository import BudgetRepository
from backend.models.contract_period import ContractPeriod
from backend.models.project import Project
from backend.models.archived_contract import ArchivedContract
from backend.models.transaction import Transaction

class ContractPeriodService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.contract_periods = ContractPeriodRepository(db)
        self.projects = ProjectRepository(db)
        self.transactions = TransactionRepository(db)
        self.budgets = BudgetRepository(db)

    async def get_current_contract_period(self, project_id: int) -> Optional[Dict[str, Any]]:
        """Get the current active contract period for a project"""
        # Hebrew letters for period labeling
        hebrew_letters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י']
        
        # Get project to identify current active dates
        project = await self.projects.get_by_id(project_id)
        if not project or not project.start_date:
            return None
        
        # Find the period that matches the project's current start_date (active period)
        periods = await self.contract_periods.get_by_project(project_id)
        
        # Count periods in the same year as the current period to decide on labeling
        current_period = None
        for period in periods:
            if period.start_date == project.start_date:
                current_period = period
                break
        
        if current_period:
            # Count how many periods exist in the same year
            periods_in_year = [p for p in periods if p.contract_year == current_period.contract_year]
            show_period_label = len(periods_in_year) > 1
            
            summary = await self._get_period_financials(current_period)
            # Ensure start_date is before end_date
            start_date = current_period.start_date
            end_date = current_period.end_date
            if end_date and start_date > end_date:
                start_date, end_date = end_date, start_date
            
            # Determine year_label: only show if multiple periods in the same year
            if show_period_label:
                # Find this period's index among periods in the same year
                periods_in_year.sort(key=lambda p: p.start_date)
                idx = next((i for i, p in enumerate(periods_in_year) if p.id == current_period.id), 0)
                letter = hebrew_letters[idx] if idx < len(hebrew_letters) else str(idx + 1)
                year_label = f"תקופה {letter}"
            else:
                year_label = ""  # No label for single period per year
            
            return {
                'period_id': current_period.id,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat() if end_date else None,
                'contract_year': current_period.contract_year,
                'year_index': current_period.year_index,
                'year_label': year_label,
                'total_income': summary['total_income'],
                'total_expense': summary['total_expense'],
                'total_profit': summary['total_profit']
            }
        
        # If no matching period found, return project dates as fallback
        # Ensure start_date is before end_date
        start_date = project.start_date
        end_date = project.end_date if project.end_date else None
        
        # Swap dates if they're in wrong order
        if end_date and start_date > end_date:
            start_date, end_date = end_date, start_date
        
        # Calculate financial summary for the current period (using project dates)
        # Create a temporary period object to use with _get_period_financials
        from datetime import date
        temp_period = ContractPeriod(
            project_id=project_id,
            start_date=start_date,
            end_date=end_date if end_date else date.today(),
            contract_year=start_date.year,
            year_index=1
        )
        summary = await self._get_period_financials(temp_period)
        
        # For fallback (no period in DB), check if there are any periods in the same year
        periods_in_year = [p for p in periods if p.contract_year == start_date.year]
        show_period_label = len(periods_in_year) > 0  # Show label if other periods exist
        
        return {
            'period_id': None,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat() if end_date else None,
            'contract_year': start_date.year,
            'year_index': 1,
            'year_label': "תקופה א" if show_period_label else "",
            'total_income': summary['total_income'],
            'total_expense': summary['total_expense'],
            'total_profit': summary['total_profit']
        }

    async def get_previous_contracts_by_year(self, project_id: int) -> Dict[int, List[Dict[str, Any]]]:
        """Get all contract periods grouped by year, with deduplication"""
        # Hebrew letters for period labeling (א, ב, ג, ד, ה, ו, ז, ח, ט, י)
        hebrew_letters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י']
        
        # Get all periods ordered by year and index
        periods = await self.contract_periods.get_by_project(project_id)
        
        # Get project to identify current active dates
        project = await self.projects.get_by_id(project_id)
        active_start = project.start_date if project else None
        
        # First, identify the current period ID to exclude it
        current_period_id = None
        for period in periods:
            if active_start and period.start_date == active_start:
                current_period_id = period.id
                break
        
        # Deduplicate periods: 
        # 1. Use (start_date, end_date) as unique key to prevent duplicate rows with different IDs or indexes
        # 2. Exclude the current active period (matches project start_date OR has the same period_id)
        unique_periods = {}
        for period in periods:
            # Skip if this is the active period (start_date matches project's current start_date OR same period_id)
            # "Previous" contracts should not include the current one
            if (active_start and period.start_date == active_start) or (current_period_id and period.id == current_period_id):
                continue
                
            # Use (start_date, end_date) as unique key
            # If multiple periods have same dates but different indexes (due to bugs), treat as duplicate
            period_key = (period.start_date, period.end_date)
            
            # If we haven't seen this date range, or this period has a higher ID (newer), keep it
            if period_key not in unique_periods or period.id > unique_periods[period_key].id:
                unique_periods[period_key] = period
        
        # First pass: Group periods by year to count how many periods exist per year
        periods_by_year = {}
        for period in unique_periods.values():
            year = period.contract_year
            if year not in periods_by_year:
                periods_by_year[year] = []
            periods_by_year[year].append(period)
        
        result = {}
        for year, year_periods in periods_by_year.items():
            result[year] = []
            # Sort periods by year_index for consistent ordering
            year_periods.sort(key=lambda p: p.year_index)
            
            # Determine if we need period labels (only if >1 period in this year)
            show_period_labels = len(year_periods) > 1
            
            for idx, period in enumerate(year_periods):
                # Calculate summary for this period
                summary = await self._get_period_financials(period)
                
                # Ensure start_date is before end_date
                start_date = period.start_date
                end_date = period.end_date
                if end_date and start_date > end_date:
                    start_date, end_date = end_date, start_date
                
                # Determine year_label: only show if multiple periods in the same year
                if show_period_labels:
                    letter = hebrew_letters[idx] if idx < len(hebrew_letters) else str(idx + 1)
                    year_label = f"תקופה {letter}"
                else:
                    year_label = ""  # No label for single period per year
                
                result[year].append({
                    'period_id': period.id,
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat() if end_date else None,
                    'year_index': period.year_index,
                    'year_label': year_label,
                    'total_income': summary['total_income'],
                    'total_expense': summary['total_expense'],
                    'total_profit': summary['total_profit']
                })
            
        return result

    async def _get_period_financials(self, period: ContractPeriod) -> Dict[str, float]:
        """Calculate financial summary for a period"""
        from sqlalchemy import select, and_, func, or_
        from backend.models.transaction import Transaction
        
        start_date = period.start_date
        end_date = period.end_date
        project_id = period.project_id
        
        # Ensure dates are in correct order
        if end_date and start_date > end_date:
            start_date, end_date = end_date, start_date
        
        # Calculate income - regular transactions + period transactions (proportional)
        # 1. Regular income transactions
        income_regular_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Income",
                Transaction.from_fund == False,
                Transaction.tx_date >= start_date,
                Transaction.tx_date <= end_date,
                or_(
                    Transaction.period_start_date.is_(None),
                    Transaction.period_end_date.is_(None)
                )
            )
        )
        regular_income = float((await self.db.execute(income_regular_query)).scalar_one())
        
        # 2. Period income transactions (proportional split)
        income_period_query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Income",
                Transaction.from_fund == False,
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                Transaction.period_start_date <= end_date,
                Transaction.period_end_date >= start_date
            )
        )
        period_income_txs = (await self.db.execute(income_period_query)).scalars().all()
        
        period_income = 0.0
        for tx in period_income_txs:
            total_days = (tx.period_end_date - tx.period_start_date).days + 1
            if total_days <= 0:
                continue
            
            daily_rate = float(tx.amount) / total_days
            overlap_start = max(tx.period_start_date, start_date)
            overlap_end = min(tx.period_end_date, end_date)
            overlap_days = (overlap_end - overlap_start).days + 1
            
            if overlap_days > 0:
                period_income += daily_rate * overlap_days
        
        total_income = regular_income + period_income
        
        # Calculate expenses - regular transactions + period transactions (proportional)
        # 1. Regular expense transactions
        expense_regular_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Expense",
                Transaction.from_fund == False,
                Transaction.tx_date >= start_date,
                Transaction.tx_date <= end_date,
                or_(
                    Transaction.period_start_date.is_(None),
                    Transaction.period_end_date.is_(None)
                )
            )
        )
        regular_expense = float((await self.db.execute(expense_regular_query)).scalar_one())
        
        # 2. Period expense transactions (proportional split)
        expense_period_query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Expense",
                Transaction.from_fund == False,
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                Transaction.period_start_date <= end_date,
                Transaction.period_end_date >= start_date
            )
        )
        period_expense_txs = (await self.db.execute(expense_period_query)).scalars().all()
        
        period_expense = 0.0
        for tx in period_expense_txs:
            total_days = (tx.period_end_date - tx.period_start_date).days + 1
            if total_days <= 0:
                continue
            
            daily_rate = float(tx.amount) / total_days
            overlap_start = max(tx.period_start_date, start_date)
            overlap_end = min(tx.period_end_date, end_date)
            overlap_days = (overlap_end - overlap_start).days + 1
            
            if overlap_days > 0:
                period_expense += daily_rate * overlap_days
        
        total_expense = regular_expense + period_expense
        total_profit = total_income - total_expense
        
        return {
            'total_income': total_income,
            'total_expense': total_expense,
            'total_profit': total_profit
        }

    async def get_contract_period_summary(self, period_id: int) -> Optional[Dict[str, Any]]:
        """Get detailed summary for a contract period including transactions and budgets"""
        # Hebrew letters for period labeling
        hebrew_letters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י']
        
        period = await self.contract_periods.get_by_id(period_id)
        if not period:
            return None
            
        summary = await self._get_period_financials(period)
        
        # Ensure start_date is before end_date
        start_date = period.start_date
        end_date = period.end_date
        if end_date and start_date > end_date:
            start_date, end_date = end_date, start_date
        
        # Count periods in the same year to decide on labeling
        periods = await self.contract_periods.get_by_project(period.project_id)
        periods_in_year = [p for p in periods if p.contract_year == period.contract_year]
        show_period_label = len(periods_in_year) > 1
        
        # Determine year_label: only show if multiple periods in the same year
        if show_period_label:
            # Find this period's index among periods in the same year
            periods_in_year.sort(key=lambda p: p.start_date)
            idx = next((i for i, p in enumerate(periods_in_year) if p.id == period.id), 0)
            letter = hebrew_letters[idx] if idx < len(hebrew_letters) else str(idx + 1)
            year_label = f"תקופה {letter}"
        else:
            year_label = ""  # No label for single period per year
        
        # Fetch transactions for this period
        from sqlalchemy import and_, or_
        transactions_query = select(Transaction).where(
            and_(
                Transaction.project_id == period.project_id,
                Transaction.from_fund == False,
                or_(
                    # Regular transactions within date range
                    and_(
                        Transaction.tx_date >= start_date,
                        Transaction.tx_date <= end_date,
                        or_(
                            Transaction.period_start_date.is_(None),
                            Transaction.period_end_date.is_(None)
                        )
                    ),
                    # Period transactions that overlap with the period
                    and_(
                        Transaction.period_start_date.is_not(None),
                        Transaction.period_end_date.is_not(None),
                        Transaction.period_start_date <= end_date,
                        Transaction.period_end_date >= start_date
                    )
                )
            )
        ).order_by(Transaction.tx_date.desc())
        
        transactions_result = await self.db.execute(transactions_query)
        transactions_list = []
        for tx in transactions_result.scalars().all():
            transactions_list.append({
                'id': tx.id,
                'tx_date': tx.tx_date.isoformat(),
                'type': tx.type,
                'amount': float(tx.amount),
                'description': tx.description,
                'category': tx.category.name if tx.category else None,
                'payment_method': tx.payment_method,
                'notes': tx.notes,
                'supplier_id': tx.supplier_id
            })
        
        # Fetch budgets for this project
        budgets_list = await self.budgets.get_active_budgets_for_project(period.project_id)
        budgets_data = []
        for budget in budgets_list:
            budgets_data.append({
                'category': budget.category,
                'amount': float(budget.amount),
                'period_type': budget.period_type,
                'start_date': budget.start_date.isoformat() if budget.start_date else None,
                'end_date': budget.end_date.isoformat() if budget.end_date else None,
                'is_active': budget.is_active
            })
        
        return {
            'period_id': period.id,
            'project_id': period.project_id,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat() if end_date else None,
            'contract_year': period.contract_year,
            'year_index': period.year_index,
            'year_label': year_label,
            'transactions': transactions_list,
            'budgets': budgets_data,
            **summary
        }

    async def check_and_renew_contract(self, project_id: int) -> Optional[ContractPeriod]:
        """
        Check if contract has ended and automatically create a new period.
        Returns the new period if created, None otherwise.
        """
        # Get the project
        project = await self.projects.get_by_id(project_id)
        if not project or not project.end_date:
            return None
        
        # Check if contract end date has passed
        today = date.today()
        if project.end_date > today:
            # Contract hasn't ended yet
            return None
        
        # Contract has ended - close it and create new period
        # Calculate the start date for the new period (day after current end_date)
        new_period_start = project.end_date + timedelta(days=1)
        
        # Check if a period for this date already exists (avoid duplicates)
        existing_periods = await self.contract_periods.get_by_project(project_id)
        for period in existing_periods:
            if period.start_date == new_period_start:
                # Period already exists for this date
                return None
        
        try:
            # Close the current period and create a new one
            # Note: We use a default user_id (1) for auto-renewal, but this could be improved
            new_period = await self.close_year_manually(
                project_id=project_id,
                end_date=new_period_start,  # This becomes the start of the new period
                archived_by_user_id=1  # System user for auto-renewal
            )
            return new_period
        except Exception as e:
            # Log error but don't fail - maybe period was already closed
            print(f"Error auto-renewing contract for project {project_id}: {e}")
            return None

    async def update_period_dates(
        self,
        period_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Optional[ContractPeriod]:
        """Update dates for a contract period"""
        period = await self.contract_periods.get_by_id(period_id)
        if not period:
            return None
            
        if start_date:
            period.start_date = start_date
        if end_date:
            period.end_date = end_date
            
        # Update contract_year if end_date changed
        if end_date:
            period.contract_year = end_date.year
            
        self.db.add(period)
        await self.db.commit()
        await self.db.refresh(period)
        
        # Check if we need to update the project dates
        # If this is the active period (most recent), update project dates too
        # We find the most recent period by start_date
        all_periods = await self.contract_periods.get_by_project(period.project_id)
        latest_period = max(all_periods, key=lambda p: p.start_date) if all_periods else None
        
        if latest_period and latest_period.id == period.id:
             project = await self.projects.get_by_id(period.project_id)
             if project:
                 if start_date:
                     project.start_date = start_date
                 if end_date:
                     project.end_date = end_date
                 await self.projects.update(project)
             
        return period

    async def close_year_manually(
        self,
        project_id: int,
        end_date: date,
        archived_by_user_id: int
    ) -> ContractPeriod:
        """
        Close a contract year manually and create a new period.
        This archives the current period and starts a new one.
        Includes duplicate prevention checks.
        
        NOTE: 'end_date' parameter is treated as the START DATE of the NEW period.
        The current period will end on 'end_date - 1 day'.
        """
        # Get the project
        project = await self.projects.get_by_id(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        
        # Calculate the end date for the closing period (one day before the new start date)
        # The input 'end_date' is treated as the split point (start of new period)
        closing_period_end_date = end_date - timedelta(days=1)
        
        # Get all existing periods for this project
        existing_periods = await self.contract_periods.get_by_project(project_id)
        
        # Find the current/active period (the one that hasn't ended yet or is the most recent)
        current_period = None
        if existing_periods:
            # Find period that contains or ends at closing_period_end_date, or the most recent one
            for period in sorted(existing_periods, key=lambda p: p.end_date, reverse=True):
                if period.end_date >= closing_period_end_date or (period.start_date <= closing_period_end_date <= period.end_date):
                    current_period = period
                    break
            
            # If no period contains closing_period_end_date, use the most recent one
            if not current_period:
                current_period = max(existing_periods, key=lambda p: p.end_date)
        
        # If no period exists, create the first one from project start_date to closing_period_end_date
        if not current_period:
            start_date = project.start_date if project.start_date else date.today()
            if start_date > closing_period_end_date:
                raise ValueError("Start date cannot be after end date")
            
            # Check if a period with these exact dates already exists
            existing = await self.contract_periods.get_by_exact_dates(project_id, start_date, closing_period_end_date)
            if existing:
                raise ValueError(f"Contract period with dates {start_date} to {closing_period_end_date} already exists")
            
            # Create first period
            current_period = ContractPeriod(
                project_id=project_id,
                start_date=start_date,
                end_date=closing_period_end_date,
                contract_year=closing_period_end_date.year,
                year_index=1
            )
            await self.contract_periods.create(current_period)
        else:
            # Update the current period's end_date if needed
            if current_period.end_date != closing_period_end_date:
                # Check if a period with these exact dates already exists (avoid duplicates)
                existing = await self.contract_periods.get_by_exact_dates(
                    project_id, 
                    current_period.start_date, 
                    closing_period_end_date
                )
                if existing and existing.id != current_period.id:
                    raise ValueError(f"Contract period with dates {current_period.start_date} to {closing_period_end_date} already exists")
                
                current_period.end_date = closing_period_end_date
                current_period.contract_year = closing_period_end_date.year
                await self.contract_periods.update(current_period)
        
        # Calculate financial summary for the period being closed
        summary = await self._get_period_financials(current_period)
        
        # Check if this period is already archived (prevent duplicate archives and duplicate period creation)
        result = await self.db.execute(
            select(ArchivedContract).where(
                ArchivedContract.contract_period_id == current_period.id
            )
        )
        existing_archive = result.scalar_one_or_none()
        
        # Calculate next period details
        # The next period starts exactly on the provided end_date (the split point)
        next_start_date = end_date
        
        # Check if a period starting on or before next_start_date already exists
        # This prevents creating duplicate periods
        all_periods = await self.contract_periods.get_by_project(project_id)
        next_period = None
        for period in all_periods:
            # If a period starts on the same date or overlaps with next_start_date, it's a duplicate
            if period.start_date == next_start_date:
                # Period with this start date already exists
                next_period = period
                break
            # If a period contains next_start_date, it's overlapping
            if period.start_date <= next_start_date <= period.end_date:
                # Overlapping period exists
                next_period = period
                break
        
        # If period is already archived AND next period already exists, this is a duplicate close operation
        if existing_archive and next_period:
            # Year was already closed and next period already exists, return the existing next period
            return next_period
        
        if not existing_archive:
            # Create archive entry
            archived = ArchivedContract(
                contract_period_id=current_period.id,
                project_id=project_id,
                start_date=current_period.start_date,
                end_date=current_period.end_date,
                contract_year=current_period.contract_year,
                year_index=current_period.year_index,
                total_income=summary['total_income'],
                total_expense=summary['total_expense'],
                total_profit=summary['total_profit'],
                archived_by_user_id=archived_by_user_id
            )
            self.db.add(archived)
            await self.db.commit()
        
        # If next period already exists, return it instead of creating duplicate
        if next_period:
            return next_period
        
        # Determine next year and year_index
        next_year = next_start_date.year
        periods_in_next_year = await self.contract_periods.get_by_project_and_year(project_id, next_year)
        next_year_index = len(periods_in_next_year) + 1
        
        # Create new period for next year
        new_period = ContractPeriod(
            project_id=project_id,
            start_date=next_start_date,
            end_date=next_start_date + timedelta(days=364),  # Default 1 year, can be updated
            contract_year=next_year,
            year_index=next_year_index
        )
        
        new_period = await self.contract_periods.create(new_period)
        
        # Update project dates to reflect new period (this makes the new period the "current" one)
        # The old period will automatically be excluded from "previous periods" because its
        # start_date no longer matches project.start_date
        project.start_date = next_start_date
        project.end_date = new_period.end_date  # Always update end_date to match new period
        await self.projects.update(project)
        
        return new_period
