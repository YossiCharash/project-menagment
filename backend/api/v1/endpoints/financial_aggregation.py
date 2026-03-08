import logging
from datetime import datetime, date, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from backend.services.financial_aggregation_service import FinancialAggregationService
from backend.core.deps import DBSessionDep, get_current_user
from backend.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/parent-project/{parent_project_id}/financial-summary")
async def get_parent_project_financial_summary(
    parent_project_id: int,
        db: DBSessionDep,
        start_date: Optional[date] = Query(None, description="Start date for filtering (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date for filtering (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user)
):
    """
    Get consolidated financial summary for a parent project including all subprojects

    This endpoint provides a comprehensive financial overview of a parent project
    and all its associated subprojects for the specified date range.
    """
    try:
        service = FinancialAggregationService(db)
        summary = await service.get_parent_project_financial_summary(
            parent_project_id,
            start_date,
            end_date
        )
        return summary
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error retrieving financial summary for parent project {parent_project_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה בטעינת סיכום פיננסי.")


@router.get("/parent-project/{parent_project_id}/monthly-summary")
async def get_monthly_financial_summary(
    parent_project_id: int,
    db: DBSessionDep,
    year: int = Query(..., description="Year (e.g., 2024)"),
    month: int = Query(..., description="Month (1-12)"),
    current_user: User = Depends(get_current_user)
):
    """
    Get financial summary for a specific month
    
    Returns consolidated financial data for the parent project and all subprojects
    for the specified month.
    """
    try:
        if not (1 <= month <= 12):
            raise HTTPException(status_code=400, detail="Month must be between 1 and 12")
        
        service = FinancialAggregationService(db)
        summary = await service.get_monthly_financial_summary(parent_project_id, year, month)
        return summary
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error retrieving monthly summary for parent project {parent_project_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה בטעינת סיכום חודשי.")


@router.get("/parent-project/{parent_project_id}/yearly-summary")
async def get_yearly_financial_summary(
    db: DBSessionDep,
    parent_project_id: int,
    year: int = Query(..., description="Year (e.g., 2024)"),
    current_user: User = Depends(get_current_user)
):
    """
    Get financial summary for a specific year
    
    Returns consolidated financial data for the parent project and all subprojects
    for the specified year.
    """
    try:
        service = FinancialAggregationService(db)
        summary = await service.get_yearly_financial_summary(parent_project_id, year)
        return summary
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error retrieving yearly summary for parent project {parent_project_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה בטעינת סיכום שנתי.")


@router.get("/parent-project/{parent_project_id}/custom-range-summary")
async def get_custom_range_financial_summary(
    parent_project_id: int,
    db: DBSessionDep,
    start_date: date = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: date = Query(..., description="End date (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user)
):
    """
    Get financial summary for a custom date range
    
    Returns consolidated financial data for the parent project and all subprojects
    for the specified date range.
    """
    try:
        if start_date > end_date:
            raise HTTPException(status_code=400, detail="Start date must be before end date")
        
        service = FinancialAggregationService(db)
        summary = await service.get_custom_range_financial_summary(
            parent_project_id,
            start_date,
            end_date
        )
        return summary
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error retrieving custom range summary for parent project {parent_project_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה בטעינת סיכום טווח מותאם.")


@router.get("/parent-project/{parent_project_id}/subproject-performance")
async def get_subproject_performance_comparison(
    parent_project_id: int,
    db: DBSessionDep,
    start_date: Optional[date] = Query(None, description="Start date for filtering (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date for filtering (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user)
):
    """
    Get performance comparison of all subprojects
    
    Returns subprojects sorted by profitability for easy comparison.
    """
    try:
        service = FinancialAggregationService(db)
        performance = await service.get_subproject_performance_comparison(
            parent_project_id,
            start_date,
            end_date
        )
        return {
            "subproject_performance": performance,
            "date_range": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error retrieving subproject performance for parent project {parent_project_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה בטעינת ביצועי תתי-פרויקטים.")


@router.get("/parent-project/{parent_project_id}/financial-trends")
async def get_financial_trends(
    parent_project_id: int,
    db: DBSessionDep,
    years_back: int = Query(5, description="Number of years to look back (default: 5)"),
    current_user: User = Depends(get_current_user)
):
    """
    Get financial trends over the last N years
    
    Returns yearly financial trends for trend analysis and forecasting.
    """
    try:
        if years_back < 1 or years_back > 20:
            raise HTTPException(status_code=400, detail="Years back must be between 1 and 20")
        
        service = FinancialAggregationService(db)
        trends = await service.get_financial_trends(parent_project_id, years_back)
        return trends
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error retrieving financial trends for parent project {parent_project_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה בטעינת מגמות פיננסיות.")


@router.get("/parent-project/{parent_project_id}/dashboard-overview")
async def get_parent_project_dashboard_overview(
    parent_project_id: int,
    db: DBSessionDep,
    current_user: User = Depends(get_current_user)
):
    """
    Get comprehensive dashboard overview for a parent project
    
    Returns a complete overview including current financial status,
    recent trends, and subproject performance.
    """
    try:
        service = FinancialAggregationService(db)
        
        # Get current year summary
        current_date = datetime.now(timezone.utc).date()
        current_summary = await service.get_yearly_financial_summary(
            parent_project_id,
            current_date.year
        )

        # Get trends for last 5 years
        trends = await service.get_financial_trends(parent_project_id, 5)

        # Get subproject performance
        performance = await service.get_subproject_performance_comparison(parent_project_id)
        
        return {
            "current_summary": current_summary,
            "trends": trends,
            "subproject_performance": performance,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error retrieving dashboard overview for parent project {parent_project_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="שגיאה בטעינת סקירת דשבורד.")
