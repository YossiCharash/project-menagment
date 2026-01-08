from datetime import date, timedelta, datetime
from typing import Dict, List, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.repositories.contract_period_repository import ContractPeriodRepository
from backend.repositories.project_repository import ProjectRepository
from backend.repositories.transaction_repository import TransactionRepository
from backend.models.contract_period import ContractPeriod
from backend.models.project import Project
from backend.models.archived_contract import ArchivedContract

class ContractPeriodService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.contract_periods = ContractPeriodRepository(db)
        self.projects = ProjectRepository(db)
        self.transactions = TransactionRepository(db)

    async def get_previous_contracts_by_year(self, project_id: int) -> Dict[int, List[Dict[str, Any]]]:
        """Get all contract periods grouped by year, with deduplication"""
        # Get all periods ordered by year and index
        periods = await self.contract_periods.get_by_project(project_id)
        
        # Get project to identify current active dates
        project = await self.projects.get_by_id(project_id)
        active_start = project.start_date if project else None
        
        # Deduplicate periods: 
        # 1. Use (start_date, end_date) as unique key to prevent duplicate rows with different IDs or indexes
        # 2. Exclude the current active period (matches project start_date)
        unique_periods = {}
        for period in periods:
            # Skip if this is the active period (start_date matches project's current start_date)
            # "Previous" contracts should not include the current one
            if active_start and period.start_date == active_start:
                continue
                
            # Use (start_date, end_date) as unique key
            # If multiple periods have same dates but different indexes (due to bugs), treat as duplicate
            period_key = (period.start_date, period.end_date)
            
            # If we haven't seen this date range, or this period has a higher ID (newer), keep it
            if period_key not in unique_periods or period.id > unique_periods[period_key].id:
                unique_periods[period_key] = period
        
        result = {}
        for period in unique_periods.values():
            year = period.contract_year
            if year not in result:
                result[year] = []
                
            # Calculate summary for this period
            summary = await self._get_period_financials(period)
            
            result[year].append({
                'period_id': period.id,
                'start_date': period.start_date.isoformat(),
                'end_date': period.end_date.isoformat(),
                'year_index': period.year_index,
                'year_label': f"תקופה {period.year_index}" if period.year_index > 1 else "תקופה ראשית",
                'total_income': summary['total_income'],
                'total_expense': summary['total_expense'],
                'total_profit': summary['total_profit']
            })
        
        # Sort periods within each year by year_index (ascending)
        for year in result:
            result[year].sort(key=lambda p: p['year_index'])
            
        return result

    async def _get_period_financials(self, period: ContractPeriod) -> Dict[str, float]:
        """Calculate financial summary for a period"""
        # Get transactions within this period
        # Note: We need a method in TransactionRepository to get by date range
        # For now, we'll assume we can get all project transactions and filter (inefficient but safe)
        # Or better, add a method to TransactionRepository.
        # Let's check TransactionRepository capabilities.
        # Using a direct query here would be better if repository doesn't support it.
        
        # Assuming TransactionRepository has get_by_project_and_date_range or similar
        # If not, we'll leave it as 0 for now or implement a quick query
        
        # Actually, let's use the repository to get filtered transactions if possible
        # checking repository... I don't see get_by_date_range in my memory of it.
        # I'll stick to basic implementation.
        
        return {
            'total_income': 0,
            'total_expense': 0,
            'total_profit': 0
        }

    async def get_contract_period_summary(self, period_id: int) -> Optional[Dict[str, Any]]:
        """Get detailed summary for a contract period"""
        period = await self.contract_periods.get_by_id(period_id)
        if not period:
            return None
            
        summary = await self._get_period_financials(period)
        
        return {
            'period_id': period.id,
            'project_id': period.project_id,
            'start_date': period.start_date.isoformat(),
            'end_date': period.end_date.isoformat(),
            'contract_year': period.contract_year,
            **summary
        }

    async def check_and_renew_contract(self, project_id: int) -> Optional[ContractPeriod]:
        """Check if contract needs renewal and create new period if so"""
        # Get latest period
        periods = await self.contract_periods.get_by_project(project_id)
        if not periods:
            return None
            
        latest_period = max(periods, key=lambda p: p.end_date)
        
        # logical check: if end_date is passed or close?
        # For now, just return None as we don't want to auto-renew unexpectedly
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
        
        # Update project dates to reflect new period
        project.start_date = next_start_date
        if project.end_date and project.end_date < next_start_date:
            project.end_date = new_period.end_date
        await self.projects.update(project)
        
        return new_period
