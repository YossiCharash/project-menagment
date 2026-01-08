import asyncio
from datetime import date, datetime, timedelta
from typing import List
from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from backend.db.session import get_db
from backend.services.recurring_transaction_service import RecurringTransactionService


class RecurringTransactionBackgroundService:
    """Background service for recurring transaction generation"""
    
    @staticmethod
    async def generate_today_transactions_background(db: AsyncSession):
        """Background task to generate today's recurring transactions"""
        try:
            service = RecurringTransactionService(db)
            today = date.today()
            transactions = await service.generate_transactions_for_date(today)
            
            if transactions:
                print(f"Generated {len(transactions)} recurring transactions for {today}")
            else:
                print(f"No recurring transactions to generate for {today}")
                
        except Exception as e:
            print(f"Error generating recurring transactions: {e}")
    
    @staticmethod
    async def generate_monthly_transactions_background(db: AsyncSession, year: int, month: int):
        """Background task to generate monthly recurring transactions"""
        try:
            service = RecurringTransactionService(db)
            transactions = await service.generate_transactions_for_month(year, month)
            
            print(f"Generated {len(transactions)} recurring transactions for {year}-{month:02d}")
            
        except Exception as e:
            print(f"Error generating monthly recurring transactions: {e}")
    
    @staticmethod
    async def generate_backlog_transactions_background(db: AsyncSession, start_date: date, end_date: date):
        """Background task to generate backlog transactions"""
        try:
            service = RecurringTransactionService(db)
            current_date = start_date
            total_generated = 0
            
            while current_date <= end_date:
                daily_transactions = await service.generate_transactions_for_date(current_date)
                total_generated += len(daily_transactions)
                current_date += timedelta(days=1)
            
            print(f"Generated {total_generated} backlog transactions from {start_date} to {end_date}")
            
        except Exception as e:
            print(f"Error generating backlog transactions: {e}")


# FastAPI background task functions
async def generate_today_recurring_transactions(background_tasks: BackgroundTasks):
    """Add background task to generate today's recurring transactions"""
    db = next(get_db())
    background_tasks.add_task(
        RecurringTransactionBackgroundService.generate_today_transactions_background,
        db
    )


async def generate_monthly_recurring_transactions(background_tasks: BackgroundTasks, year: int, month: int):
    """Add background task to generate monthly recurring transactions"""
    db = next(get_db())
    background_tasks.add_task(
        RecurringTransactionBackgroundService.generate_monthly_transactions_background,
        db, year, month
    )


async def generate_backlog_recurring_transactions(background_tasks: BackgroundTasks, start_date: date, end_date: date):
    """Add background task to generate backlog recurring transactions"""
    db = next(get_db())
    background_tasks.add_task(
        RecurringTransactionBackgroundService.generate_backlog_transactions_background,
        db, start_date, end_date
    )
