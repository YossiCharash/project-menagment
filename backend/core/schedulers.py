"""
Background scheduler tasks extracted from main.py.

SRP: main.py assembles the app; this module defines recurring background jobs.
Each scheduler function runs in an infinite loop, sleeping between iterations.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

logger = logging.getLogger(__name__)


async def run_recurring_transactions_scheduler() -> None:
    """Background task that runs daily to generate recurring transactions.

    Checks every day if there are recurring templates that need to generate
    transactions. Runs immediately on startup (after 5s delay), then every 24 hours.
    """
    from backend.db.session import AsyncSessionLocal
    from backend.services.recurring_transaction_service import RecurringTransactionService

    first_run = True

    while True:
        try:
            if not first_run:
                await asyncio.sleep(60 * 60 * 24)
            else:
                first_run = False
                await asyncio.sleep(5)

            today = date.today()

            async with AsyncSessionLocal() as db:
                try:
                    service = RecurringTransactionService(db)
                    await service.generate_transactions_for_date(today)
                except Exception:
                    logger.exception("Error generating recurring transactions")
                finally:
                    await db.close()
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("Error in recurring transactions scheduler")
            await asyncio.sleep(60 * 60)


async def run_contract_renewal_scheduler() -> None:
    """Background task that runs daily to check if any contracts have ended
    and need to be renewed. Runs immediately on startup (after 10s delay),
    then every 24 hours.
    """
    from backend.db.session import AsyncSessionLocal
    from backend.services.contract_period_service import ContractPeriodService
    from backend.services.recurring_transaction_service import RecurringTransactionService
    from backend.models.project import Project

    first_run = True

    while True:
        try:
            if not first_run:
                await asyncio.sleep(60 * 60 * 24)
            else:
                first_run = False
                await asyncio.sleep(10)

            async with AsyncSessionLocal() as db:
                try:
                    service = ContractPeriodService(db)
                    recurring_service = RecurringTransactionService(db)

                    result = await db.execute(
                        select(Project).where(
                            Project.is_active == True,
                            Project.end_date.isnot(None)
                        )
                    )
                    projects = result.scalars().all()

                    for project in projects:
                        try:
                            renewed_period = await service.check_and_renew_contract(project.id)
                            if renewed_period:
                                await recurring_service.ensure_project_transactions_generated(project.id)
                        except Exception:
                            logger.exception("Error renewing contract for project %s", project.id)
                except Exception:
                    logger.exception("Error in contract renewal scheduler")
                finally:
                    await db.close()
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("Error in contract renewal scheduler outer loop")
            await asyncio.sleep(60 * 60)


def _seconds_until_midnight() -> float:
    """Calculate seconds from now until the next midnight (local time)."""
    now = datetime.now()
    tomorrow = datetime(now.year, now.month, now.day) + timedelta(days=1)
    return (tomorrow - now).total_seconds()


async def run_task_archive_scheduler() -> None:
    """Background task that archives completed tasks at midnight each day.

    Tasks with status='completed' whose completed_at is before today
    are marked as archived. First run after 15s delay, then sleeps
    until next midnight.
    """
    from backend.db.session import AsyncSessionLocal
    from backend.repositories.task_repository import TaskRepository

    first_run = True

    while True:
        try:
            if not first_run:
                await asyncio.sleep(_seconds_until_midnight())
            else:
                first_run = False
                await asyncio.sleep(15)

            async with AsyncSessionLocal() as db:
                try:
                    repo = TaskRepository(db)
                    count = await repo.archive_completed_tasks()
                    if count > 0:
                        logger.info("Archived %d completed tasks", count)
                except Exception:
                    logger.exception("Error archiving completed tasks")
                finally:
                    await db.close()
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("Error in task archive scheduler")
            await asyncio.sleep(60 * 60)
