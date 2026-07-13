"""
Background scheduler tasks extracted from main.py.

SRP: main.py assembles the app; this module defines recurring background jobs.
Each scheduler function runs in an infinite loop, sleeping between iterations.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

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

    The actual pass is defined once in
    ``backend.services.contract_renewal_guard.ContractRenewalGuard`` and
    is delegated to from here (DRY). Other entry points (login, project
    list, lifespan startup) call the same guard, so even if this scheduler
    fails or the server was down, the pass will still run on the next
    user request that hits one of those entry points.
    """
    from backend.db.session import AsyncSessionLocal
    from backend.services.contract_renewal_guard import ContractRenewalGuard

    first_run = True
    guard = ContractRenewalGuard()

    while True:
        try:
            if not first_run:
                await asyncio.sleep(60 * 60 * 24)
            else:
                first_run = False
                await asyncio.sleep(10)

            async with AsyncSessionLocal() as db:
                try:
                    await guard.ensure_daily_renewal_ran(db)
                finally:
                    await db.close()
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("Error in contract renewal scheduler outer loop")
            await asyncio.sleep(60 * 60)


async def run_client_visit_expiry_scheduler() -> None:
    """Background task that turns apartments vacant when a client arrival's
    ``expected_until`` has passed.

    Runs the same pass the desk triggers lazily on read, so occupancy stays
    correct even when nobody is viewing the reception desk. First run ~20s
    after startup, then every 60 seconds (arrivals use minute-level times).
    """
    from backend.db.session import AsyncSessionLocal
    from backend.services.client_visit_service import ClientVisitService

    first_run = True

    while True:
        try:
            if not first_run:
                await asyncio.sleep(60)
            else:
                first_run = False
                await asyncio.sleep(20)

            async with AsyncSessionLocal() as db:
                try:
                    expired = await ClientVisitService(db).expire_due_visits()
                    if expired:
                        logger.info("Auto-expired %d client visit(s)", expired)
                except Exception:
                    logger.exception("Error expiring due client visits")
                finally:
                    await db.close()
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("Error in client visit expiry scheduler")
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
