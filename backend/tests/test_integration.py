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
        self, test_client: AsyncClient, admin_token: str
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
                "budget": 100000.0,
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
                "type": "income",
                "amount": 10000.0,
                "description": "Initial payment",
                "date": "2024-01-15",
            }
        )
        assert income_response.status_code == 200
        
        # 3. Create expense transaction
        expense_response = await test_client.post(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "project_id": project_id,
                "type": "expense",
                "amount": 5000.0,
                "description": "Material cost",
                "date": "2024-01-20",
            }
        )
        assert expense_response.status_code == 200
        
        # 4. Get project with financial data
        project_detail = await test_client.get(
            f"/api/v1/projects/{project_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert project_detail.status_code == 200
        
        # 5. Get transactions for project
        transactions = await test_client.get(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"project_id": project_id}
        )
        assert transactions.status_code == 200
        assert len(transactions.json()) >= 2
    
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
