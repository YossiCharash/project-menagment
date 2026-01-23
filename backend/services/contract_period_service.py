from datetime import date, timedelta, datetime
from dateutil.relativedelta import relativedelta
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
    
    def _normalize_period_end_date(self, start_date: date, end_date: date) -> date:
        """
        Normalize period end_date according to business rules.
        
        IMPORTANT: end_date is EXCLUSIVE - it's the first day of the NEXT contract period.
        So if a contract covers 1.1.2026 to 31.12.2026, end_date should be 1.1.2027.
        
        Rules:
        - Respect the user-defined end_date even if it spans across years.
        - The logic of splitting by calendar year (1st Jan) is removed per user request.
        """
        # User defined dates should be respected as is.
        return end_date

    async def fix_period_dates_if_needed(self, project_id: int) -> None:
        """
        Fix contract periods that have incorrect start dates (one day before project.start_date).
        This fixes the timezone issue where periods were created with dates one day earlier.
        
        If project has contract_duration_months, it will regenerate all periods correctly.
        Otherwise, it will fix the first period to match project.start_date.
        """
        project = await self.projects.get_by_id(project_id)
        if not project:
            return
        
        # Store project attributes in local variables to avoid lazy loading issues
        # when running in asyncio.gather
        project_start_date = project.start_date
        project_contract_duration_months = project.contract_duration_months
        
        if not project_start_date:
            return
        
        periods = await self.contract_periods.get_by_project(project_id)
        if not periods:
            return
        
        from datetime import timedelta
        
        # Sort periods by start_date to find the first one
        periods.sort(key=lambda p: p.start_date)
        first_period = periods[0] if periods else None
        
        if not first_period or not first_period.start_date:
            return
        
        # Check if the first period starts one day before project.start_date
        # This indicates a timezone issue that needs to be fixed
        if first_period.start_date == project_start_date - timedelta(days=1):
            print(f"🔧 [FIX PERIOD] Found timezone issue: period {first_period.id} starts {first_period.start_date}, project starts {project_start_date}")
            
            # If project has contract_duration_months, fix all periods by shifting them forward by 1 day
            if project_contract_duration_months:
                print(f"🔧 [FIX PERIOD] Project has duration_months={project_contract_duration_months}, fixing all periods by shifting dates forward by 1 day...")
                
                # Fix all periods by shifting start_date and end_date forward by 1 day
                for period in periods:
                    if period.start_date and period.end_date:
                        old_start = period.start_date
                        old_end = period.end_date
                        period.start_date = old_start + timedelta(days=1)
                        period.end_date = old_end + timedelta(days=1)
                        period.contract_year = period.start_date.year
                        await self.contract_periods.update(period)
                        print(f"  ✓ Fixed period {period.id}: {old_start}->{period.start_date}, {old_end}->{period.end_date}")
                
                await self.db.commit()
                
                # Also update project.start_date and project.end_date to match the first period
                if periods:
                    first_period = periods[0]
                    project.start_date = first_period.start_date
                    if first_period.end_date:
                        project.end_date = first_period.end_date
                    await self.projects.update(project)
                    await self.db.commit()
                
                print(f"✓ [FIX PERIOD] Fixed all {len(periods)} periods for project {project_id}")
            else:
                # Legacy projects: just fix the first period
                print(f"🔧 [FIX PERIOD] Fixing first period {first_period.id} for project {project_id}: {first_period.start_date} -> {project_start_date}")
                old_start = first_period.start_date
                first_period.start_date = project_start_date
                
                # Also update end_date to maintain the same duration
                if first_period.end_date:
                    duration_days = (first_period.end_date - old_start).days
                    first_period.end_date = project_start_date + timedelta(days=duration_days)
                
                # Update contract_year if needed
                first_period.contract_year = project_start_date.year
                
                await self.contract_periods.update(first_period)
                await self.db.commit()
                print(f"✓ [FIX PERIOD] Fixed period {first_period.id}: start_date={first_period.start_date}, end_date={first_period.end_date}")

    async def get_current_contract_period(self, project_id: int) -> Optional[Dict[str, Any]]:
        """Get the current active contract period for a project"""
        # Hebrew letters for period labeling
        hebrew_letters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י']
        
        # Get project to identify current active dates
        project = await self.projects.get_by_id(project_id)
        if not project or not project.start_date:
            return None
        
        # Fix periods with incorrect dates before checking
        await self.fix_period_dates_if_needed(project_id)
        
        # Refresh project after potential fixes
        await self.db.refresh(project)
        
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
            start_date = current_period.start_date
            end_date = current_period.end_date
            
            # Determine year_label: only show if multiple periods in the same year
            if show_period_label:
                # Find this period's index among periods in the same year
                periods_in_year.sort(key=lambda p: p.start_date)
                idx = next((i for i, p in enumerate(periods_in_year) if p.id == current_period.id), 0)
                letter = hebrew_letters[idx] if idx < len(hebrew_letters) else str(idx + 1)
                year_label = f"תקופה {letter}"
            else:
                year_label = ""  # No label for single period per year
            
            # Calculate contract year consistently with grouping logic
            # Always use the actual start_date year
            display_year = start_date.year if start_date else current_period.contract_year

            return {
                'period_id': current_period.id,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat() if end_date else None,
                'contract_year': display_year,
                'year_index': current_period.year_index,
                'year_label': year_label,
                'total_income': summary['total_income'],
                'total_expense': summary['total_expense'],
                'total_profit': summary['total_profit']
            }
        
        # If no matching period found, return project dates as fallback
        start_date = project.start_date
        end_date = project.end_date if project.end_date else None
        
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
        
        # Calculate contract year consistently with grouping logic
        # Always use the actual start_date year
        display_year = start_date.year if start_date else date.today().year

        return {
            'period_id': None,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat() if end_date else None,
            'contract_year': display_year,
            'year_index': 1,
            'year_label': "תקופה א" if show_period_label else "",
            'total_income': summary['total_income'],
            'total_expense': summary['total_expense'],
            'total_profit': summary['total_profit']
        }

    async def get_previous_contracts_by_year(self, project_id: int) -> Dict[int, List[Dict[str, Any]]]:
        """Get all contract periods grouped by year, with deduplication, excluding current active period"""
        # Hebrew letters for period labeling (א, ב, ג, ד, ה, ו, ז, ח, ט, י)
        hebrew_letters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י']
        
        # Get project to identify current active dates
        project = await self.projects.get_by_id(project_id)
        if not project:
            print(f"❌ [GET PREVIOUS CONTRACTS] Project {project_id} not found!")
            return {}
        
        # Fix periods with incorrect dates before checking
        await self.fix_period_dates_if_needed(project_id)
        
        # Refresh project after potential fixes
        await self.db.refresh(project)
        
        # Get all periods ordered by year and index
        periods = await self.contract_periods.get_by_project(project_id)
        
        # Debug: Print all periods to see what we have
        print(f"")
        print(f"=" * 80)
        print(f"🔍 [GET PREVIOUS CONTRACTS] Project {project_id}")
        print(f"   Project dates: start={project.start_date}, end={project.end_date}")
        print(f"   Duration months: {project.contract_duration_months}")
        print(f"   Total periods in DB: {len(periods)}")
        print(f"-" * 80)
        for p in periods:
            print(f"   Period ID={p.id}: {p.start_date} to {p.end_date}, contract_year={p.contract_year}, year_index={p.year_index}")
        print(f"=" * 80)
            
        active_start = project.start_date
        
        # If no periods exist, create a virtual one based on project dates
        if not periods and project.start_date:
            from backend.models.contract_period import ContractPeriod
            end_date = project.end_date if project.end_date else date.today()
            
            # Show the project's defined range as a single virtual period
            # instead of splitting by calendar year, per user request.
            periods = [ContractPeriod(
                id=-1,
                project_id=project_id,
                start_date=project.start_date,
                end_date=end_date,
                contract_year=project.start_date.year,
                year_index=1
            )]
        
        # Deduplicate periods and filter out the current active period
        # The current active period is the one with the latest start_date (most recent)
        unique_periods = {}
        excluded_count = 0
        
        # Find the current active period (the one with the latest start_date)
        current_active_period = None
        if periods:
            # Sort periods by start_date descending to find the most recent one
            sorted_periods = sorted(periods, key=lambda p: p.start_date, reverse=True)
            current_active_period = sorted_periods[0]
            print(f"🔍 [GET PREVIOUS CONTRACTS] Current active period: {current_active_period.id} ({current_active_period.start_date} to {current_active_period.end_date})")
        
        print(f"   Current active period ID: {current_active_period.id if current_active_period else 'None'}")
        print(f"-" * 80)
        
        for period in periods:
            # Exclude the current active period (the one with the latest start_date)
            if current_active_period and period.id == current_active_period.id:
                # This is the current active period - skip it
                excluded_count += 1
                print(f"   ⏭️ EXCLUDING period {period.id}: {period.start_date} to {period.end_date} (current active)")
                continue
            
            # Include all other periods (past periods that ended before current period started)
            # These are the historical/archived periods
            period_key = (period.start_date, period.end_date)
            if period_key not in unique_periods or period.id > unique_periods[period_key].id:
                unique_periods[period_key] = period
                print(f"   ✓ INCLUDING period {period.id}: {period.start_date} to {period.end_date}")
            else:
                print(f"   ⚠️ DUPLICATE period {period.id}: {period.start_date} to {period.end_date} (already have period with same dates)")
        
        print(f"-" * 80)
        print(f"   SUMMARY: {len(periods)} total, {excluded_count} excluded (current), {len(unique_periods)} included (previous)")
        print(f"=" * 80)
        print(f"")
        
        # First pass: Group periods by year
        periods_by_year = {}
        for period in unique_periods.values():
            # Use start_date year for grouping as it represents the year the contract period belongs to
            # Always use the actual start_date year, not contract_year which might be incorrect
            if period.start_date:
                year = period.start_date.year
            else:
                # Fallback to contract_year only if start_date is missing
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
                
                start_date = period.start_date
                end_date = period.end_date
                
                # Determine year_label
                if show_period_labels:
                    letter = hebrew_letters[idx] if idx < len(hebrew_letters) else str(idx + 1)
                    year_label = f"תקופה {letter}"
                else:
                    year_label = ""
                
                result[year].append({
                    'period_id': period.id if period.id > 0 else None, # None for virtual
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
        """Calculate financial summary for a period
        
        IMPORTANT: Date range is [start_date, end_date) - start is inclusive, end is EXCLUSIVE.
        This means transactions on end_date belong to the NEXT contract period.
        The last day of this contract is end_date - 1.
        """
        from sqlalchemy import select, and_, func, or_
        from backend.models.transaction import Transaction
        
        start_date = period.start_date
        end_date = period.end_date
        project_id = period.project_id
        
        # Calculate the actual last day of the contract (exclusive end_date means last day is end_date - 1)
        actual_end_date = end_date - timedelta(days=1) if end_date else end_date
        
        # Calculate income - regular transactions + period transactions (proportional)
        # 1. Regular income transactions
        # Date range: [start_date, end_date) - start inclusive, end exclusive
        income_regular_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Income",
                Transaction.from_fund == False,
                Transaction.tx_date >= start_date,
                Transaction.tx_date < end_date,  # EXCLUSIVE end date - transactions on end_date belong to next contract
                or_(
                    Transaction.period_start_date.is_(None),
                    Transaction.period_end_date.is_(None)
                )
            )
        )
        regular_income = float((await self.db.execute(income_regular_query)).scalar_one())
        
        # 2. Period income transactions (proportional split)
        # For overlap calculation, we use actual_end_date (the last day of this contract)
        income_period_query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Income",
                Transaction.from_fund == False,
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                Transaction.period_start_date < end_date,  # Period starts before our end
                Transaction.period_end_date >= start_date   # Period ends on or after our start
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
            # Use actual_end_date for overlap calculation (last day of contract)
            overlap_end = min(tx.period_end_date, actual_end_date) if actual_end_date else tx.period_end_date
            overlap_days = (overlap_end - overlap_start).days + 1
            
            if overlap_days > 0:
                period_income += daily_rate * overlap_days
        
        total_income = regular_income + period_income
        
        # Calculate expenses - regular transactions + period transactions (proportional)
        # 1. Regular expense transactions
        # Date range: [start_date, end_date) - start inclusive, end exclusive
        expense_regular_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Expense",
                Transaction.from_fund == False,
                Transaction.tx_date >= start_date,
                Transaction.tx_date < end_date,  # EXCLUSIVE end date - transactions on end_date belong to next contract
                or_(
                    Transaction.period_start_date.is_(None),
                    Transaction.period_end_date.is_(None)
                )
            )
        )
        regular_expense = float((await self.db.execute(expense_regular_query)).scalar_one())
        
        # 2. Period expense transactions (proportional split)
        # For overlap calculation, we use actual_end_date (the last day of this contract)
        expense_period_query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.type == "Expense",
                Transaction.from_fund == False,
                Transaction.period_start_date.is_not(None),
                Transaction.period_end_date.is_not(None),
                Transaction.period_start_date < end_date,  # Period starts before our end
                Transaction.period_end_date >= start_date   # Period ends on or after our start
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
            # Use actual_end_date for overlap calculation (last day of contract)
            overlap_end = min(tx.period_end_date, actual_end_date) if actual_end_date else tx.period_end_date
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

    async def get_contract_period_summary(
        self, 
        period_id: Optional[int] = None, 
        project_id: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Optional[Dict[str, Any]]:
        """Get detailed summary for a contract period including transactions and budgets"""
        # Hebrew letters for period labeling
        hebrew_letters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י']
        
        period = None
        if period_id:
            period = await self.contract_periods.get_by_id(period_id)
            if not period:
                return None
            project_id = period.project_id
            start_date = period.start_date
            end_date = period.end_date
            # Calculate contract year consistently with grouping logic
            # Always use the actual start_date year
            contract_year = start_date.year if start_date else period.contract_year
            year_index = period.year_index
        else:
            if not project_id or not start_date:
                return None
            if not end_date:
                end_date = date.today()
            contract_year = start_date.year
            year_index = 1
            
        # Create a temporary period object for internal calculations if needed
        from backend.models.contract_period import ContractPeriod
        calc_period = period if period else ContractPeriod(
            project_id=project_id,
            start_date=start_date,
            end_date=end_date,
            contract_year=contract_year,
            year_index=year_index
        )
            
        summary = await self._get_period_financials(calc_period)
        
        # Count periods in the same year to decide on labeling
        periods = await self.contract_periods.get_by_project(project_id)
        periods_in_year = [p for p in periods if p.contract_year == contract_year]
        show_period_label = len(periods_in_year) > 1
        
        # Determine year_label
        if show_period_label and period:
            # Find this period's index among periods in the same year
            periods_in_year.sort(key=lambda p: p.start_date)
            idx = next((i for i, p in enumerate(periods_in_year) if p.id == period.id), 0)
            letter = hebrew_letters[idx] if idx < len(hebrew_letters) else str(idx + 1)
            year_label = f"תקופה {letter}"
        else:
            year_label = ""
        
        # Fetch transactions for this period (excluding fund transactions)
        # IMPORTANT: end_date is EXCLUSIVE - transactions on end_date belong to the NEXT contract
        from sqlalchemy import and_, or_
        transactions_query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.from_fund == False,
                or_(
                    # Regular transactions within date range [start_date, end_date)
                    and_(
                        Transaction.tx_date >= start_date,
                        Transaction.tx_date < end_date,  # EXCLUSIVE end_date
                        or_(
                            Transaction.period_start_date.is_(None),
                            Transaction.period_end_date.is_(None)
                        )
                    ),
                    # Period transactions that overlap with the period
                    and_(
                        Transaction.period_start_date.is_not(None),
                        Transaction.period_end_date.is_not(None),
                        Transaction.period_start_date < end_date,  # Period starts before our end
                        Transaction.period_end_date >= start_date   # Period ends on or after our start
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

        # Fetch fund transactions for this period
        # IMPORTANT: end_date is EXCLUSIVE - transactions on end_date belong to the NEXT contract
        fund_transactions_query = select(Transaction).where(
            and_(
                Transaction.project_id == project_id,
                Transaction.from_fund == True,
                Transaction.tx_date >= start_date,
                Transaction.tx_date < end_date  # EXCLUSIVE end_date
            )
        ).order_by(Transaction.tx_date.desc())
        
        fund_transactions_result = await self.db.execute(fund_transactions_query)
        fund_transactions_list = []
        for tx in fund_transactions_result.scalars().all():
            fund_transactions_list.append({
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
        
        # Fetch budgets for this period (each contract displays its own budgets)
        period_budget_filter = period.id if period and getattr(period, "id", None) else None
        budgets_list = await self.budgets.get_active_budgets_for_project(
            project_id, contract_period_id=period_budget_filter
        )
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
            'period_id': period.id if period else None,
            'project_id': project_id,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat() if end_date else None,
            'contract_year': contract_year,
            'year_index': year_index,
            'year_label': year_label,
            'transactions': transactions_list,
            'fund_transactions': fund_transactions_list,
            'budgets': budgets_data,
            **summary
        }

    async def check_and_renew_contract(self, project_id: int) -> Optional[ContractPeriod]:
        """
        Check if contract has ended and automatically create a new period.
        If the project uses duration_months, it will create periods based on that duration.
        Otherwise, it will create yearly periods (legacy behavior).
        If the project is far behind, it will create multiple periods 
        until it reaches the current date.
        
        IMPORTANT: Also handles legacy projects that have no periods at all by
        generating all historical periods retroactively.
        
        Returns the latest period created, or None if no renewal was needed.
        """
        # Get the project
        project = await self.projects.get_by_id(project_id)
        if not project:
            return None
        
        # Check if project has ANY periods in the database
        # If not, we need to generate all historical periods retroactively
        existing_periods = await self.contract_periods.get_by_project(project_id)
        
        print(f"")
        print(f"=" * 80)
        print(f"🔄 [CHECK AND RENEW] Project {project_id}")
        print(f"   Existing periods count: {len(existing_periods)}")
        print(f"   Project start_date: {project.start_date}")
        print(f"   Project end_date: {project.end_date}")
        print(f"   Contract duration months: {project.contract_duration_months}")
        if existing_periods:
            for p in existing_periods:
                print(f"   - Period {p.id}: {p.start_date} to {p.end_date}")
        print(f"=" * 80)
        
        if not existing_periods and project.start_date:
            # Legacy project with no periods - generate them retroactively
            print(f"🔧 [CONTRACT RENEWAL] Project {project_id} has no periods. Generating historical periods retroactively...")
            
            if project.contract_duration_months:
                # Use duration-based generation
                await self.generate_initial_periods_by_duration(
                    project_id=project_id,
                    start_date=project.start_date,
                    duration_months=project.contract_duration_months,
                    user_id=1
                )
            elif project.end_date:
                # Use legacy yearly generation
                await self.generate_initial_periods(
                    project_id=project_id,
                    start_date=project.start_date,
                    end_date=project.end_date,
                    user_id=1
                )
            
            # Refresh project after generating periods
            await self.db.refresh(project)
            print(f"✓ [CONTRACT RENEWAL] Generated historical periods for project {project_id}")
            
            # Return the most recent period created
            new_periods = await self.contract_periods.get_by_project(project_id)
            if new_periods:
                return max(new_periods, key=lambda p: p.start_date)
            return None
        
        # IMPORTANT: Check if there are gaps in historical periods
        # This handles cases where project has some periods but not the full history
        if existing_periods and project.contract_duration_months:
            # Find the earliest period
            earliest_period = min(existing_periods, key=lambda p: p.start_date)
            earliest_start = earliest_period.start_date
            
            print(f"   Earliest period starts at: {earliest_start}")
            
            # Calculate how many periods SHOULD exist based on duration
            # from the earliest period start date to today
            today = date.today()
            expected_period_count = 0
            check_date = earliest_start
            while check_date <= today:
                expected_period_count += 1
                check_date = check_date + relativedelta(months=project.contract_duration_months)
            
            actual_period_count = len(existing_periods)
            print(f"   Expected periods (from {earliest_start} to today): {expected_period_count}")
            print(f"   Actual periods: {actual_period_count}")
            
            # If we have fewer periods than expected, there's a gap
            # This could happen if periods were generated incorrectly
            if actual_period_count < expected_period_count:
                print(f"⚠️ [CONTRACT RENEWAL] Missing {expected_period_count - actual_period_count} periods! Will try to fill gaps...")
            
            # NEW: Check for transactions before the earliest period
            # If transactions exist before the earliest period, we need to generate historical periods
            from sqlalchemy import select, func
            from backend.models.transaction import Transaction
            
            earliest_tx_query = select(func.min(Transaction.tx_date)).where(
                Transaction.project_id == project_id
            )
            earliest_tx_result = await self.db.execute(earliest_tx_query)
            earliest_tx_date = earliest_tx_result.scalar_one_or_none()
            
            if earliest_tx_date:
                print(f"   Earliest transaction date: {earliest_tx_date}")
                
                # If the earliest transaction is BEFORE the earliest period, we need to generate more periods
                if earliest_tx_date < earliest_start:
                    print(f"🔧 [CONTRACT RENEWAL] Found transactions before earliest period! Generating missing historical periods...")
                    print(f"   Earliest tx: {earliest_tx_date}, Earliest period: {earliest_start}")
                    
                    # Calculate what the original start date should have been
                    # Round down to the nearest duration boundary before earliest_tx_date
                    original_start = earliest_tx_date
                    
                    # Adjust to the first day of the month for cleaner periods
                    original_start = date(original_start.year, original_start.month, 1)
                    
                    print(f"   Generating periods from {original_start} (adjusted from tx date {earliest_tx_date})")
                    
                    # Generate periods from original start to earliest existing period
                    await self._fill_historical_periods(
                        project_id=project_id,
                        original_start=original_start,
                        earliest_existing_period=earliest_period,
                        duration_months=project.contract_duration_months,
                        user_id=1
                    )
                    
                    # Refresh existing periods
                    existing_periods = await self.contract_periods.get_by_project(project_id)
                    print(f"✓ [CONTRACT RENEWAL] Now have {len(existing_periods)} periods")
        
        # If project uses duration_months, use duration-based renewal
        if project.contract_duration_months and project.start_date:
            return await self._renew_contract_by_duration(project_id, project)
        
        # Legacy: use end_date-based renewal
        if not project.end_date:
            return None
        
        today = date.today()
        latest_created_period = None
        
        # Track last processed end_date to ensure progress and avoid infinite loops
        last_processed_end_date = None
        
        # Loop to handle projects that are multiple years behind
        # Max 50 iterations for safety
        for i in range(50):
            # Check if contract end date has passed (exclusive)
            # If end_date is today or in the past, it means the period has ended
            if project.end_date > today:
                break
            
            # Prevent infinite loops if end_date doesn't advance
            if last_processed_end_date and project.end_date <= last_processed_end_date:
                print(f"⚠️ [CONTRACT RENEWAL] Stuck at {project.end_date} for project {project_id}. Advancing manually.")
                project.end_date = project.end_date + relativedelta(years=1)
                await self.projects.update(project)
                continue
                
            last_processed_end_date = project.end_date
                
            # Contract has ended - close it and create new period
            new_period_start = project.end_date
            
            # Check if a period for this date already exists (avoid duplicates)
            existing_periods = await self.contract_periods.get_by_project(project_id)
            is_duplicate = False
            for p in existing_periods:
                # If a period starts at our new start date and has a valid duration, it's a valid next period
                if p.start_date == new_period_start:
                    if p.end_date > p.start_date:
                        is_duplicate = True
                        # If it's a duplicate but we're still behind today,
                        # we update the project dates to match the existing period's dates
                        project.start_date = p.start_date
                        project.end_date = p.end_date
                        break
                    else:
                        print(f"⚠️ [CONTRACT RENEWAL] Found broken period record (ID={p.id}) for project {project_id} where end_date <= start_date. Skipping.")
            
            if is_duplicate:
                # Refresh project and continue loop to see if we're still behind today
                await self.projects.update(project)
                await self.db.commit()
                await self.db.refresh(project)
                continue

            try:
                # Close the current period and create a new one
                new_period = await self.close_year_manually(
                    project_id=project_id,
                    end_date=new_period_start,
                    archived_by_user_id=1
                )
                latest_created_period = new_period
                # Refresh project object for next iteration
                await self.db.commit()
                await self.db.refresh(project)
                
                # Double check progress - if close_year_manually didn't advance project.end_date, we must do it
                if project.end_date <= last_processed_end_date:
                    print(f"⚠️ [CONTRACT RENEWAL] close_year_manually didn't advance end_date for project {project_id}. Advancing manually.")
                    project.end_date = project.end_date + relativedelta(years=1)
                    await self.projects.update(project)
            except Exception as e:
                print(f"❌ [CONTRACT RENEWAL] Error auto-renewing contract for project {project_id}: {e}")
                # If we're stuck and can't close year, try to at least advance the project dates to prevent being stuck forever
                try:
                    project.end_date = project.end_date + relativedelta(years=1)
                    await self.projects.update(project)
                except:
                    pass
                break
                
        return latest_created_period

    async def _renew_contract_by_duration(self, project_id: int, project: Project) -> Optional[ContractPeriod]:
        """
        Renew contract periods based on duration_months.
        Creates new periods of the specified duration until reaching today or beyond.
        """
        if not project.contract_duration_months or not project.start_date:
            return None
        
        today = date.today()
        latest_created_period = None
        current_start = project.start_date
        duration_months = project.contract_duration_months
        
        # Track last processed start_date to ensure progress and avoid infinite loops
        last_processed_start_date = None
        
        # Loop to handle projects that are multiple periods behind
        # Max 200 iterations for safety (covers ~16 years for 3-month periods)
        for i in range(200):
            # Calculate end date for current period
            current_end = current_start + relativedelta(months=duration_months)
            
            # Check if current period has ended (exclusive end_date means period ends when end_date is reached)
            if current_end > today:
                # Current period is still active, no need to create new periods
                break
            
            # Prevent infinite loops if start_date doesn't advance
            if last_processed_start_date and current_start <= last_processed_start_date:
                print(f"⚠️ [CONTRACT RENEWAL BY DURATION] Stuck at {current_start} for project {project_id}. Advancing manually.")
                current_start = current_start + relativedelta(months=duration_months)
                continue
                
            last_processed_start_date = current_start
            
            # Check if a period for this date already exists (avoid duplicates)
            existing_periods = await self.contract_periods.get_by_project(project_id)
            is_duplicate = False
            for p in existing_periods:
                # If a period starts at our new start date and has a valid duration, it's a valid next period
                if p.start_date == current_start:
                    if p.end_date > p.start_date:
                        is_duplicate = True
                        # If it's a duplicate but we're still behind today,
                        # we update the project dates to match the existing period's dates
                        project.start_date = p.start_date
                        project.end_date = p.end_date
                        break
                    else:
                        print(f"⚠️ [CONTRACT RENEWAL BY DURATION] Found broken period record (ID={p.id}) for project {project_id} where end_date <= start_date. Skipping.")
            
            if is_duplicate:
                # Refresh project and continue loop to see if we're still behind today
                await self.projects.update(project)
                await self.db.commit()
                await self.db.refresh(project)
                current_start = project.end_date
                continue

            try:
                # Close the current period and create a new one
                # end_date parameter is the START of the NEW period (which is the END of the current period)
                new_period = await self.close_year_manually(
                    project_id=project_id,
                    end_date=current_end,
                    archived_by_user_id=1
                )
                latest_created_period = new_period
                
                # Refresh project object for next iteration
                await self.db.commit()
                await self.db.refresh(project)
                
                # Update project dates to match the new period
                project.start_date = new_period.start_date
                project.end_date = new_period.end_date
                await self.projects.update(project)
                
                # Move to next period
                current_start = new_period.end_date
                
            except Exception as e:
                print(f"❌ [CONTRACT RENEWAL BY DURATION] Error auto-renewing contract for project {project_id}: {e}")
                # If we're stuck and can't close year, try to at least advance the project dates
                try:
                    current_start = current_start + relativedelta(months=duration_months)
                    project.start_date = current_start
                    project.end_date = current_start + relativedelta(months=duration_months)
                    await self.projects.update(project)
                except:
                    pass
                break
                
        return latest_created_period

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
            # Normalize end_date according to business rules
            actual_start = start_date if start_date else period.start_date
            period.end_date = self._normalize_period_end_date(actual_start, end_date)
            
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

    async def _fill_historical_periods(
        self,
        project_id: int,
        original_start: date,
        earliest_existing_period: ContractPeriod,
        duration_months: int,
        user_id: int = 1
    ) -> int:
        """
        Fill in missing historical periods between original_start and earliest_existing_period.
        Returns the number of periods created.
        """
        from datetime import date as date_type
        
        periods_created = 0
        current_start = original_start
        
        # Generate periods until we reach the earliest existing period
        for _ in range(200):  # Safety limit
            current_end = current_start + relativedelta(months=duration_months)
            
            # Stop if we've reached or passed the earliest existing period
            if current_start >= earliest_existing_period.start_date:
                break
            
            # Check if a period with these dates already exists
            existing = await self.contract_periods.get_by_exact_dates(project_id, current_start, current_end)
            if existing:
                print(f"   Skipping existing period: {current_start} to {current_end}")
                current_start = current_end
                continue
            
            # Create the historical period
            contract_year = current_start.year
            periods_in_year = await self.contract_periods.get_by_project_and_year(project_id, contract_year)
            year_index = len(periods_in_year) + 1
            
            period = ContractPeriod(
                project_id=project_id,
                start_date=current_start,
                end_date=current_end,
                contract_year=contract_year,
                year_index=year_index
            )
            period = await self.contract_periods.create(period)
            periods_created += 1
            print(f"   Created historical period {period.id}: {current_start} to {current_end}")
            
            # Archive this historical period since it's in the past
            from backend.models.archived_contract import ArchivedContract
            summary = await self._get_period_financials(period)
            
            archived = ArchivedContract(
                contract_period_id=period.id,
                project_id=project_id,
                start_date=period.start_date,
                end_date=period.end_date,
                contract_year=period.contract_year,
                year_index=period.year_index,
                total_income=summary['total_income'],
                total_expense=summary['total_expense'],
                total_profit=summary['total_profit'],
                archived_by_user_id=user_id
            )
            self.db.add(archived)
            await self.db.commit()
            
            current_start = current_end
        
        print(f"   Created {periods_created} historical periods")
        return periods_created

    async def generate_initial_periods_by_duration(
        self, 
        project_id: int, 
        start_date: date, 
        duration_months: int, 
        user_id: int = 1
    ) -> None:
        """
        Generate a chain of contract periods starting from an old date using duration in months.
        If the initial start_date is in the past, it creates subsequent periods of the same duration
        until a period covering the current date is reached.
        All past periods are automatically archived.
        
        Example: If start_date is 2024-01-17 and duration_months is 3:
        - Period 1: 2024-01-17 to 2024-04-17
        - Period 2: 2024-04-17 to 2024-07-17
        - Period 3: 2024-07-17 to 2024-10-17 (if today is in this range, this is active)
        """
        from datetime import date as date_type
        # Ensure we are working with date objects
        if isinstance(start_date, str):
            start_date = date_type.fromisoformat(start_date)
            
        today = date_type.today()
        current_start = start_date
        
        # Loop until we reach a period that covers today or is in the future
        # Max 200 iterations to prevent any potential infinite loops (covers ~16 years)
        for _ in range(200):
            # Calculate end date by adding duration_months to current_start
            current_end = current_start + relativedelta(months=duration_months)
            
            # Create a new contract period
            contract_year = current_start.year
            # For year_index, we check how many periods already exist for this project in this year
            periods_in_year = await self.contract_periods.get_by_project_and_year(project_id, contract_year)
            year_index = len(periods_in_year) + 1
            
            period = ContractPeriod(
                project_id=project_id,
                start_date=current_start,
                end_date=current_end,
                contract_year=contract_year,
                year_index=year_index
            )
            
            # Save the period
            period = await self.contract_periods.create(period)
            
            # Copy budgets from previous period to this new period (automatic budget restart)
            from backend.services.budget_service import BudgetService
            budget_service = BudgetService(self.db)
            
            # Find the previous period (the one that ended just before this one started)
            previous_period_id = None
            if current_start > start_date:  # Not the first period
                # Find period that ends at current_start (exclusive end_date = start of next period)
                all_periods = await self.contract_periods.get_by_project(project_id)
                # Sort by start_date descending to find the most recent period before this one
                all_periods.sort(key=lambda p: p.start_date, reverse=True)
                for p in all_periods:
                    # Previous period's end_date should equal this period's start_date (exclusive)
                    # Also check if this period was just created (p.id != period.id)
                    if p.id != period.id and p.end_date == current_start:
                        previous_period_id = p.id
                        break
                
                # If not found by exact end_date match, find the most recent period before current_start
                if not previous_period_id:
                    for p in all_periods:
                        if p.id != period.id and p.end_date < current_start:
                            previous_period_id = p.id
                            break
            
            # Copy budgets: from previous period if exists, otherwise from project-level
            copied_count = await budget_service.copy_budgets_to_new_period(
                project_id=project_id,
                from_period_id=previous_period_id,
                to_period=period,
            )
            if copied_count == 0 and current_end > today:
                # Only warn for current period (not past periods)
                print(f"⚠️ [GENERATE PERIODS BY DURATION] No budgets copied to current period {period.id} for project {project_id} (from_period_id={previous_period_id})")
            
            # A period is in the past if its end_date (exclusive) is <= today
            if current_end <= today:
                summary = await self._get_period_financials(period)
                
                # Create archive entry
                archived = ArchivedContract(
                    contract_period_id=period.id,
                    project_id=project_id,
                    start_date=period.start_date,
                    end_date=period.end_date,
                    contract_year=period.contract_year,
                    year_index=period.year_index,
                    total_income=summary['total_income'],
                    total_expense=summary['total_expense'],
                    total_profit=summary['total_profit'],
                    archived_by_user_id=user_id
                )
                self.db.add(archived)
                await self.db.commit()
                
                # Prepare next period dates (add duration_months to current_end)
                current_start = current_end
            else:
                # This is the current active period
                # Update project dates to match this period - use direct SQL for reliability
                from sqlalchemy import update
                from backend.models.project import Project as ProjectModel
                await self.db.execute(
                    update(ProjectModel)
                    .where(ProjectModel.id == project_id)
                    .values(start_date=current_start, end_date=current_end)
                )
                await self.db.commit()
                break

    async def generate_initial_periods(self, project_id: int, start_date: date, end_date: date, user_id: int = 1) -> None:
        """
        Generate a chain of contract periods starting from an old date.
        If the initial range is in the past, it creates subsequent yearly periods
        until a period covering the current date is reached.
        All past periods are automatically archived.
        """
        from datetime import date as date_type
        # Ensure we are working with date objects
        if isinstance(start_date, str):
            start_date = date_type.fromisoformat(start_date)
        if isinstance(end_date, str):
            end_date = date_type.fromisoformat(end_date)
            
        today = date_type.today()
        current_start = start_date
        current_end = end_date
        
        # Loop until we reach a period that covers today or is in the future
        # Max 50 iterations to prevent any potential infinite loops
        for _ in range(50):
            # Create a new contract period
            contract_year = current_start.year
            # For year_index, we check how many periods already exist for this project in this year
            periods_in_year = await self.contract_periods.get_by_project_and_year(project_id, contract_year)
            year_index = len(periods_in_year) + 1
            
            period = ContractPeriod(
                project_id=project_id,
                start_date=current_start,
                end_date=current_end,
                contract_year=contract_year,
                year_index=year_index
            )
            
            # Save the period
            period = await self.contract_periods.create(period)
            
            # Copy budgets from previous period to this new period (automatic budget restart)
            # For the first period, copy from project-level budgets (contract_period_id=None)
            # For subsequent periods, copy from the previous period
            from backend.services.budget_service import BudgetService
            budget_service = BudgetService(self.db)
            
            # Find the previous period (the one that ended just before this one started)
            previous_period_id = None
            if current_start > start_date:  # Not the first period
                # Find period that ends at current_start (exclusive end_date = start of next period)
                all_periods = await self.contract_periods.get_by_project(project_id)
                # Sort by start_date descending to find the most recent period before this one
                all_periods.sort(key=lambda p: p.start_date, reverse=True)
                for p in all_periods:
                    # Previous period's end_date should equal this period's start_date (exclusive)
                    # Also check if this period was just created (p.id != period.id)
                    if p.id != period.id and p.end_date == current_start:
                        previous_period_id = p.id
                        break
                
                # If not found by exact end_date match, find the most recent period before current_start
                if not previous_period_id:
                    for p in all_periods:
                        if p.id != period.id and p.end_date < current_start:
                            previous_period_id = p.id
                            break
            
            # Copy budgets: from previous period if exists, otherwise from project-level
            copied_count = await budget_service.copy_budgets_to_new_period(
                project_id=project_id,
                from_period_id=previous_period_id,
                to_period=period,
            )
            if copied_count == 0 and current_end > today:
                # Only warn for current period (not past periods)
                print(f"⚠️ [GENERATE PERIODS] No budgets copied to current period {period.id} for project {project_id} (from_period_id={previous_period_id})")
            
            # A period is in the past if its end_date (exclusive) is <= today
            if current_end <= today:
                summary = await self._get_period_financials(period)
                
                # Create archive entry
                archived = ArchivedContract(
                    contract_period_id=period.id,
                    project_id=project_id,
                    start_date=period.start_date,
                    end_date=period.end_date,
                    contract_year=period.contract_year,
                    year_index=period.year_index,
                    total_income=summary['total_income'],
                    total_expense=summary['total_expense'],
                    total_profit=summary['total_profit'],
                    archived_by_user_id=user_id
                )
                self.db.add(archived)
                await self.db.commit()
                
                # Prepare next period dates (1 year from the previous end_date)
                current_start = current_end
                current_end = current_start + relativedelta(years=1)
            else:
                # This is the current active period
                # Update project dates to match this period - use direct SQL for reliability
                from sqlalchemy import update
                from backend.models.project import Project as ProjectModel
                await self.db.execute(
                    update(ProjectModel)
                    .where(ProjectModel.id == project_id)
                    .values(start_date=current_start, end_date=current_end)
                )
                await self.db.commit()
                break

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
        
        IMPORTANT: 'end_date' parameter is EXCLUSIVE - it's the START DATE of the NEW period.
        The current period covers [start_date, end_date) - transactions on end_date belong to the NEXT contract.
        The actual last day of the current contract is end_date - 1.
        
        Example: If end_date=1.1.2027, current contract covers until 31.12.2026, next starts at 1.1.2027.
        """
        # Get the project
        project = await self.projects.get_by_id(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        
        # end_date is the EXCLUSIVE end / start of new period
        # We store end_date directly (exclusive) for proper filtering with < end_date
        closing_period_end_date = end_date  # Store exclusive end_date directly
        
        # Get all existing periods for this project
        existing_periods = await self.contract_periods.get_by_project(project_id)
        
        # Find the current/active period
        # The active period is the one whose start_date matches project.start_date
        # (this is how we identify which period is "current")
        current_period = None
        if existing_periods:
            # First try: find period whose start_date matches project.start_date (the active period)
            if project.start_date:
                for period in existing_periods:
                    if period.start_date == project.start_date:
                        current_period = period
                        break
            
            # Fallback: find period that contains or ends at closing_period_end_date, or the most recent one
            if not current_period:
                for period in sorted(existing_periods, key=lambda p: p.end_date, reverse=True):
                    if period.end_date >= closing_period_end_date or (period.start_date <= closing_period_end_date <= period.end_date):
                        current_period = period
                        break
                
                # If still no period found, use the most recent one
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
            
            # Normalize end_date according to business rules
            normalized_end_date = self._normalize_period_end_date(start_date, closing_period_end_date)
            
            # Create first period
            current_period = ContractPeriod(
                project_id=project_id,
                start_date=start_date,
                end_date=normalized_end_date,
                contract_year=normalized_end_date.year,
                year_index=1
            )
            current_period = await self.contract_periods.create(current_period)
            
            # Copy project-level budgets (if any) to this first period
            from backend.services.budget_service import BudgetService
            budget_service = BudgetService(self.db)
            await budget_service.copy_budgets_to_new_period(
                project_id=project_id,
                from_period_id=None,
                to_period=current_period,
            )
        else:
            # Update the current period's end_date if needed
            if current_period.end_date != closing_period_end_date:
                # Normalize end_date according to business rules
                normalized_closing_end = self._normalize_period_end_date(current_period.start_date, closing_period_end_date)
                
                # Check if a period with these exact dates already exists (avoid duplicates)
                existing = await self.contract_periods.get_by_exact_dates(
                    project_id, 
                    current_period.start_date, 
                    normalized_closing_end
                )
                if existing and existing.id != current_period.id:
                    raise ValueError(f"Contract period with dates {current_period.start_date} to {normalized_closing_end} already exists")
                
                current_period.end_date = normalized_closing_end
                current_period.contract_year = normalized_closing_end.year
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
        
        # Calculate default end_date
        # If project uses duration_months, use that; otherwise use 1 year (legacy)
        project = await self.projects.get_by_id(project_id)
        if project and project.contract_duration_months:
            default_end_date = next_start_date + relativedelta(months=project.contract_duration_months)
        else:
            # Legacy: EXACTLY 1 year from start
            # Using relativedelta for precise year addition (handles leap years)
            default_end_date = next_start_date + relativedelta(years=1)
        # Normalize end_date according to business rules
        normalized_end_date = self._normalize_period_end_date(next_start_date, default_end_date)
        
        # Create new period for next year
        new_period = ContractPeriod(
            project_id=project_id,
            start_date=next_start_date,
            end_date=normalized_end_date,
            contract_year=next_year,
            year_index=next_year_index
        )
        
        new_period = await self.contract_periods.create(new_period)

        # Copy budgets from the closing period to the new period so they "restart" each year
        from backend.services.budget_service import BudgetService
        budget_service = BudgetService(self.db)
        copied_count = await budget_service.copy_budgets_to_new_period(
            project_id=project_id,
            from_period_id=current_period.id if current_period else None,
            to_period=new_period,
        )
        if copied_count == 0:
            print(f"⚠️ [CLOSE YEAR] No budgets copied to new period {new_period.id} for project {project_id} (from_period_id={current_period.id if current_period else None})")

        # Update project dates to reflect new period (this makes the new period the "current" one)
        # The old period will automatically be excluded from "previous periods" because its
        # start_date no longer matches project.start_date
        project.start_date = next_start_date
        project.end_date = new_period.end_date  # Always update end_date to match new period
        await self.projects.update(project)
        
        return new_period
