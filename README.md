# BMS – Budget, Project & Inventory Management System

A comprehensive full-stack enterprise platform for managing construction projects: budgets, financial transactions, suppliers, price quotes, tasks, equipment/inventory, and role-based access control. Built with **FastAPI** on the backend and **React + TypeScript** on the frontend, backed by **PostgreSQL**.

> The UI is Hebrew (RTL), including Hebrew calendar support.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Core Features](#core-features)
  - [Authentication & Access Control (Auth & IAM)](#1-authentication--access-control-auth--iam)
  - [Projects & Subprojects](#2-projects--subprojects)
  - [Financial Transactions](#3-financial-transactions)
  - [Recurring Transactions](#4-recurring-transactions)
  - [Unforeseen Transactions](#5-unforeseen-transactions)
  - [Budgets & Categories](#6-budgets--categories)
  - [Suppliers & Documents](#7-suppliers--documents)
  - [Price Quotes](#8-price-quotes)
  - [Reports & Financial Aggregation](#9-reports--financial-aggregation)
  - [Task Management & Calendar](#10-task-management--calendar)
  - [Notifications](#11-notifications)
  - [CEMS – Equipment & Inventory Management](#12-cems--equipment--inventory-management)
  - [Audit Logs](#13-audit-logs)
  - [Observability & Monitoring](#14-observability--monitoring)
- [Installation & Running](#installation--running)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [API Conventions](#api-conventions)

---

## Architecture

The system follows a layered architecture with clear separation of concerns:

```
Routes (API)  →  Services (business logic)  →  Repositories  →  Models (SQLAlchemy)
```

- **Routes** – handle request/response only.
- **Services** – all business logic.
- **Repositories** – database access.
- **Messages / Configurations** – messages and configuration organized by topic.

The platform is composed of three main modules:
- **Core BMS** – projects, budgets, transactions, suppliers, price quotes, reports, tasks.
- **IAM** – role-based permissions engine (Identity & Access Management).
- **CEMS** – Company Equipment & Inventory Management System.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic |
| Database | PostgreSQL (asyncpg), Redis |
| Auth | JWT (PyJWT / python-jose), OAuth2 (Authlib), bcrypt/passlib |
| File storage | Local filesystem + AWS S3 (boto3) |
| Documents/Reports | ReportLab (PDF), openpyxl (Excel), matplotlib |
| Frontend | React 18, TypeScript, Vite, Redux Toolkit, React Router |
| UI | TailwindCSS, Radix UI, Framer Motion, Lucide Icons |
| Calendar | FullCalendar, @hebcal/core (Hebrew calendar), Leaflet (maps) |
| Charts | Recharts |
| Monitoring | Prometheus, Grafana, Alertmanager |
| Containerization | Docker, docker-compose |
| Testing | pytest (backend), Vitest + Testing Library (frontend) |

---

## Core Features

### 1. Authentication & Access Control (Auth & IAM)

- **Registration and login** based on JWT.
- **Email verification** during signup (`email-verification`).
- **OAuth2** – login via an external provider (`oauth`, callback).
- **Password reset** and enforced initial password change.
- **Admin invites** (`admin-invites`) and **member invites** (`member-invites`) via dedicated links.
- **IAM permissions engine** with three tiers:
  - **Global roles**: `SuperAdmin`, `Admin`, `Member`.
  - **Project-scoped roles**: `ProjectManager`, `ProjectContributor`, `ProjectViewer`.
  - **Resource-level permissions** (per-resource override).
- Four canonical actions: `READ`, `WRITE`, `UPDATE`, `DELETE` across all resource types (project, transaction, budget, report, user, supplier, task, quote, inventory, and more).
- Enforced both server-side (decorators/middleware) and client-side (`RequirePermission`, `RequireAnyPermission`).

### 2. Projects & Subprojects

- Create, edit, and delete projects.
- **Subprojects** and parent projects with hierarchy.
- Assign team members and roles per project.
- Project detail screen with financial and budget data.

### 3. Financial Transactions

- Record **income and expenses** for each project.
- Supported payment methods: standing order, credit, check, cash, bank transfer, centralized year-end collection.
- Attach files/documents to transactions.
- **Group transaction drafts** (`group-transaction-drafts`) – bulk entry of multiple transactions.

### 4. Recurring Transactions

- Define templates for recurring transactions (standing orders, etc.).
- **Background scheduler** that automatically generates transactions when due.
- Management of deleted instances (`deleted_recurring_instance`).
- Contract periods (`contract_period`) and a guard against duplicate renewals (`contract_renewal_guard`).

### 5. Unforeseen Transactions

- Separate handling of unforeseen expenses at the project level, outside the planned budget.

### 6. Budgets & Categories

- Define **budgets** for projects and categories.
- Custom **categories** for income/expenses.
- **Funds** management (`fund`).
- Budget-vs-actual tracking.

### 7. Suppliers & Documents

- Manage **suppliers** (details, contacts).
- **Per-supplier documents** (`supplier/documents`) – upload, view, and download.
- File storage locally or on S3.

### 8. Price Quotes

- Build **structured price quotes** with a hierarchy: buildings → floors → line items (`quote_building`, `quote_structure_item`, `quote_line`).
- **Quote subjects** (`quote_subjects`) and **quote projects** (`quote_projects`).
- Dedicated creation screen and detail screen.
- Custom price-quote settings.

### 9. Reports & Financial Aggregation

- **Profitability reports** and budget comparison.
- **Cross-project financial aggregation** (`financial-aggregation`).
- Export to **PDF** (ReportLab) and **Excel** (openpyxl), with Hebrew/RTL support (arabic-reshaper, python-bidi).
- Visual charts in the UI (Recharts).

### 10. Task Management & Calendar

- Manage **tasks** with statuses, attachments (`TaskAttachment`), and messages/comments (`TaskMessage`).
- **Calendar** (TaskCalendar) powered by FullCalendar with month/week/day/list views.
- **Hebrew calendar** support (@hebcal/core) and events.
- **Automatic archiving** of tasks (background scheduler).

### 11. Notifications

- In-app **user notification** system (`UserNotification`).
- Notification center (Notifications / messages tab within task management).
- Email notifications (email service) and operational alerts.

### 12. CEMS – Equipment & Inventory Management

A full module for managing company equipment and consumables:

- **Fixed Assets** – registration, tracking, and **retirement**.
- **Consumables** – stock levels, **stock movements**, consumption, and returns.
- **Warehouses** – warehouse and balance management.
- **Transfers** between warehouses/projects, including **transfer confirmation via an email link** (no login required; the JWT in the link authorizes the action).
- **Warehouse returns**.
- **Equipment categories**, **signatures**, and **documents**.
- **Inventory alerts** and **reorder requests** when stock drops below a threshold.
- Dedicated **inventory reports**.
- Equipment photo storage.

### 13. Audit Logs

- Automatic recording of sensitive operations (`audit_service`).
- Admin screen to view and filter audit logs.

### 14. Observability & Monitoring

- Dedicated **observability** layer (`core/observability.py`, configurations/observability).
- Monitoring stack: **Prometheus** (metrics + alerts), **Grafana** (dashboards), **Alertmanager**.
- Automatic log alerts, including optional WhatsApp alerts (`log_alert_handler`).
- Health check (`/health`).

---

## Installation & Running

### Prerequisites

- Python 3.12
- Node.js 18+
- PostgreSQL
- Redis (for queues/caching)
- Docker (optional, recommended)

### Run with Docker

```bash
# From the project root – brings up the server, database, and services
docker-compose -f backend/docker-compose.yml up --build
```

The monitoring stack (Prometheus/Grafana/Alertmanager) is configured under `monitoring/`.

### Manual Run – Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start the server
uvicorn backend.main:app --reload --port 8000
```

- Interactive API docs: `http://localhost:8000/docs` (Swagger) or `/redoc`.
- Health check: `http://localhost:8000/health`.

### Manual Run – Frontend

```bash
cd frontend
npm install
npm run dev        # development
npm run build      # production build
npm run preview    # preview the build
```

---

## Running Tests

```bash
# Backend (pytest)
cd backend
pytest

# Frontend (Vitest)
cd frontend
npm run test
npm run test:coverage   # with coverage report
```

---

## Project Structure

```
backend/
├── main.py                  # Entry point – assembles the FastAPI app
├── api/v1/
│   ├── router.py            # Aggregates all routers
│   └── endpoints/           # Endpoints organized by topic
├── services/                # Business logic
├── repositories/            # Data access
├── models/                  # SQLAlchemy models
├── schemas/                 # Pydantic schemas
├── messages/                # Messages organized by topic
├── configurations/          # Configuration organized by topic
├── core/                    # Config, schedulers, exceptions, observability
├── iam/                     # Permissions engine (Identity & Access Management)
└── cems/                    # Equipment & Inventory Management System
    ├── api/  models/  services/  repositories/  schemas/  messages/

frontend/
└── src/
    ├── pages/               # Application screens
    ├── components/          # UI components
    ├── store/               # Redux (slices)
    ├── lib/                 # API client, utils
    └── types/               # TypeScript types

monitoring/                  # Prometheus, Grafana, Alertmanager
```

---

## API Conventions

- All APIs return JSON.
- Proper use of HTTP status codes.
- Unified error format:

```json
{
  "error": "message"
}
```
