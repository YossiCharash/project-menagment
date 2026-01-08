from fastapi import APIRouter, Depends, Query, Response, Body
from datetime import date
from typing import Optional, Dict
import io
import base64

from backend.core.deps import DBSessionDep, require_roles, get_current_user
from backend.services.report_service import ReportService
from backend.models.user import UserRole

router = APIRouter()

from backend.schemas.report import ReportOptions, SupplierReportOptions, CustomReportRequest, SupplierReportRequest


@router.post("/project/custom-report")
async def generate_custom_report(
        request: CustomReportRequest,
        db: DBSessionDep,
        user=Depends(get_current_user)
):
    """Generate a custom report based on options with optional chart images"""
    try:
        report_service = ReportService(db)

        # Determine filename based on project name if possible
        from sqlalchemy import select
        from backend.models.project import Project
        project_result = await db.execute(select(Project.name).where(Project.id == request.project_id))
        project_name = project_result.scalar_one_or_none()

        # Process chart images if provided
        processed_images = None
        if request.chart_images:
            processed_images = {}
            for key, base64_data in request.chart_images.items():
                try:
                    # Remove data URL prefix if exists
                    if ',' in base64_data:
                        base64_data = base64_data.split(',', 1)[1]
                    # Decode base64 to bytes
                    processed_images[key] = base64.b64decode(base64_data)
                except Exception as img_error:
                    print(f"⚠️ Failed to process image {key}: {str(img_error)}")
                    continue

        # Generate report with images
        content = await report_service.generate_custom_report(request, chart_images=processed_images)

        # Build filename: [Project Name] הפרטים
        # Sanitize project name for filename
        safe_project_name = "".join([c for c in (project_name or f"project_{request.project_id}") if
                                     c.isalnum() or c in (' ', '-', '_')]).strip()
        filename = f"{safe_project_name} הפרטים"

        if request.format == "pdf":
            media_type = "application/pdf"
            filename += ".pdf"
        elif request.format == "excel":
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename += ".xlsx"
        elif request.format == "zip":
            media_type = "application/zip"
            filename += ".zip"
        else:
            raise ValueError("Invalid format")

        # URL encode filename for Content-Disposition header to handle non-ASCII chars
        from urllib.parse import quote
        encoded_filename = quote(filename)

        headers = {
            'Content-Disposition': f"attachment; filename*=UTF-8''{encoded_filename}"
        }
        return Response(content=content, media_type=media_type, headers=headers)
    except Exception as e:
        import traceback
        print(f"❌ [Report API] Error generating custom report: {str(e)}")
        traceback.print_exc()
        raise


@router.get("/project/{project_id}/export/excel")
async def export_project_excel(
        project_id: int,
        db: DBSessionDep,
        user=Depends(get_current_user),
        chart_images: Optional[str] = Query(None, description="JSON string of chart images in base64 format")
):
    """Export project report to Excel with optional charts"""
    try:
        # Process chart images if provided
        processed_images = None
        if chart_images:
            import json
            try:
                images_dict = json.loads(chart_images)
                processed_images = {}
                for key, base64_data in images_dict.items():
                    try:
                        if ',' in base64_data:
                            base64_data = base64_data.split(',', 1)[1]
                        processed_images[key] = base64.b64decode(base64_data)
                    except Exception:
                        continue
            except Exception as e:
                print(f"⚠️ Failed to process chart images: {str(e)}")

        report_content = await ReportService(db).generate_excel_report(project_id, chart_images=processed_images)

        headers = {
            'Content-Disposition': f'attachment; filename="project_{project_id}_report.xlsx"'
        }
        return Response(content=report_content,
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)
    except Exception as e:
        import traceback
        print(f"❌ [Report API] Error generating Excel report: {str(e)}")
        traceback.print_exc()
        raise


@router.get("/project/{project_id}/export/zip")
async def export_project_zip(
        project_id: int,
        db: DBSessionDep,
        user=Depends(get_current_user),
        chart_images: Optional[str] = Query(None, description="JSON string of chart images in base64 format")
):
    """Export project report and documents to ZIP with optional charts"""
    try:
        # Process chart images if provided
        processed_images = None
        if chart_images:
            import json
            try:
                images_dict = json.loads(chart_images)
                processed_images = {}
                for key, base64_data in images_dict.items():
                    try:
                        if ',' in base64_data:
                            base64_data = base64_data.split(',', 1)[1]
                        processed_images[key] = base64.b64decode(base64_data)
                    except Exception:
                        continue
            except Exception as e:
                print(f"⚠️ Failed to process chart images: {str(e)}")

        zip_content = await ReportService(db).generate_zip_export(project_id, chart_images=processed_images)

        headers = {
            'Content-Disposition': f'attachment; filename="project_{project_id}_export.zip"'
        }
        return Response(content=zip_content, media_type="application/zip", headers=headers)
    except Exception as e:
        import traceback
        print(f"❌ [Report API] Error generating ZIP export: {str(e)}")
        traceback.print_exc()
        raise


@router.get("/project/{project_id}")
async def project_report(project_id: int, db: DBSessionDep, user=Depends(get_current_user)):
    """Get project report - accessible to all authenticated users"""
    return await ReportService(db).project_profitability(project_id)


@router.get("/dashboard-snapshot")
async def get_dashboard_snapshot(db: DBSessionDep, user=Depends(get_current_user)):
    """Get comprehensive dashboard snapshot with real-time financial data"""
    return await ReportService(db).get_dashboard_snapshot()


@router.get("/project/{project_id}/expense-categories")
async def get_project_expense_categories(project_id: int, db: DBSessionDep, user=Depends(get_current_user)):
    """Get expense categories breakdown for a specific project"""
    try:
        result = await ReportService(db).get_project_expense_categories(project_id)
        return result
    except Exception as e:
        import traceback
        print(f"❌ [Report API] Error getting expense categories for project {project_id}: {str(e)}")
        traceback.print_exc()
        raise


@router.get("/project/{project_id}/transactions")
async def get_project_transactions(project_id: int, db: DBSessionDep, user=Depends(get_current_user)):
    """Get all transactions for a specific project (including recurring ones)"""
    try:
        import time
        endpoint_start = time.time()
        
        # Use the optimized repository method that uses JOIN (no N+1 queries)
        from backend.repositories.transaction_repository import TransactionRepository
        from backend.schemas.transaction import TransactionOut
        # Get transactions without date filtering (reports need all transactions)
        transactions_data = await TransactionRepository(db).list_by_project_with_users(
            project_id=project_id,
            project_start_date=None,  # No date filtering for reports endpoint
            project_end_date=None
        )

        # Convert to TransactionOut format
        result = []
        for tx_dict in transactions_data:
            try:
                # Ensure all required fields are present
                tx_dict.setdefault('category', None)
                result.append(TransactionOut.model_validate(tx_dict))
            except Exception:
                # Skip malformed transactions
                continue
        
        return result
    except Exception as e:
        import traceback
        print(f"❌ [Report API] Error getting transactions for project {project_id}: {str(e)}")
        traceback.print_exc()
        raise


@router.post("/supplier/{supplier_id}/custom-report")
async def generate_supplier_report(
        supplier_id: int,
        request: SupplierReportRequest,
        db: DBSessionDep,
        user=Depends(get_current_user)
):
    """Generate a custom report for a specific supplier with all their transactions"""
    try:
        # Override supplier_id from path
        request.supplier_id = supplier_id

        report_service = ReportService(db)

        # Get supplier name for filename
        from sqlalchemy import select
        from backend.models.supplier import Supplier
        supplier_result = await db.execute(select(Supplier.name).where(Supplier.id == supplier_id))
        supplier_name = supplier_result.scalar_one_or_none()

        # Process chart images if provided
        processed_images = None
        if request.chart_images:
            processed_images = {}
            for key, base64_data in request.chart_images.items():
                try:
                    if ',' in base64_data:
                        base64_data = base64_data.split(',', 1)[1]
                    processed_images[key] = base64.b64decode(base64_data)
                except Exception:
                    continue

        content = await report_service.generate_supplier_report(request, chart_images=processed_images)

        # Build filename
        safe_supplier_name = "".join(
            [c for c in (supplier_name or f"supplier_{supplier_id}") if c.isalnum() or c in (' ', '-', '_')]).strip()
        filename = f"{safe_supplier_name} דוח"

        if request.format == "pdf":
            media_type = "application/pdf"
            filename += ".pdf"
        elif options.format == "excel":
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename += ".xlsx"
        elif options.format == "zip":
            media_type = "application/zip"
            filename += ".zip"
        else:
            raise ValueError("פורמט לא תקין")

        from urllib.parse import quote
        encoded_filename = quote(filename)

        headers = {
            'Content-Disposition': f"attachment; filename*=UTF-8''{encoded_filename}"
        }
        return Response(content=content, media_type=media_type, headers=headers)
    except Exception as e:
        import traceback
        print(f"❌ [Report API] Error generating supplier report: {str(e)}")
        traceback.print_exc()
        raise


@router.get("/expenses-by-date")
async def get_expenses_by_transaction_date(
        db: DBSessionDep,
        project_id: int | None = Query(None, description="Filter by project ID"),
        start_date: date | None = Query(None, description="Start date for filtering"),
        end_date: date | None = Query(None, description="End date for filtering"),
        user=Depends(get_current_user)
):
    """
    Get expenses aggregated by transaction date for dashboard.
    Shows expenses related to specific transaction dates with aggregation.
    Accessible to all authenticated users.
    """
    try:
        result = await ReportService(db).get_expenses_by_transaction_date(
            project_id=project_id,
            start_date=start_date,
            end_date=end_date
        )
        return result
    except Exception as e:
        import traceback
        print(f"❌ [Report API] Error getting expenses by date: {str(e)}")
        traceback.print_exc()
        raise