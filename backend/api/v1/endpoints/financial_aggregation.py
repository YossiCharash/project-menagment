from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.services.financial_aggregation_service import FinancialAggregationService
from backend.core.deps import get_current_user
from backend.models.user import User

router = APIRouter()


@router.get("/parent-project/{parent_project_id}/financial-summary")
async def get_parent_project_financial_summary(
    parent_project_id: int,
    start_date: Optional[date] = Query(None, description="Start date for filtering (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date for filtering (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get consolidated financial summary for a parent project including all subprojects
    
    This endpoint provides a comprehensive financial overview of a parent project
    and all its associated subprojects for the specified date range.
    """
    try:
        service = FinancialAggregationService(db)
        summary = service.get_parent_project_financial_summary(
            parent_project_id, 
            start_date, 
            end_date
        )
        return summary
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving financial summary: {str(e)}")


@router.get("/parent-project/{parent_project_id}/monthly-summary")
async def get_monthly_financial_summary(
    parent_project_id: int,
    year: int = Query(..., description="Year (e.g., 2024)"),
    month: int = Query(..., description="Month (1-12)"),
    db: Session = Depends(get_db),
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
        summary = service.get_monthly_financial_summary(parent_project_id, year, month)
        return summary
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving monthly summary: {str(e)}")


@router.get("/parent-project/{parent_project_id}/yearly-summary")
async def get_yearly_financial_summary(
    parent_project_id: int,
    year: int = Query(..., description="Year (e.g., 2024)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get financial summary for a specific year
    
    Returns consolidated financial data for the parent project and all subprojects
    for the specified year.
    """
    try:
        service = FinancialAggregationService(db)
        summary = service.get_yearly_financial_summary(parent_project_id, year)
        return summary
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving yearly summary: {str(e)}")


@router.get("/parent-project/{parent_project_id}/custom-range-summary")
async def get_custom_range_financial_summary(
    parent_project_id: int,
    start_date: date = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: date = Query(..., description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
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
        summary = service.get_custom_range_financial_summary(
            parent_project_id, 
            start_date, 
            end_date
        )
        return summary
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving custom range summary: {str(e)}")


@router.get("/parent-project/{parent_project_id}/subproject-performance")
async def get_subproject_performance_comparison(
    parent_project_id: int,
    start_date: Optional[date] = Query(None, description="Start date for filtering (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date for filtering (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get performance comparison of all subprojects
    
    Returns subprojects sorted by profitability for easy comparison.
    """
    try:
        service = FinancialAggregationService(db)
        performance = service.get_subproject_performance_comparison(
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
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving subproject performance: {str(e)}")


@router.get("/parent-project/{parent_project_id}/financial-trends")
async def get_financial_trends(
    parent_project_id: int,
    years_back: int = Query(5, description="Number of years to look back (default: 5)"),
    db: Session = Depends(get_db),
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
        trends = service.get_financial_trends(parent_project_id, years_back)
        return trends
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving financial trends: {str(e)}")


@router.get("/parent-project/{parent_project_id}/dashboard-overview")
async def get_parent_project_dashboard_overview(
    parent_project_id: int,
    db: Session = Depends(get_db),
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
        current_date = datetime.now().date()
        current_summary = service.get_yearly_financial_summary(
            parent_project_id, 
            current_date.year
        )
        
        # Get trends for last 5 years
        trends = service.get_financial_trends(parent_project_id, 5)
        
        # Get subproject performance
        performance = service.get_subproject_performance_comparison(parent_project_id)
        
        return {
            "current_summary": current_summary,
            "trends": trends,
            "subproject_performance": performance,
            "generated_at": datetime.now().isoformat()
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving dashboard overview: {str(e)}")
