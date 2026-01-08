# Git Restructuring Plan - Project Management Backend

## Overview
This document outlines the complete Git restructuring plan for the Project Management Backend system. The project will be deconstructed into logical feature branches, each representing a core module, and then merged back to main with professional commit messages following Conventional Commits standard.

## Branching Strategy

### Main Branches
- `main` - Production-ready code

### Feature Branches (Sequential Development)
1. `feature/foundation` - Core setup and configuration
2. `feature/database-models` - Database infrastructure and models
3. `feature/authentication` - Authentication and security
4. `feature/user-management` - User management system
5. `feature/project-management` - Projects, budgets, categories
6. `feature/transaction-system` - Transactions and recurring transactions
7. `feature/supplier-management` - Supplier management
8. `feature/reporting` - Reporting and audit logs
9. `feature/file-management` - File uploads and S3 integration
10. `feature/api-infrastructure` - API routing and middleware
11. `feature/background-tasks` - Background schedulers
12. `feature/deployment` - Docker and deployment configuration

---

## Step-by-Step Execution Plan

### Phase 0: Initialization

#### Step 0.1: Initialize Git Repository
**Branch:** `main` (initial)

**Commands:**
```bash
cd Project-Management/backend
git init
git branch -M main
```

**Commit Message:**
```
chore: initialize git repository
```

---

### Phase 1: Foundation Setup

#### Step 1.1: Create Foundation Branch
**Branch:** `feature/foundation`

**Commands:**
```bash
git checkout -b feature/foundation
```

#### Step 1.2: Add Core Configuration
**Files:**
- `core/__init__.py`
- `core/config.py`
- `core/seed.py`

**Commit Message:**
```
feat: add core configuration and settings management

- Add Settings class with environment variable support
- Configure JWT, CORS, database, email, and AWS S3 settings
- Add security validation for production environments
- Add super admin seed functionality
```

**Commands:**
```bash
git add core/__init__.py core/config.py core/seed.py
git commit -m "feat: add core configuration and settings management

- Add Settings class with environment variable support
- Configure JWT, CORS, database, email, and AWS S3 settings
- Add security validation for production environments
- Add super admin seed functionality"
```

#### Step 1.3: Add Dependencies
**Files:**
- `requirements.txt`

**Commit Message:**
```
chore: add project dependencies

- Add FastAPI and async database drivers
- Add authentication libraries (JWT, bcrypt, OAuth)
- Add AWS SDK for S3 integration
- Add email and reporting libraries
```

**Commands:**
```bash
git add requirements.txt
git commit -m "chore: add project dependencies

- Add FastAPI and async database drivers
- Add authentication libraries (JWT, bcrypt, OAuth)
- Add AWS SDK for S3 integration
- Add email and reporting libraries"
```

#### Step 1.4: Tag Foundation Module
**Commands:**
```bash
git tag -a v1.0.0-foundation -m "Foundation setup complete"
```

#### Step 1.5: Merge Foundation to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/foundation -m "Merge feature/foundation: core configuration and dependencies"
```

---

### Phase 2: Database and Models

#### Step 2.1: Create Database Models Branch
**Branch:** `feature/database-models`

**Commands:**
```bash
git checkout -b feature/database-models
```

#### Step 2.2: Add Database Base Infrastructure
**Files:**
- `db/__init__.py`
- `db/base.py`
- `db/base_models.py`
- `db/session.py`
- `db/init_db.py`

**Commit Message:**
```
feat: add database base infrastructure

- Add SQLAlchemy Base declarative class
- Configure async database session management
- Add database initialization logic
- Set up connection pooling and transaction handling
```

**Commands:**
```bash
git add db/__init__.py db/base.py db/base_models.py db/session.py db/init_db.py
git commit -m "feat: add database base infrastructure

- Add SQLAlchemy Base declarative class
- Configure async database session management
- Add database initialization logic
- Set up connection pooling and transaction handling"
```

#### Step 2.3: Add User Model
**Files:**
- `models/user.py`
- `models/__init__.py` (update)

**Commit Message:**
```
feat: add user model with role-based access control

- Add User model with email, password, role, and group_id
- Implement password hashing and verification
- Add user activation and password change requirements
- Support Admin and Member roles
```

**Commands:**
```bash
git add models/user.py models/__init__.py
git commit -m "feat: add user model with role-based access control

- Add User model with email, password, role, and group_id
- Implement password hashing and verification
- Add user activation and password change requirements
- Support Admin and Member roles"
```

#### Step 2.4: Add Project Models
**Files:**
- `models/project.py`
- `models/subproject.py`
- `models/budget.py`
- `models/category.py`
- `models/contract_period.py`
- `models/archived_contract.py`
- `models/fund.py`
- `models/__init__.py` (update)

**Commit Message:**
```
feat: add project management models

- Add Project model with contract periods and file attachments
- Add Subproject model for hierarchical project structure
- Add Budget model for project financial planning
- Add Category model for transaction categorization
- Add ContractPeriod model for contract lifecycle management
- Add ArchivedContract model for historical contracts
- Add Fund model for financial fund tracking
```

**Commands:**
```bash
git add models/project.py models/subproject.py models/budget.py models/category.py models/contract_period.py models/archived_contract.py models/fund.py models/__init__.py
git commit -m "feat: add project management models

- Add Project model with contract periods and file attachments
- Add Subproject model for hierarchical project structure
- Add Budget model for project financial planning
- Add Category model for transaction categorization
- Add ContractPeriod model for contract lifecycle management
- Add ArchivedContract model for historical contracts
- Add Fund model for financial fund tracking"
```

#### Step 2.5: Add Transaction Models
**Files:**
- `models/transaction.py`
- `models/recurring_transaction.py`
- `models/deleted_recurring_instance.py`
- `models/__init__.py` (update)

**Commit Message:**
```
feat: add transaction and recurring transaction models

- Add Transaction model for income/expense tracking
- Add RecurringTransactionTemplate model for automated transactions
- Add DeletedRecurringInstance model for tracking deleted occurrences
- Support transaction attachments and categorization
```

**Commands:**
```bash
git add models/transaction.py models/recurring_transaction.py models/deleted_recurring_instance.py models/__init__.py
git commit -m "feat: add transaction and recurring transaction models

- Add Transaction model for income/expense tracking
- Add RecurringTransactionTemplate model for automated transactions
- Add DeletedRecurringInstance model for tracking deleted occurrences
- Support transaction attachments and categorization"
```

#### Step 2.6: Add Supplier Models
**Files:**
- `models/supplier.py`
- `models/supplier_document.py`
- `models/__init__.py` (update)

**Commit Message:**
```
feat: add supplier management models

- Add Supplier model with contact information and tax details
- Add SupplierDocument model for document management
- Support supplier categorization and status tracking
```

**Commands:**
```bash
git add models/supplier.py models/supplier_document.py models/__init__.py
git commit -m "feat: add supplier management models

- Add Supplier model with contact information and tax details
- Add SupplierDocument model for document management
- Support supplier categorization and status tracking"
```

#### Step 2.7: Add Invitation and Verification Models
**Files:**
- `models/admin_invite.py`
- `models/member_invite.py`
- `models/email_verification.py`
- `models/__init__.py` (update)

**Commit Message:**
```
feat: add invitation and email verification models

- Add AdminInvite model for admin user invitations
- Add MemberInvite model for member user invitations
- Add EmailVerification model for email verification workflow
- Support token-based invitation and verification system
```

**Commands:**
```bash
git add models/admin_invite.py models/member_invite.py models/email_verification.py models/__init__.py
git commit -m "feat: add invitation and email verification models

- Add AdminInvite model for admin user invitations
- Add MemberInvite model for member user invitations
- Add EmailVerification model for email verification workflow
- Support token-based invitation and verification system"
```

#### Step 2.8: Add Audit Log Model
**Files:**
- `models/audit_log.py`
- `models/__init__.py` (update)

**Commit Message:**
```
feat: add audit log model for system activity tracking

- Add AuditLog model for tracking user actions and system events
- Support action types, entity tracking, and change history
- Enable comprehensive audit trail for compliance
```

**Commands:**
```bash
git add models/audit_log.py models/__init__.py
git commit -m "feat: add audit log model for system activity tracking

- Add AuditLog model for tracking user actions and system events
- Support action types, entity tracking, and change history
- Enable comprehensive audit trail for compliance"
```

#### Step 2.9: Add Database Migrations
**Files:**
- `migrations/__init__.py`
- `migrations/add_contract_periods.py`
- `migrations/add_is_parent_project.py`
- `migrations/add_project_contract_file.py`
- `migrations/run_migration.py`
- `migrations/sync_database_schema.py`
- `db/add_created_by_user_id.sql`
- `db/add_requires_password_change.sql`
- `db/fix_transaction_issue.sql`

**Commit Message:**
```
feat: add database migration scripts

- Add migration scripts for contract periods
- Add migration for parent project support
- Add migration for project contract file attachments
- Add database schema synchronization utilities
- Add SQL scripts for schema updates
```

**Commands:**
```bash
git add migrations/ db/*.sql
git commit -m "feat: add database migration scripts

- Add migration scripts for contract periods
- Add migration for parent project support
- Add migration for project contract file attachments
- Add database schema synchronization utilities
- Add SQL scripts for schema updates"
```

#### Step 2.10: Tag Database Models Module
**Commands:**
```bash
git tag -a v1.1.0-database-models -m "Database models and infrastructure complete"
```

#### Step 2.11: Merge Database Models to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/database-models -m "Merge feature/database-models: complete database infrastructure and models"
```

---

### Phase 3: Authentication and Security

#### Step 3.1: Create Authentication Branch
**Branch:** `feature/authentication`

**Commands:**
```bash
git checkout -b feature/authentication
```

#### Step 3.2: Add Security Utilities
**Files:**
- `core/security.py`

**Commit Message:**
```
feat: add security utilities for authentication

- Add password hashing and verification using bcrypt
- Add JWT token creation and validation
- Add access token and refresh token generation
- Add password reset token functionality
- Add temporary password generation
```

**Commands:**
```bash
git add core/security.py
git commit -m "feat: add security utilities for authentication

- Add password hashing and verification using bcrypt
- Add JWT token creation and validation
- Add access token and refresh token generation
- Add password reset token functionality
- Add temporary password generation"
```

#### Step 3.3: Add Authentication Dependencies
**Files:**
- `core/deps.py`

**Commit Message:**
```
feat: add FastAPI dependencies for authentication

- Add OAuth2 password bearer scheme
- Add get_current_user dependency
- Add role-based access control dependencies
- Add admin and group access requirements
```

**Commands:**
```bash
git add core/deps.py
git commit -m "feat: add FastAPI dependencies for authentication

- Add OAuth2 password bearer scheme
- Add get_current_user dependency
- Add role-based access control dependencies
- Add admin and group access requirements"
```

#### Step 3.4: Add Authentication Service
**Files:**
- `services/auth_service.py`
- `services/__init__.py` (update)

**Commit Message:**
```
feat: add authentication service

- Add user login and token generation
- Add password reset functionality
- Add token refresh mechanism
- Add user registration support
```

**Commands:**
```bash
git add services/auth_service.py services/__init__.py
git commit -m "feat: add authentication service

- Add user login and token generation
- Add password reset functionality
- Add token refresh mechanism
- Add user registration support"
```

#### Step 3.5: Add OAuth Service
**Files:**
- `services/oauth_service.py`
- `services/__init__.py` (update)

**Commit Message:**
```
feat: add OAuth service for Google authentication

- Add Google OAuth integration
- Add OAuth callback handling
- Add user creation from OAuth provider
- Support seamless OAuth login flow
```

**Commands:**
```bash
git add services/oauth_service.py services/__init__.py
git commit -m "feat: add OAuth service for Google authentication

- Add Google OAuth integration
- Add OAuth callback handling
- Add user creation from OAuth provider
- Support seamless OAuth login flow"
```

#### Step 3.6: Add Authentication Endpoints
**Files:**
- `api/v1/endpoints/auth.py`
- `api/v1/endpoints/oauth.py`
- `api/v1/endpoints/__init__.py` (update)

**Commit Message:**
```
feat: add authentication API endpoints

- Add login endpoint with token generation
- Add password reset endpoints
- Add token refresh endpoint
- Add Google OAuth endpoints
- Add user registration endpoint
```

**Commands:**
```bash
git add api/v1/endpoints/auth.py api/v1/endpoints/oauth.py api/v1/endpoints/__init__.py
git commit -m "feat: add authentication API endpoints

- Add login endpoint with token generation
- Add password reset endpoints
- Add token refresh endpoint
- Add Google OAuth endpoints
- Add user registration endpoint"
```

#### Step 3.7: Tag Authentication Module
**Commands:**
```bash
git tag -a v1.2.0-authentication -m "Authentication and security complete"
```

#### Step 3.8: Merge Authentication to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/authentication -m "Merge feature/authentication: complete authentication and security system"
```

---

### Phase 4: User Management

#### Step 4.1: Create User Management Branch
**Branch:** `feature/user-management`

**Commands:**
```bash
git checkout -b feature/user-management
```

#### Step 4.2: Add User Repository
**Files:**
- `repositories/user_repository.py`
- `repositories/__init__.py` (update)

**Commit Message:**
```
feat: add user repository for data access

- Add CRUD operations for user management
- Add user search and filtering
- Add role and group-based queries
- Support user activation and deactivation
```

**Commands:**
```bash
git add repositories/user_repository.py repositories/__init__.py
git commit -m "feat: add user repository for data access

- Add CRUD operations for user management
- Add user search and filtering
- Add role and group-based queries
- Support user activation and deactivation"
```

#### Step 4.3: Add User Service
**Files:**
- No separate user service (may be in auth_service or project_service)

**Note:** If user service exists separately, add it here. Otherwise, proceed to next step.

#### Step 4.4: Add User Schemas
**Files:**
- `schemas/user.py`
- `schemas/__init__.py` (update)

**Commit Message:**
```
feat: add user Pydantic schemas

- Add user creation and update schemas
- Add user response schemas
- Add password change schemas
- Support user profile management
```

**Commands:**
```bash
git add schemas/user.py schemas/__init__.py
git commit -m "feat: add user Pydantic schemas

- Add user creation and update schemas
- Add user response schemas
- Add password change schemas
- Support user profile management"
```

#### Step 4.5: Add User Endpoints
**Files:**
- `api/v1/endpoints/users.py`
- `api/v1/endpoints/__init__.py` (update)

**Commit Message:**
```
feat: add user management API endpoints

- Add user CRUD endpoints
- Add user profile management
- Add password change endpoint
- Add user activation/deactivation
- Support role and group management
```

**Commands:**
```bash
git add api/v1/endpoints/users.py api/v1/endpoints/__init__.py
git commit -m "feat: add user management API endpoints

- Add user CRUD endpoints
- Add user profile management
- Add password change endpoint
- Add user activation/deactivation
- Support role and group management"
```

#### Step 4.6: Add Admin Invite System
**Files:**
- `repositories/admin_invite_repository.py`
- `services/admin_invite_service.py`
- `schemas/admin_invite.py`
- `api/v1/endpoints/admin_invites.py`
- Update `repositories/__init__.py`, `services/__init__.py`, `schemas/__init__.py`, `api/v1/endpoints/__init__.py`

**Commit Message:**
```
feat: add admin invitation system

- Add AdminInvite repository and service
- Add admin invitation creation and validation
- Add admin invitation API endpoints
- Support token-based admin invitations
```

**Commands:**
```bash
git add repositories/admin_invite_repository.py services/admin_invite_service.py schemas/admin_invite.py api/v1/endpoints/admin_invites.py repositories/__init__.py services/__init__.py schemas/__init__.py api/v1/endpoints/__init__.py
git commit -m "feat: add admin invitation system

- Add AdminInvite repository and service
- Add admin invitation creation and validation
- Add admin invitation API endpoints
- Support token-based admin invitations"
```

#### Step 4.7: Add Member Invite System
**Files:**
- `repositories/member_invite_repository.py`
- `services/member_invite_service.py`
- `schemas/member_invite.py`
- `api/v1/endpoints/member_invites.py`
- Update `repositories/__init__.py`, `services/__init__.py`, `schemas/__init__.py`, `api/v1/endpoints/__init__.py`

**Commit Message:**
```
feat: add member invitation system

- Add MemberInvite repository and service
- Add member invitation creation and validation
- Add member invitation API endpoints
- Support group-based member invitations
```

**Commands:**
```bash
git add repositories/member_invite_repository.py services/member_invite_service.py schemas/member_invite.py api/v1/endpoints/member_invites.py repositories/__init__.py services/__init__.py schemas/__init__.py api/v1/endpoints/__init__.py
git commit -m "feat: add member invitation system

- Add MemberInvite repository and service
- Add member invitation creation and validation
- Add member invitation API endpoints
- Support group-based member invitations"
```

#### Step 4.8: Add Email Verification System
**Files:**
- `repositories/email_verification_repository.py`
- `schemas/email_verification.py`
- `api/v1/endpoints/email_verification.py`
- Update `repositories/__init__.py`, `schemas/__init__.py`, `api/v1/endpoints/__init__.py`

**Commit Message:**
```
feat: add email verification system

- Add EmailVerification repository
- Add email verification token generation
- Add email verification API endpoints
- Support email verification workflow
```

**Commands:**
```bash
git add repositories/email_verification_repository.py schemas/email_verification.py api/v1/endpoints/email_verification.py repositories/__init__.py schemas/__init__.py api/v1/endpoints/__init__.py
git commit -m "feat: add email verification system

- Add EmailVerification repository
- Add email verification token generation
- Add email verification API endpoints
- Support email verification workflow"
```

#### Step 4.9: Tag User Management Module
**Commands:**
```bash
git tag -a v1.3.0-user-management -m "User management system complete"
```

#### Step 4.10: Merge User Management to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/user-management -m "Merge feature/user-management: complete user management system"
```

---

### Phase 5: Project Management

#### Step 5.1: Create Project Management Branch
**Branch:** `feature/project-management`

**Commands:**
```bash
git checkout -b feature/project-management
```

#### Step 5.2: Add Project Repositories
**Files:**
- `repositories/project_repository.py`
- `repositories/budget_repository.py`
- `repositories/category_repository.py`
- `repositories/contract_period_repository.py`
- `repositories/fund_repository.py`
- Update `repositories/__init__.py`

**Commit Message:**
```
feat: add project management repositories

- Add ProjectRepository for project CRUD operations
- Add BudgetRepository for budget management
- Add CategoryRepository for category management
- Add ContractPeriodRepository for contract lifecycle
- Add FundRepository for fund tracking
```

**Commands:**
```bash
git add repositories/project_repository.py repositories/budget_repository.py repositories/category_repository.py repositories/contract_period_repository.py repositories/fund_repository.py repositories/__init__.py
git commit -m "feat: add project management repositories

- Add ProjectRepository for project CRUD operations
- Add BudgetRepository for budget management
- Add CategoryRepository for category management
- Add ContractPeriodRepository for contract lifecycle
- Add FundRepository for fund tracking"
```

#### Step 5.3: Add Project Services
**Files:**
- `services/project_service.py`
- `services/budget_service.py`
- `services/contract_period_service.py`
- `services/fund_service.py`
- Update `services/__init__.py`

**Commit Message:**
```
feat: add project management services

- Add ProjectService for project business logic
- Add BudgetService for budget calculations
- Add ContractPeriodService for contract renewal
- Add FundService for fund management
```

**Commands:**
```bash
git add services/project_service.py services/budget_service.py services/contract_period_service.py services/fund_service.py services/__init__.py
git commit -m "feat: add project management services

- Add ProjectService for project business logic
- Add BudgetService for budget calculations
- Add ContractPeriodService for contract renewal
- Add FundService for fund management"
```

#### Step 5.4: Add Project Schemas
**Files:**
- `schemas/project.py`
- `schemas/budget.py`
- `schemas/category.py`
- `schemas/fund.py`
- Update `schemas/__init__.py`

**Commit Message:**
```
feat: add project management Pydantic schemas

- Add project creation and update schemas
- Add budget schemas for financial planning
- Add category schemas for transaction categorization
- Add fund schemas for fund tracking
```

**Commands:**
```bash
git add schemas/project.py schemas/budget.py schemas/category.py schemas/fund.py schemas/__init__.py
git commit -m "feat: add project management Pydantic schemas

- Add project creation and update schemas
- Add budget schemas for financial planning
- Add category schemas for transaction categorization
- Add fund schemas for fund tracking"
```

#### Step 5.5: Add Project Endpoints
**Files:**
- `api/v1/endpoints/projects.py`
- `api/v1/endpoints/budgets.py`
- `api/v1/endpoints/categories.py`
- Update `api/v1/endpoints/__init__.py`

**Commit Message:**
```
feat: add project management API endpoints

- Add project CRUD endpoints
- Add budget management endpoints
- Add category management endpoints
- Support project hierarchy and contract management
```

**Commands:**
```bash
git add api/v1/endpoints/projects.py api/v1/endpoints/budgets.py api/v1/endpoints/categories.py api/v1/endpoints/__init__.py
git commit -m "feat: add project management API endpoints

- Add project CRUD endpoints
- Add budget management endpoints
- Add category management endpoints
- Support project hierarchy and contract management"
```

#### Step 5.6: Tag Project Management Module
**Commands:**
```bash
git tag -a v1.4.0-project-management -m "Project management system complete"
```

#### Step 5.7: Merge Project Management to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/project-management -m "Merge feature/project-management: complete project management system"
```

---

### Phase 6: Transaction System

#### Step 6.1: Create Transaction System Branch
**Branch:** `feature/transaction-system`

**Commands:**
```bash
git checkout -b feature/transaction-system
```

#### Step 6.2: Add Transaction Repositories
**Files:**
- `repositories/transaction_repository.py`
- `repositories/recurring_transaction_repository.py`
- `repositories/deleted_recurring_instance_repository.py`
- Update `repositories/__init__.py`

**Commit Message:**
```
feat: add transaction repositories

- Add TransactionRepository for transaction CRUD
- Add RecurringTransactionRepository for templates
- Add DeletedRecurringInstanceRepository for tracking
- Support transaction filtering and aggregation
```

**Commands:**
```bash
git add repositories/transaction_repository.py repositories/recurring_transaction_repository.py repositories/deleted_recurring_instance_repository.py repositories/__init__.py
git commit -m "feat: add transaction repositories

- Add TransactionRepository for transaction CRUD
- Add RecurringTransactionRepository for templates
- Add DeletedRecurringInstanceRepository for tracking
- Support transaction filtering and aggregation"
```

#### Step 6.3: Add Transaction Services
**Files:**
- `services/transaction_service.py`
- `services/recurring_transaction_service.py`
- `services/recurring_transaction_scheduler.py`
- `services/recurring_transaction_background.py`
- Update `services/__init__.py`

**Commit Message:**
```
feat: add transaction services and schedulers

- Add TransactionService for transaction business logic
- Add RecurringTransactionService for automated transactions
- Add recurring transaction scheduler for daily generation
- Add background task for transaction processing
```

**Commands:**
```bash
git add services/transaction_service.py services/recurring_transaction_service.py services/recurring_transaction_scheduler.py services/recurring_transaction_background.py services/__init__.py
git commit -m "feat: add transaction services and schedulers

- Add TransactionService for transaction business logic
- Add RecurringTransactionService for automated transactions
- Add recurring transaction scheduler for daily generation
- Add background task for transaction processing"
```

#### Step 6.4: Add Transaction Schemas
**Files:**
- `schemas/transaction.py`
- `schemas/recurring_transaction.py`
- Update `schemas/__init__.py`

**Commit Message:**
```
feat: add transaction Pydantic schemas

- Add transaction creation and update schemas
- Add recurring transaction template schemas
- Support transaction attachments and categorization
```

**Commands:**
```bash
git add schemas/transaction.py schemas/recurring_transaction.py schemas/__init__.py
git commit -m "feat: add transaction Pydantic schemas

- Add transaction creation and update schemas
- Add recurring transaction template schemas
- Support transaction attachments and categorization"
```

#### Step 6.5: Add Transaction Endpoints
**Files:**
- `api/v1/endpoints/transactions.py`
- `api/v1/endpoints/recurring_transactions.py`
- Update `api/v1/endpoints/__init__.py`

**Commit Message:**
```
feat: add transaction API endpoints

- Add transaction CRUD endpoints
- Add recurring transaction management endpoints
- Support transaction file uploads
- Add transaction filtering and search
```

**Commands:**
```bash
git add api/v1/endpoints/transactions.py api/v1/endpoints/recurring_transactions.py api/v1/endpoints/__init__.py
git commit -m "feat: add transaction API endpoints

- Add transaction CRUD endpoints
- Add recurring transaction management endpoints
- Support transaction file uploads
- Add transaction filtering and search"
```

#### Step 6.6: Add Recurring Transaction Management
**Files:**
- `management/recurring_transactions.py`
- `management/__init__.py`

**Commit Message:**
```
feat: add recurring transaction management script

- Add CLI script for managing recurring transactions
- Support manual transaction generation
- Add transaction cleanup utilities
```

**Commands:**
```bash
git add management/recurring_transactions.py management/__init__.py
git commit -m "feat: add recurring transaction management script

- Add CLI script for managing recurring transactions
- Support manual transaction generation
- Add transaction cleanup utilities"
```

#### Step 6.7: Tag Transaction System Module
**Commands:**
```bash
git tag -a v1.5.0-transaction-system -m "Transaction system complete"
```

#### Step 6.8: Merge Transaction System to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/transaction-system -m "Merge feature/transaction-system: complete transaction system"
```

---

### Phase 7: Supplier Management

#### Step 7.1: Create Supplier Management Branch
**Branch:** `feature/supplier-management`

**Commands:**
```bash
git checkout -b feature/supplier-management
```

#### Step 7.2: Add Supplier Repositories
**Files:**
- `repositories/supplier_repository.py`
- `repositories/supplier_document_repository.py`
- Update `repositories/__init__.py`

**Commit Message:**
```
feat: add supplier repositories

- Add SupplierRepository for supplier CRUD
- Add SupplierDocumentRepository for document management
- Support supplier search and filtering
```

**Commands:**
```bash
git add repositories/supplier_repository.py repositories/supplier_document_repository.py repositories/__init__.py
git commit -m "feat: add supplier repositories

- Add SupplierRepository for supplier CRUD
- Add SupplierDocumentRepository for document management
- Support supplier search and filtering"
```

#### Step 7.3: Add Supplier Service
**Files:**
- `services/supplier_service.py`
- Update `services/__init__.py`

**Commit Message:**
```
feat: add supplier service

- Add SupplierService for supplier business logic
- Support supplier document management
- Add supplier validation and processing
```

**Commands:**
```bash
git add services/supplier_service.py services/__init__.py
git commit -m "feat: add supplier service

- Add SupplierService for supplier business logic
- Support supplier document management
- Add supplier validation and processing"
```

#### Step 7.4: Add Supplier Schemas
**Files:**
- `schemas/supplier.py`
- Update `schemas/__init__.py`

**Commit Message:**
```
feat: add supplier Pydantic schemas

- Add supplier creation and update schemas
- Add supplier document schemas
- Support supplier contact and tax information
```

**Commands:**
```bash
git add schemas/supplier.py schemas/__init__.py
git commit -m "feat: add supplier Pydantic schemas

- Add supplier creation and update schemas
- Add supplier document schemas
- Support supplier contact and tax information"
```

#### Step 7.5: Add Supplier Endpoints
**Files:**
- `api/v1/endpoints/suppliers.py`
- Update `api/v1/endpoints/__init__.py`

**Commit Message:**
```
feat: add supplier management API endpoints

- Add supplier CRUD endpoints
- Add supplier document upload endpoints
- Support supplier search and filtering
```

**Commands:**
```bash
git add api/v1/endpoints/suppliers.py api/v1/endpoints/__init__.py
git commit -m "feat: add supplier management API endpoints

- Add supplier CRUD endpoints
- Add supplier document upload endpoints
- Support supplier search and filtering"
```

#### Step 7.6: Tag Supplier Management Module
**Commands:**
```bash
git tag -a v1.6.0-supplier-management -m "Supplier management system complete"
```

#### Step 7.7: Merge Supplier Management to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/supplier-management -m "Merge feature/supplier-management: complete supplier management system"
```

---

### Phase 8: Reporting System

#### Step 8.1: Create Reporting Branch
**Branch:** `feature/reporting`

**Commands:**
```bash
git checkout -b feature/reporting
```

#### Step 8.2: Add Reporting Services
**Files:**
- `services/report_service.py`
- `services/report_service_new.py`
- `services/financial_aggregation_service.py`
- `services/audit_service.py`
- Update `services/__init__.py`

**Commit Message:**
```
feat: add reporting and audit services

- Add ReportService for financial reporting
- Add FinancialAggregationService for data aggregation
- Add AuditService for audit log management
- Support profitability and budget comparison reports
```

**Commands:**
```bash
git add services/report_service.py services/report_service_new.py services/financial_aggregation_service.py services/audit_service.py services/__init__.py
git commit -m "feat: add reporting and audit services

- Add ReportService for financial reporting
- Add FinancialAggregationService for data aggregation
- Add AuditService for audit log management
- Support profitability and budget comparison reports"
```

#### Step 8.3: Add Audit Repository
**Files:**
- `repositories/audit_repository.py`
- Update `repositories/__init__.py`

**Commit Message:**
```
feat: add audit repository

- Add AuditRepository for audit log data access
- Support audit log filtering and querying
- Enable comprehensive audit trail access
```

**Commands:**
```bash
git add repositories/audit_repository.py repositories/__init__.py
git commit -m "feat: add audit repository

- Add AuditRepository for audit log data access
- Support audit log filtering and querying
- Enable comprehensive audit trail access"
```

#### Step 8.4: Add Reporting Schemas
**Files:**
- `schemas/report.py`
- `schemas/audit_log.py`
- Update `schemas/__init__.py`

**Commit Message:**
```
feat: add reporting Pydantic schemas

- Add report request and response schemas
- Add audit log schemas
- Support various report types and formats
```

**Commands:**
```bash
git add schemas/report.py schemas/audit_log.py schemas/__init__.py
git commit -m "feat: add reporting Pydantic schemas

- Add report request and response schemas
- Add audit log schemas
- Support various report types and formats"
```

#### Step 8.5: Add Reporting Endpoints
**Files:**
- `api/v1/endpoints/reports.py`
- `api/v1/endpoints/audit_logs.py`
- `api/v1/endpoints/financial_aggregation.py`
- Update `api/v1/endpoints/__init__.py`

**Commit Message:**
```
feat: add reporting API endpoints

- Add report generation endpoints
- Add audit log query endpoints
- Add financial aggregation endpoints
- Support export and download functionality
```

**Commands:**
```bash
git add api/v1/endpoints/reports.py api/v1/endpoints/audit_logs.py api/v1/endpoints/financial_aggregation.py api/v1/endpoints/__init__.py
git commit -m "feat: add reporting API endpoints

- Add report generation endpoints
- Add audit log query endpoints
- Add financial aggregation endpoints
- Support export and download functionality"
```

#### Step 8.6: Tag Reporting Module
**Commands:**
```bash
git tag -a v1.7.0-reporting -m "Reporting system complete"
```

#### Step 8.7: Merge Reporting to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/reporting -m "Merge feature/reporting: complete reporting and audit system"
```

---

### Phase 9: File Management

#### Step 9.1: Create File Management Branch
**Branch:** `feature/file-management`

**Commands:**
```bash
git checkout -b feature/file-management
```

#### Step 9.2: Add S3 Service
**Files:**
- `services/s3_service.py`
- Update `services/__init__.py`

**Commit Message:**
```
feat: add AWS S3 service for file storage

- Add S3 file upload and download functionality
- Add file deletion and URL generation
- Support public and private file access
- Configure S3 bucket integration
```

**Commands:**
```bash
git add services/s3_service.py services/__init__.py
git commit -m "feat: add AWS S3 service for file storage

- Add S3 file upload and download functionality
- Add file deletion and URL generation
- Support public and private file access
- Configure S3 bucket integration"
```

#### Step 9.3: Tag File Management Module
**Commands:**
```bash
git tag -a v1.8.0-file-management -m "File management system complete"
```

#### Step 9.4: Merge File Management to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/file-management -m "Merge feature/file-management: complete file management system"
```

---

### Phase 10: Email Service

#### Step 10.1: Create Email Service Branch
**Branch:** `feature/email-service`

**Commands:**
```bash
git checkout -b feature/email-service
```

#### Step 10.2: Add Email Service
**Files:**
- `services/email_service.py`
- Update `services/__init__.py`

**Commit Message:**
```
feat: add email service for notifications

- Add SMTP email sending functionality
- Add email template support
- Add invitation and verification email sending
- Support HTML and plain text emails
```

**Commands:**
```bash
git add services/email_service.py services/__init__.py
git commit -m "feat: add email service for notifications

- Add SMTP email sending functionality
- Add email template support
- Add invitation and verification email sending
- Support HTML and plain text emails"
```

#### Step 10.3: Tag Email Service Module
**Commands:**
```bash
git tag -a v1.9.0-email-service -m "Email service complete"
```

#### Step 10.4: Merge Email Service to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/email-service -m "Merge feature/email-service: complete email notification system"
```

---

### Phase 11: API Infrastructure

#### Step 11.1: Create API Infrastructure Branch
**Branch:** `feature/api-infrastructure`

**Commands:**
```bash
git checkout -b feature/api-infrastructure
```

#### Step 11.2: Add API Router
**Files:**
- `api/__init__.py`
- `api/v1/__init__.py`
- `api/v1/router.py`

**Commit Message:**
```
feat: add API router configuration

- Add API v1 router with all endpoint registrations
- Configure route prefixes and tags
- Organize endpoints by feature modules
```

**Commands:**
```bash
git add api/__init__.py api/v1/__init__.py api/v1/router.py
git commit -m "feat: add API router configuration

- Add API v1 router with all endpoint registrations
- Configure route prefixes and tags
- Organize endpoints by feature modules"
```

#### Step 11.3: Add Main Application
**Files:**
- `main.py`
- `__init__.py`

**Commit Message:**
```
feat: add FastAPI main application

- Add FastAPI app initialization with CORS middleware
- Add exception handlers for errors
- Add static file serving for uploads
- Add health check endpoint
- Add SPA frontend serving support
- Configure OpenAPI documentation
```

**Commands:**
```bash
git add main.py __init__.py
git commit -m "feat: add FastAPI main application

- Add FastAPI app initialization with CORS middleware
- Add exception handlers for errors
- Add static file serving for uploads
- Add health check endpoint
- Add SPA frontend serving support
- Configure OpenAPI documentation"
```

#### Step 11.4: Tag API Infrastructure Module
**Commands:**
```bash
git tag -a v1.10.0-api-infrastructure -m "API infrastructure complete"
```

#### Step 11.5: Merge API Infrastructure to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/api-infrastructure -m "Merge feature/api-infrastructure: complete API infrastructure"
```

---

### Phase 12: Background Tasks

#### Step 12.1: Create Background Tasks Branch
**Branch:** `feature/background-tasks`

**Commands:**
```bash
git checkout -b feature/background-tasks
```

#### Step 12.2: Add Background Task Schedulers
**Files:**
- Update `main.py` with background task functions

**Note:** The background tasks are already in main.py. We'll document them here.

**Commit Message:**
```
feat: add background task schedulers

- Add recurring transaction scheduler for daily generation
- Add contract renewal scheduler for automatic renewals
- Configure async background task execution
- Add error handling and retry logic
```

**Commands:**
```bash
# The background tasks are already in main.py from previous merge
# This commit documents the background task functionality
git add main.py
git commit -m "feat: add background task schedulers

- Add recurring transaction scheduler for daily generation
- Add contract renewal scheduler for automatic renewals
- Configure async background task execution
- Add error handling and retry logic"
```

#### Step 12.3: Tag Background Tasks Module
**Commands:**
```bash
git tag -a v1.11.0-background-tasks -m "Background tasks complete"
```

#### Step 12.4: Merge Background Tasks to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/background-tasks -m "Merge feature/background-tasks: complete background task system"
```

---

### Phase 13: Deployment Configuration

#### Step 13.1: Create Deployment Branch
**Branch:** `feature/deployment`

**Commands:**
```bash
git checkout -b feature/deployment
```

#### Step 13.2: Add Docker Configuration
**Files:**
- `Dockerfile`
- `docker-compose.yml`

**Commit Message:**
```
feat: add Docker and docker-compose configuration

- Add multi-stage Dockerfile for backend
- Configure PostgreSQL service in docker-compose
- Add health checks and volume management
- Configure environment variables and ports
```

**Commands:**
```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: add Docker and docker-compose configuration

- Add multi-stage Dockerfile for backend
- Configure PostgreSQL service in docker-compose
- Add health checks and volume management
- Configure environment variables and ports"
```

#### Step 13.3: Add Utility Scripts
**Files:**
- `scripts/create_admin.py`

**Commit Message:**
```
feat: add utility scripts

- Add admin user creation script
- Support CLI-based user management
```

**Commands:**
```bash
git add scripts/create_admin.py
git commit -m "feat: add utility scripts

- Add admin user creation script
- Support CLI-based user management"
```

#### Step 13.4: Tag Deployment Module
**Commands:**
```bash
git tag -a v1.12.0-deployment -m "Deployment configuration complete"
```

#### Step 13.5: Merge Deployment to Main
**Commands:**
```bash
git checkout main
git merge --no-ff feature/deployment -m "Merge feature/deployment: complete deployment configuration"
```

---

### Phase 14: Finalization

#### Step 14.1: Add .gitignore (if not exists)
**Files:**
- `.gitignore` (if needed)

**Commit Message:**
```
chore: add .gitignore for Python and project files

- Ignore Python cache and virtual environments
- Ignore database files and uploads
- Ignore IDE and OS-specific files
```

**Commands:**
```bash
# Check if .gitignore exists in parent directory
# If not, create one for backend
git add .gitignore
git commit -m "chore: add .gitignore for Python and project files

- Ignore Python cache and virtual environments
- Ignore database files and uploads
- Ignore IDE and OS-specific files"
```

#### Step 14.2: Final Tag
**Commands:**
```bash
git tag -a v2.0.0 -m "Complete project restructuring - all modules integrated"
```

#### Step 14.3: Create Summary
**Commands:**
```bash
# Generate branch summary
git log --oneline --graph --all --decorate > GIT_HISTORY.txt
```

---

## Summary

### Total Branches Created: 13
1. feature/foundation
2. feature/database-models
3. feature/authentication
4. feature/user-management
5. feature/project-management
6. feature/transaction-system
7. feature/supplier-management
8. feature/reporting
9. feature/file-management
10. feature/email-service
11. feature/api-infrastructure
12. feature/background-tasks
13. feature/deployment

### Total Tags Created: 14
- v1.0.0-foundation
- v1.1.0-database-models
- v1.2.0-authentication
- v1.3.0-user-management
- v1.4.0-project-management
- v1.5.0-transaction-system
- v1.6.0-supplier-management
- v1.7.0-reporting
- v1.8.0-file-management
- v1.9.0-email-service
- v1.10.0-api-infrastructure
- v1.11.0-background-tasks
- v1.12.0-deployment
- v2.0.0 (final)

### Commit Message Standards
All commits follow Conventional Commits:
- `feat:` - New features
- `fix:` - Bug fixes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `docs:` - Documentation
- `test:` - Tests

### Merge Strategy
All merges use `--no-ff` to preserve branch history and create merge commits.

---

## Execution Notes

1. **Zero Logic Loss**: All existing code is preserved exactly as-is, only reorganized into logical commits.

2. **Sequential Execution**: Each phase builds upon the previous, ensuring dependencies are met.

3. **Professional History**: Every commit has a descriptive message explaining what was added and why.

4. **Tagged Milestones**: Each major module is tagged for easy reference and rollback if needed.

5. **Clean Structure**: The final main branch will have a clear, linear history showing the project's evolution.

---

## Next Steps After Execution

1. Review the Git history: `git log --oneline --graph --all`
2. Verify all tags: `git tag -l`
3. Check branch structure: `git branch -a`
4. Create a release from the final tag: `git checkout v2.0.0`

---

**End of Plan**
