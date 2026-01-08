#!/usr/bin/env python3
"""
Management command for recurring transactions.
Usage:
    python -m backend.management.recurring_transactions --help
    python -m backend.management.recurring_transactions --today
    python -m backend.management.recurring_transactions --month 2024-01
    python -m backend.management.recurring_transactions --backlog
    python -m backend.management.recurring_transactions --upcoming 30
"""

import asyncio
import argparse
from datetime import date, datetime, timedelta
from backend.services.recurring_transaction_scheduler import RecurringTransactionScheduler


async def generate_today():
    """Generate recurring transactions for today"""
    transactions = await RecurringTransactionScheduler.generate_daily_transactions()
    print(f"Generated {len(transactions)} transactions for today ({date.today()})")
    
    for tx in transactions:
        print(f"  - {tx['date']}: {tx['description']} (₪{tx['amount']})")


async def generate_month(year: int, month: int):
    """Generate recurring transactions for a specific month"""
    transactions = await RecurringTransactionScheduler.generate_monthly_transactions(year, month)
    print(f"Generated {len(transactions)} transactions for {year}-{month:02d}")
    
    for tx in transactions:
        print(f"  - {tx['date']}: {tx['description']} (₪{tx['amount']})")


async def generate_backlog():
    """Generate backlog transactions for current month"""
    today = date.today()
    start_of_month = today.replace(day=1)
    
    transactions = await RecurringTransactionScheduler.generate_backlog_transactions(start_of_month, today)
    print(f"Generated {len(transactions)} backlog transactions for current month")
    
    for tx in transactions:
        print(f"  - {tx['date']}: {tx['description']} (₪{tx['amount']})")


async def generate_upcoming(days: int):
    """Generate upcoming transactions for the next N days"""
    transactions = await RecurringTransactionScheduler.generate_upcoming_transactions(days)
    print(f"Generated {len(transactions)} upcoming transactions for next {days} days")
    
    for tx in transactions:
        print(f"  - {tx['date']}: {tx['description']} (₪{tx['amount']})")


async def main():
    parser = argparse.ArgumentParser(description='Generate recurring transactions')
    parser.add_argument('--today', action='store_true', help='Generate transactions for today')
    parser.add_argument('--month', type=str, help='Generate transactions for specific month (YYYY-MM)')
    parser.add_argument('--backlog', action='store_true', help='Generate backlog for current month')
    parser.add_argument('--upcoming', type=int, help='Generate upcoming transactions (days)')
    
    args = parser.parse_args()
    
    if args.today:
        await generate_today()
    elif args.month:
        try:
            year, month = map(int, args.month.split('-'))
            await generate_month(year, month)
        except ValueError:
            print("Invalid month format. Use YYYY-MM (e.g., 2024-01)")
    elif args.backlog:
        await generate_backlog()
    elif args.upcoming:
        await generate_upcoming(args.upcoming)
    else:
        parser.print_help()


if __name__ == "__main__":
    asyncio.run(main())
