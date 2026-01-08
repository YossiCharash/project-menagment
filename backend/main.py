import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.utils import get_openapi
import re
import os
import asyncio
from datetime import date

# Import all models to ensure Base.metadata is populated
# This import ensures all models are registered before create_all is called
from backend.models import (  # noqa: F401
    User, Project, Subproject, Transaction, AuditLog,
    Supplier, SupplierDocument, AdminInvite, EmailVerification,
    RecurringTransactionTemplate, MemberInvite
)
# Also import base_models to ensure all models are loaded
from backend.db import base_models  # noqa: F401

from backend.api.v1.router import api_router
from backend.core.config import settings
from backend.db.session import engine
from backend.db.base import Base
from backend.db.init_db import init_database


def create_app() -> FastAPI:
    tags_metadata = [
        {"name": "auth", "description": "אימות משתמשים והנפקת טוקנים"},
        {"name": "users", "description": "ניהול משתמשים והרשאות"},
        {"name": "projects", "description": "ניהול פרויקטים ותקציבים"},
        {"name": "transactions", "description": "תיעוד הכנסות/הוצאות והעלאות קבצים"},
        {"name": "reports", "description": "דוחות רווחיות והשוואה לתקציב"},
    ]

    # Initialize database - creates all tables, enums, indexes, and foreign keys
    try:
        settings.validate_security()
    except ValueError as e:
        print(f"\n[SECURITY WARNING] {str(e)}\n")
        # In production, you might want to exit: exit(1)

    app = FastAPI(
        title="BMS Backend",
        version="1.0.0",
        description="מערכת ניהול תקציב לבנייה (BMS) עם FastAPI",
        openapi_url="/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_tags=tags_metadata,
        redirect_slashes=False,  # Disable automatic 307 redirects between /route and /route/
    )

    from sqlalchemy.exc import IntegrityError, DataError
    from fastapi.exceptions import RequestValidationError
    from pydantic import ValidationError

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError):
        """Handle database integrity errors (unique constraints, foreign keys)"""
        error_msg = str(exc.orig) if exc.orig else str(exc)
        if "unique constraint" in error_msg.lower():
            detail = "הפעולה נכשלה: הרשומה כבר קיימת במערכת."
            status_code = 409
        elif "foreign key constraint" in error_msg.lower():
            detail = "הפעולה נכשלה: קיימת תלות ברשומות אחרות המונעת את הפעולה."
            status_code = 400
        else:
            detail = "שגיאת מסד נתונים."
            status_code = 400

        print(f"⚠️ Integrity Error at {request.url.path}: {detail} - {error_msg}")
        return JSONResponse(
            status_code=status_code,
            content={"detail": detail},
        )

    @app.exception_handler(DataError)
    async def data_error_handler(request: Request, exc: DataError):
        """Handle database data errors (invalid types, values too long)"""
        return JSONResponse(
            status_code=400,
            content={"detail": "הנתונים שהוזנו אינם תקינים (סוג נתונים שגוי או ערך ארוך מדי)."},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """Handle Pydantic validation errors with cleaner messages"""
        errors = []
        for error in exc.errors():
            field = ".".join(str(x) for x in error["loc"] if x != "body")
            msg = error["msg"]
            errors.append(f"{field}: {msg}")
            
        return JSONResponse(
            status_code=422,
            content={"detail": "שגיאת אימות נתונים", "errors": errors},
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        import traceback
        error_details = traceback.format_exc()
        print(error_details)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error. Please contact support."},
        )

    # Add CORS middleware FIRST, before any other middleware
    # This ensures CORS headers are set for all requests including preflight
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=3600,  # Cache preflight requests for 1 hour
    )

    @app.middleware("http")
    async def resolve_trailing_slash(request, call_next):
        """
        Ensure routes defined with a trailing slash still work without it,
        without issuing an HTTP redirect (prevents 307 -> HTTP/port 10000).
        """
        path = request.scope.get("path", "")
        if path and not path.endswith("/"):
            alt_path = f"{path}/"
            available_paths = {
                getattr(route, "path", None)
                for route in app.router.routes
                if getattr(route, "path", None)
            }
            if alt_path in available_paths:
                request.scope["path"] = alt_path
        response = await call_next(request)
        return response
    
    @app.middleware("http")
    async def add_cors_debug_headers(request, call_next):
        """
        Debug middleware to log CORS-related information and ensure CORS headers are set
        """
        origin = request.headers.get("origin")
        method = request.method
        
        if origin:
            # Check if origin is in allowed list (with or without www)
            origin_normalized = origin.rstrip("/")
            origin_with_www = origin_normalized.replace("https://ziposystem.co.il", "https://www.ziposystem.co.il")
            origin_without_www = origin_normalized.replace("https://www.ziposystem.co.il", "https://ziposystem.co.il")
            
            is_allowed = (
                origin_normalized in settings.CORS_ORIGINS or
                origin_with_www in settings.CORS_ORIGINS or
                origin_without_www in settings.CORS_ORIGINS
            )
        
        response = await call_next(request)
        
        # Ensure CORS headers are set for allowed origins
        if origin:
            origin_normalized = origin.rstrip("/")
            origin_with_www = origin_normalized.replace("https://ziposystem.co.il", "https://www.ziposystem.co.il")
            origin_without_www = origin_normalized.replace("https://www.ziposystem.co.il", "https://ziposystem.co.il")
            
            is_allowed = (
                origin_normalized in settings.CORS_ORIGINS or
                origin_with_www in settings.CORS_ORIGINS or
                origin_without_www in settings.CORS_ORIGINS
            )
            
            if is_allowed:
                # Ensure CORS headers are present
                if "Access-Control-Allow-Origin" not in response.headers:
                    response.headers["Access-Control-Allow-Origin"] = origin_normalized
                if "Access-Control-Allow-Credentials" not in response.headers:
                    response.headers["Access-Control-Allow-Credentials"] = "true"
                if "Access-Control-Allow-Methods" not in response.headers:
                    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD"
                if "Access-Control-Allow-Headers" not in response.headers:
                    response.headers["Access-Control-Allow-Headers"] = "*"
        
        # Log response headers for debugging
        if origin and method == "OPTIONS":
            cors_headers = {
                "Access-Control-Allow-Origin": response.headers.get("Access-Control-Allow-Origin"),
                "Access-Control-Allow-Methods": response.headers.get("Access-Control-Allow-Methods"),
                "Access-Control-Allow-Headers": response.headers.get("Access-Control-Allow-Headers"),
            }

        return response

    @app.on_event("startup")
    async def on_startup() -> None:
        # Initialize database - creates all tables, enums, indexes, and foreign keys
        await init_database(engine)

        # Create super admin from environment variables
        from backend.core.seed import create_super_admin
        await create_super_admin()
        
        # Start background task for recurring transactions
        asyncio.create_task(run_recurring_transactions_scheduler())
        
        # Start background task for contract renewal checks
        asyncio.create_task(run_contract_renewal_scheduler())

    def custom_openapi():
        if app.openapi_schema:
            return app.openapi_schema
        openapi_schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )
        openapi_schema.setdefault("components", {}).setdefault("securitySchemes", {}).update({
            "bearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
            }
        })
        openapi_schema["security"] = [{"bearerAuth": []}]
        app.openapi_schema = openapi_schema
        return app.openapi_schema

    app.openapi = custom_openapi  # type: ignore[assignment]

    app.include_router(api_router, prefix=settings.API_V1_STR)

    # Mount static files for uploads (images, documents, etc.)
    # Get absolute path to uploads directory
    # If FILE_UPLOAD_DIR is relative, resolve it relative to backend directory
    if os.path.isabs(settings.FILE_UPLOAD_DIR):
        uploads_dir = settings.FILE_UPLOAD_DIR
    else:
        # Get the directory where this file (main.py) is located
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        uploads_dir = os.path.abspath(os.path.join(backend_dir, settings.FILE_UPLOAD_DIR))
    
    os.makedirs(uploads_dir, exist_ok=True)
    
    # Create subdirectories
    projects_dir = os.path.join(uploads_dir, 'projects')
    suppliers_dir = os.path.join(uploads_dir, 'suppliers')
    os.makedirs(projects_dir, exist_ok=True)
    os.makedirs(suppliers_dir, exist_ok=True)
    # Note: Supplier-specific subdirectories will be created automatically when needed
    
    # Mount static files - this allows serving files from /uploads/{path}
    # Note: StaticFiles will serve files relative to the directory provided
    # So /uploads/suppliers/file.txt will look for {uploads_dir}/suppliers/file.txt
    try:
        app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
    except Exception as e:
        raise

    @app.get("/health")
    async def health_check():
        return {"status": "healthy", "message": "Project Management System is running"}

    # Serve Frontend (SPA) in Production/Docker
    # We check multiple possible locations for the frontend build artifacts
    possible_static_dirs = [
        "/app/static",  # Docker container path
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist"),  # Local dev path
    ]
    
    static_dir = None
    for d in possible_static_dirs:
        if os.path.exists(d) and os.path.exists(os.path.join(d, "index.html")):
            static_dir = d
            break
            
    if static_dir:

        
        # Serve assets (JS/CSS)
        # We mount /assets to serve files from /app/static/assets
        if os.path.exists(os.path.join(static_dir, "assets")):
            app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")
        
        # Explicit root handler
        @app.get("/")
        async def serve_root():
            return FileResponse(os.path.join(static_dir, "index.html"))

        # Catch-all handler for SPA routing
        @app.get("/{full_path:path}")
        async def serve_frontend(full_path: str):
            # Check if file exists in static_dir
            file_path = os.path.join(static_dir, full_path)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                return FileResponse(file_path)
            
            # For API requests that weren't matched, return 404 instead of index.html
            if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
                 return JSONResponse(status_code=404, content={"detail": "Not Found"})

            # Fallback to index.html for SPA
            index_path = os.path.join(static_dir, "index.html")
            return FileResponse(index_path)

    return app


async def run_recurring_transactions_scheduler():
    """
    Background task that runs daily to generate recurring transactions.
    Checks every day if there are any recurring templates that need to generate transactions.
    Runs immediately on startup, then every 24 hours.
    """
    from backend.db.session import AsyncSessionLocal
    from backend.services.recurring_transaction_service import RecurringTransactionService
    
    # Run immediately on startup
    first_run = True
    
    while True:
        try:
            if not first_run:
                # Wait 24 hours before next run
                await asyncio.sleep(60 * 60 * 24)
            else:
                first_run = False
                # Wait 5 seconds after startup to let the app fully initialize
                await asyncio.sleep(5)
            
            # Get today's date
            today = date.today()
            
            # Create a new database session for this task
            async with AsyncSessionLocal() as db:
                try:
                    service = RecurringTransactionService(db)
                    # Generate transactions for today
                    transactions = await service.generate_transactions_for_date(today)

                except Exception as e:
                    import traceback
                    traceback.print_exc()
                finally:
                    await db.close()
        except Exception as e:
            import traceback
            traceback.print_exc()
            # Wait a bit before retrying
            await asyncio.sleep(60 * 60)  # Wait 1 hour before retrying


async def run_contract_renewal_scheduler():
    """
    Background task that runs daily to check if any contracts have ended
    and need to be renewed. Checks every day at midnight.
    Runs immediately on startup, then every 24 hours.
    """
    from backend.db.session import AsyncSessionLocal
    from backend.services.contract_period_service import ContractPeriodService
    from backend.repositories.project_repository import ProjectRepository
    from sqlalchemy import select
    from backend.models.project import Project
    
    # Run immediately on startup
    first_run = True
    
    while True:
        try:
            if not first_run:
                # Wait 24 hours before next run
                await asyncio.sleep(60 * 60 * 24)
            else:
                first_run = False
                # Wait 10 seconds after startup to let the app fully initialize
                await asyncio.sleep(10)
            
            # Create a new database session for this task
            async with AsyncSessionLocal() as db:
                try:
                    service = ContractPeriodService(db)
                    project_repo = ProjectRepository(db)
                    
                    # Get all active projects with end dates
                    result = await db.execute(
                        select(Project).where(
                            Project.is_active == True,
                            Project.end_date.isnot(None)
                        )
                    )
                    projects = result.scalars().all()
                    
                    renewed_count = 0
                    for project in projects:
                        try:
                            renewed_project = await service.check_and_renew_contract(project.id)
                            if renewed_project:
                                renewed_count += 1
                        except Exception as e:
                            import traceback
                            traceback.print_exc()
                except Exception as e:
                    import traceback
                    traceback.print_exc()
                finally:
                    await db.close()
        except Exception as e:
            import traceback
            traceback.print_exc()
            # Wait a bit before retrying
            await asyncio.sleep(60 * 60)  # Wait 1 hour before retrying


app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)