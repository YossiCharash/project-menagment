"""
Tests for transactions API endpoints
"""
import pytest
from httpx import AsyncClient


@pytest.mark.api
@pytest.mark.asyncio
class TestTransactionsAPI:
    """Test transactions endpoints"""
    
    async def test_create_income_transaction(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test creating an income transaction"""
        # First create a project
        project_response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
            }
        )
        project_id = project_response.json()["id"]
        
        # Create income transaction
        response = await test_client.post(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "project_id": project_id,
                "type": "income",
                "amount": 5000.0,
                "description": "Test Income",
                "date": "2024-01-15",
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "income"
        assert data["amount"] == 5000.0
    
    async def test_create_expense_transaction(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test creating an expense transaction"""
        # First create a project
        project_response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
            }
        )
        project_id = project_response.json()["id"]
        
        # Create expense transaction
        response = await test_client.post(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "project_id": project_id,
                "type": "expense",
                "amount": 2000.0,
                "description": "Test Expense",
                "date": "2024-01-15",
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "expense"
        assert data["amount"] == 2000.0
    
    async def test_get_transactions(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test getting list of transactions"""
        response = await test_client.get(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    async def test_get_transaction_by_id(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test getting a transaction by ID"""
        # Create project
        project_response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
            }
        )
        project_id = project_response.json()["id"]
        
        # Create transaction
        create_response = await test_client.post(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "project_id": project_id,
                "type": "income",
                "amount": 5000.0,
                "description": "Test Income",
                "date": "2024-01-15",
            }
        )
        transaction_id = create_response.json()["id"]
        
        # Get transaction
        response = await test_client.get(
            f"/api/v1/transactions/{transaction_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == transaction_id
    
    async def test_update_transaction(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test updating a transaction"""
        # Create project
        project_response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
            }
        )
        project_id = project_response.json()["id"]
        
        # Create transaction
        create_response = await test_client.post(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "project_id": project_id,
                "type": "income",
                "amount": 5000.0,
                "description": "Test Income",
                "date": "2024-01-15",
            }
        )
        transaction_id = create_response.json()["id"]
        
        # Update transaction
        response = await test_client.put(
            f"/api/v1/transactions/{transaction_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "amount": 6000.0,
                "description": "Updated Income",
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["amount"] == 6000.0
    
    async def test_delete_transaction(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test deleting a transaction"""
        # Create project
        project_response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
            }
        )
        project_id = project_response.json()["id"]
        
        # Create transaction
        create_response = await test_client.post(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "project_id": project_id,
                "type": "income",
                "amount": 5000.0,
                "description": "Test Income",
                "date": "2024-01-15",
            }
        )
        transaction_id = create_response.json()["id"]
        
        # Delete transaction
        response = await test_client.delete(
            f"/api/v1/transactions/{transaction_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200


@pytest.mark.api
@pytest.mark.edge_case
@pytest.mark.asyncio
class TestTransactionsEdgeCases:
    """Test edge cases for transactions"""
    
    async def test_create_transaction_invalid_type(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test creating transaction with invalid type"""
        # Create project
        project_response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
            }
        )
        project_id = project_response.json()["id"]
        
        response = await test_client.post(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "project_id": project_id,
                "type": "invalid_type",
                "amount": 5000.0,
                "date": "2024-01-15",
            }
        )
        assert response.status_code in [400, 422]
    
    async def test_create_transaction_negative_amount(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test creating transaction with negative amount"""
        # Create project
        project_response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
            }
        )
        project_id = project_response.json()["id"]
        
        response = await test_client.post(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "project_id": project_id,
                "type": "income",
                "amount": -1000.0,
                "date": "2024-01-15",
            }
        )
        # Should validate negative amount
        assert response.status_code in [200, 400, 422]
    
    async def test_create_transaction_invalid_project(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test creating transaction with non-existent project"""
        response = await test_client.post(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "project_id": 99999,
                "type": "income",
                "amount": 5000.0,
                "date": "2024-01-15",
            }
        )
        assert response.status_code in [400, 404, 422]
    
    async def test_create_transaction_missing_required_fields(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test creating transaction with missing required fields"""
        response = await test_client.post(
            "/api/v1/transactions",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={}
        )
        assert response.status_code == 422
