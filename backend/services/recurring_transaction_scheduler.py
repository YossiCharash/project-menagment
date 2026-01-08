import asyncio
from datetime import date, datetime, timedelta
from typing import List
from sqlalchemy.orm import Session
from backend.db.session import get_db
from backend.services.recurring_transaction_service import RecurringTransactionService


class RecurringTransactionScheduler:
    """Service for automatically generating recurring transactions"""
    
    @staticmethod
    async def generate_daily_transactions(target_date: date = None) -> List[dict]:
        """
        Generate recurring transactions for a specific date.
        If no date is provided, uses today's date.
        """
        if target_date is None:
            target_date = date.today()
        
        db = next(get_db())
        try:
            service = RecurringTransactionService(db)
            transactions = await service.generate_transactions_for_date(target_date)
            
            return [{
                "id": tx.id,
                "project_id": tx.project_id,
                "template_id": tx.recurring_template_id,
                "date": tx.tx_date,
                "amount": float(tx.amount),
                "description": tx.description
            } for tx in transactions]
        finally:
            db.close()
    
    @staticmethod
    async def generate_monthly_transactions(year: int, month: int) -> List[dict]:
        """
        Generate all recurring transactions for a specific month.
        """
        db = next(get_db())
        try:
            service = RecurringTransactionService(db)
            transactions = await service.generate_transactions_for_month(year, month)
            
            return [{
                "id": tx.id,
                "project_id": tx.project_id,
                "template_id": tx.recurring_template_id,
                "date": tx.tx_date,
                "amount": float(tx.amount),
                "description": tx.description
            } for tx in transactions]
        finally:
            db.close()
    
    @staticmethod
    async def generate_backlog_transactions(start_date: date, end_date: date) -> List[dict]:
        """
        Generate recurring transactions for a date range (backlog).
        Useful for generating transactions that should have been created in the past.
        """
        all_transactions = []
        current_date = start_date
        
        while current_date <= end_date:
            daily_transactions = await RecurringTransactionScheduler.generate_daily_transactions(current_date)
            all_transactions.extend(daily_transactions)
            current_date += timedelta(days=1)
        
        return all_transactions
    
    @staticmethod
    async def generate_upcoming_transactions(days_ahead: int = 30) -> List[dict]:
        """
        Generate recurring transactions for the next N days.
        """
        start_date = date.today()
        end_date = start_date + timedelta(days=days_ahead)
        return await RecurringTransactionScheduler.generate_backlog_transactions(start_date, end_date)


# CLI command for manual execution
async def main():
    """CLI entry point for manual transaction generation"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate recurring transactions')
    parser.add_argument('--date', type=str, help='Target date (YYYY-MM-DD)')
    parser.add_argument('--month', type=str, help='Target month (YYYY-MM)')
    parser.add_argument('--backlog', action='store_true', help='Generate backlog for current month')
    parser.add_argument('--upcoming', type=int, default=30, help='Generate upcoming transactions (days)')
    
    args = parser.parse_args()
    
    if args.date:
        target_date = datetime.strptime(args.date, '%Y-%m-%d').date()
        transactions = await RecurringTransactionScheduler.generate_daily_transactions(target_date)
        print(f"Generated {len(transactions)} transactions for {target_date}")
        
    elif args.month:
        year, month = map(int, args.month.split('-'))
        transactions = await RecurringTransactionScheduler.generate_monthly_transactions(year, month)
        print(f"Generated {len(transactions)} transactions for {year}-{month:02d}")
        
    elif args.backlog:
        # Generate for current month
        today = date.today()
        start_of_month = today.replace(day=1)
        transactions = await RecurringTransactionScheduler.generate_backlog_transactions(start_of_month, today)
        print(f"Generated {len(transactions)} backlog transactions for current month")
        
    else:
        # Generate upcoming transactions
        transactions = await RecurringTransactionScheduler.generate_upcoming_transactions(args.upcoming)
        print(f"Generated {len(transactions)} upcoming transactions for next {args.upcoming} days")
    
    for tx in transactions:
        print(f"  - {tx['date']}: {tx['description']} ({tx['amount']})")


if __name__ == "__main__":
    asyncio.run(main())
