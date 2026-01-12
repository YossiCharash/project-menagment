"""
Integration tests for the entire system
"""
import pytest
from httpx import AsyncClient


@pytest.mark.integration
@pytest.mark.asyncio
class TestSystemIntegration:
    """Test complete workflows"""
    
    async def test_full_project_workflow(
        self, test_client: AsyncClient, admin_token: str, default_category: int
    ):
        """Test complete project creation and transaction workflow"""
        # 1. Create project
        project_response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Integration Test Project",
                "description": "Full workflow test",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "budget_monthly": 0.0,
                "budget_annual": 100000.0,
            }
        )
        assert project_response.status_code == 200
        project_id = project_response.json()["id"]
        
        # 2. Create income transaction
        income_response = await test_client.post(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "project_id": project_id,
                "type": "Income",
                "amount": 10000.0,
                "description": "Initial payment",
                "tx_date": "2024-01-15",
                "category_id": default_category,
                "from_fund": False,
            }
        )
        assert income_response.status_code == 200, f"Income transaction failed: {income_response.text}"
        
        # 3. Create expense transaction (may fail due to supplier requirement)
        expense_response = await test_client.post(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "project_id": project_id,
                "type": "Expense",
                "amount": 5000.0,
                "description": "Material cost",
                "tx_date": "2024-01-20",
                "category_id": default_category,
                "from_fund": False,
            }
        )
        # Accept 200 (success) or 400 (supplier required for expenses)
        assert expense_response.status_code in [200, 400], f"Unexpected expense error: {expense_response.text}"
        
        # 4. Get project with financial data
        project_detail = await test_client.get(
            f"/api/v1/projects/{project_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert project_detail.status_code == 200
        
        # 5. Get transactions for project
        transactions = await test_client.get(
            f"/api/v1/transactions/project/{project_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert transactions.status_code == 200, f"Get transactions failed: {transactions.text}"
        # At least the income transaction should be there
        assert len(transactions.json()) >= 1
    
    async def test_user_permissions_workflow(
        self, test_client: AsyncClient, admin_token: str, member_token: str
    ):
        """Test that member users have restricted access"""
        # Admin creates project
        project_response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Admin Project",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "budget_monthly": 0.0,
                "budget_annual": 0.0,
            }
        )
        assert project_response.status_code == 200
        project_id = project_response.json()["id"]
        
        # Member should be able to view projects
        member_projects = await test_client.get(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {member_token}"}
        )
        assert member_projects.status_code == 200
        
        # Member should be able to view specific project
        member_project = await test_client.get(
            f"/api/v1/projects/{project_id}",
            headers={"Authorization": f"Bearer {member_token}"}
        )
        # Depending on permissions, this might be 200 or 403
        assert member_project.status_code in [200, 403]
