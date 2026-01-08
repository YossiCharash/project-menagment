// Mock JSON example for GET /dashboard-snapshot endpoint
export const mockDashboardSnapshot = {
  "projects": [
    {
      "id": 1,
      "name": "מגדל רמת גן",
      "description": "מגדל מגורים יוקרתי ברמת גן",
      "start_date": "2024-01-01",
      "end_date": null,
      "budget_monthly": 50000,
      "budget_annual": 600000,
      "num_residents": 120,
      "monthly_price_per_apartment": 3500,
      "address": "רחוב הרצל 15",
      "city": "רמת גן",
      "relation_project": null,
      "is_active": true,
      "manager_id": 1,
      "created_at": "2024-01-01T00:00:00Z",
      "total_value": 15000,
      "children": [
        {
          "id": 2,
          "name": "מגדל רמת גן - בניין א'",
          "description": "בניין מגורים ראשי",
          "start_date": "2024-01-01",
          "end_date": null,
          "budget_monthly": 25000,
          "budget_annual": 300000,
          "num_residents": 60,
          "monthly_price_per_apartment": 3500,
          "address": "רחוב הרצל 15",
          "city": "רמת גן",
          "relation_project": 1,
          "is_active": true,
          "manager_id": 1,
          "created_at": "2024-01-01T00:00:00Z",
          "total_value": 8000,
          "children": [],
          "income_month_to_date": 210000,
          "expense_month_to_date": 202000,
          "profit_percent": 3.8,
          "status_color": "green"
        },
        {
          "id": 3,
          "name": "מגדל רמת גן - בניין ב'",
          "description": "בניין מגורים משני",
          "start_date": "2024-01-01",
          "end_date": null,
          "budget_monthly": 25000,
          "budget_annual": 300000,
          "num_residents": 60,
          "monthly_price_per_apartment": 3500,
          "address": "רחוב הרצל 15",
          "city": "רמת גן",
          "relation_project": 1,
          "is_active": true,
          "manager_id": 1,
          "created_at": "2024-01-01T00:00:00Z",
          "total_value": 7000,
          "children": [],
          "income_month_to_date": 210000,
          "expense_month_to_date": 203000,
          "profit_percent": 3.3,
          "status_color": "green"
        }
      ],
      "income_month_to_date": 420000,
      "expense_month_to_date": 405000,
      "profit_percent": 3.6,
      "status_color": "green"
    },
    {
      "id": 4,
      "name": "קומפלקס תל אביב",
      "description": "קומפלקס מגורים במרכז תל אביב",
      "start_date": "2024-02-01",
      "end_date": null,
      "budget_monthly": 75000,
      "budget_annual": 900000,
      "num_residents": 200,
      "monthly_price_per_apartment": 4500,
      "address": "רחוב דיזנגוף 100",
      "city": "תל אביב",
      "relation_project": null,
      "is_active": true,
      "manager_id": 2,
      "created_at": "2024-02-01T00:00:00Z",
      "total_value": -5000,
      "children": [
        {
          "id": 5,
          "name": "קומפלקס תל אביב - מגדל צפון",
          "description": "מגדל מגורים צפוני",
          "start_date": "2024-02-01",
          "end_date": null,
          "budget_monthly": 40000,
          "budget_annual": 480000,
          "num_residents": 100,
          "monthly_price_per_apartment": 4500,
          "address": "רחוב דיזנגוף 100",
          "city": "תל אביב",
          "relation_project": 4,
          "is_active": true,
          "manager_id": 2,
          "created_at": "2024-02-01T00:00:00Z",
          "total_value": 2000,
          "children": [],
          "income_month_to_date": 450000,
          "expense_month_to_date": 448000,
          "profit_percent": 0.4,
          "status_color": "yellow"
        },
        {
          "id": 6,
          "name": "קומפלקס תל אביב - מגדל דרום",
          "description": "מגדל מגורים דרומי",
          "start_date": "2024-02-01",
          "end_date": null,
          "budget_monthly": 35000,
          "budget_annual": 420000,
          "num_residents": 100,
          "monthly_price_per_apartment": 4500,
          "address": "רחוב דיזנגוף 100",
          "city": "תל אביב",
          "relation_project": 4,
          "is_active": true,
          "manager_id": 2,
          "created_at": "2024-02-01T00:00:00Z",
          "total_value": -7000,
          "children": [],
          "income_month_to_date": 450000,
          "expense_month_to_date": 457000,
          "profit_percent": -1.6,
          "status_color": "red"
        }
      ],
      "income_month_to_date": 900000,
      "expense_month_to_date": 905000,
      "profit_percent": -0.6,
      "status_color": "yellow"
    },
    {
      "id": 7,
      "name": "מתחם חיפה",
      "description": "מתחם מגורים בחיפה",
      "start_date": "2024-03-01",
      "end_date": null,
      "budget_monthly": 30000,
      "budget_annual": 360000,
      "num_residents": 80,
      "monthly_price_per_apartment": 2800,
      "address": "רחוב הרצל 50",
      "city": "חיפה",
      "relation_project": null,
      "is_active": true,
      "manager_id": 3,
      "created_at": "2024-03-01T00:00:00Z",
      "total_value": -12000,
      "children": [],
      "income_month_to_date": 224000,
      "expense_month_to_date": 236000,
      "profit_percent": -5.4,
      "status_color": "red"
    }
  ],
  "alerts": {
    "budget_overrun": [6, 7],
    "missing_proof": [2, 5],
    "unpaid_recurring": [3, 6]
  },
  "summary": {
    "total_income": 1544000,
    "total_expense": 1546000,
    "total_profit": -2000
  }
}

// Example API request/response for creating a sub-project
export const createSubProjectExample = {
  request: {
    method: "POST",
    url: "/projects",
    body: {
      "name": "מגדל רמת גן - בניין ג'",
      "description": "בניין מגורים נוסף",
      "start_date": "2024-06-01",
      "budget_monthly": 20000,
      "budget_annual": 240000,
      "num_residents": 50,
      "monthly_price_per_apartment": 3500,
      "address": "רחוב הרצל 15",
      "city": "רמת גן",
      "relation_project": 1, // Parent project ID
      "manager_id": 1
    }
  },
  response: {
    "id": 8,
    "name": "מגדל רמת גן - בניין ג'",
    "description": "בניין מגורים נוסף",
    "start_date": "2024-06-01",
    "end_date": null,
    "budget_monthly": 20000,
    "budget_annual": 240000,
    "num_residents": 50,
    "monthly_price_per_apartment": 3500,
    "address": "רחוב הרצל 15",
    "city": "רמת גן",
    "relation_project": 1,
    "is_active": true,
    "manager_id": 1,
    "created_at": "2024-06-01T00:00:00Z",
    "total_value": 0
  }
}

// Example API request/response for creating an expense transaction
export const createExpenseTransactionExample = {
  request: {
    method: "POST",
    url: "/transactions",
    body: {
      "project_id": 2,
      "subproject_id": null,
      "tx_date": "2024-10-20",
      "type": "Expense",
      "amount": -1200, // Negative amount for expense
      "description": "חשבון חשמל",
      "category": "electricity",
      "notes": "חשבון חשמל חודש אוקטובר",
      "is_exceptional": false
    }
  },
  response: {
    "id": 101,
    "project_id": 2,
    "subproject_id": null,
    "tx_date": "2024-10-20",
    "type": "Expense",
    "amount": -1200,
    "description": "חשבון חשמל",
    "category": "electricity",
    "notes": "חשבון חשמל חודש אוקטובר",
    "is_exceptional": false,
    "file_path": null,
    "created_at": "2024-10-20T10:30:00Z"
  }
}

// Example API request/response for creating an income transaction
export const createIncomeTransactionExample = {
  request: {
    method: "POST",
    url: "/transactions",
    body: {
      "project_id": 2,
      "subproject_id": null,
      "tx_date": "2024-10-01",
      "type": "Income",
      "amount": 210000, // Positive amount for income
      "description": "דמי שכירות חודש אוקטובר",
      "category": "rent",
      "notes": "דמי שכירות מדיירים",
      "is_exceptional": false
    }
  },
  response: {
    "id": 102,
    "project_id": 2,
    "subproject_id": null,
    "tx_date": "2024-10-01",
    "type": "Income",
    "amount": 210000,
    "description": "דמי שכירות חודש אוקטובר",
    "category": "rent",
    "notes": "דמי שכירות מדיירים",
    "is_exceptional": false,
    "file_path": null,
    "created_at": "2024-10-01T09:00:00Z"
  }
}

// Required API endpoints summary
export const requiredEndpoints = {
  "GET /projects": {
    "description": "Get all projects with optional filtering",
    "query_params": {
      "include_archived": "boolean - include archived projects",
      "only_archived": "boolean - show only archived projects"
    },
    "response": "Array of Project objects"
  },
  "GET /projects/get_values/{project_id}": {
    "description": "Get project with financial calculations",
    "response": "Project object with calculated financial data"
  },
  "POST /projects": {
    "description": "Create new project (can be sub-project if relation_project is provided)",
    "body": "ProjectCreate object",
    "response": "Created Project object"
  },
  "PUT /projects/{project_id}": {
    "description": "Update existing project",
    "body": "Partial ProjectCreate object",
    "response": "Updated Project object"
  },
  "POST /projects/{project_id}/archive": {
    "description": "Archive project",
    "response": "Archived Project object"
  },
  "POST /projects/{project_id}/restore": {
    "description": "Restore archived project",
    "response": "Restored Project object"
  },
  "GET /transactions/project/{project_id}": {
    "description": "Get all transactions for a project",
    "response": "Array of Transaction objects"
  },
  "POST /transactions": {
    "description": "Create new transaction (expenses should be negative amounts)",
    "body": "TransactionCreate object",
    "response": "Created Transaction object"
  },
  "PUT /transactions/{transaction_id}": {
    "description": "Update existing transaction",
    "body": "Partial TransactionCreate object",
    "response": "Updated Transaction object"
  },
  "POST /transactions/{transaction_id}/upload": {
    "description": "Upload receipt file for transaction",
    "body": "multipart/form-data with file",
    "response": "Updated Transaction object with file_path"
  },
  "DELETE /transactions/{transaction_id}": {
    "description": "Delete transaction",
    "response": "Success confirmation"
  }
}
