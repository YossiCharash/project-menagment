"""
Tests for projects API endpoints
"""
import json
import pytest
from httpx import AsyncClient


@pytest.mark.api
@pytest.mark.asyncio
class TestProjectsAPI:
    """Test projects endpoints"""
    
    async def test_create_project(self, test_client: AsyncClient, admin_token: str):
        """Test creating a new project"""
        response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "description": "Test Description",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "budget_monthly": 0.0,
                "budget_annual": 100000.0,
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Project"
        assert "id" in data
    
    async def test_get_projects(self, test_client: AsyncClient, admin_token: str):
        """Test getting list of projects"""
        response = await test_client.get(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    async def test_get_project_by_id(self, test_client: AsyncClient, admin_token: str):
        """Test getting a project by ID"""
        # First create a project
        create_response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "description": "Test Description",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "budget_monthly": 0.0,
                "budget_annual": 100000.0,
            }
        )
        project_id = create_response.json()["id"]
        
        # Then get it
        response = await test_client.get(
            f"/api/v1/projects/{project_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == project_id
        assert data["name"] == "Test Project"
    
    async def test_update_project(self, test_client: AsyncClient, admin_token: str):
        """Test updating a project"""
        # Create project
        create_response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "description": "Test Description",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "budget_monthly": 0.0,
                "budget_annual": 100000.0,
            }
        )
        project_id = create_response.json()["id"]
        
        # Update project
        response = await test_client.put(
            f"/api/v1/projects/{project_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Updated Project",
                "description": "Updated Description",
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Project"
    
    async def test_delete_project(self, test_client: AsyncClient, admin_token: str):
        """Test deleting a project"""
        # Create project
        create_response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "description": "Test Description",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "budget_monthly": 0.0,
                "budget_annual": 100000.0,
            }
        )
        project_id = create_response.json()["id"]
        
        # Delete project (requires password in body)
        # Use content= with content-type header for DELETE with body
        response = await test_client.request(
            method="DELETE",
            url=f"/api/v1/projects/{project_id}",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "Content-Type": "application/json",
            },
            content=json.dumps({"password": "testpass123"})
        )
        assert response.status_code == 200, f"Delete failed: {response.text}"
        
        # Verify it's deleted
        get_response = await test_client.get(
            f"/api/v1/projects/{project_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert get_response.status_code == 404
    
    async def test_create_project_unauthorized(self, test_client: AsyncClient):
        """Test creating project without authentication"""
        response = await test_client.post(
            "/api/v1/projects",
            json={
                "name": "Test Project",
                "description": "Test Description",
            }
        )
        assert response.status_code == 401
    
    async def test_get_project_not_found(self, test_client: AsyncClient, admin_token: str):
        """Test getting non-existent project"""
        response = await test_client.get(
            "/api/v1/projects/99999",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404


@pytest.mark.api
@pytest.mark.edge_case
@pytest.mark.asyncio
class TestProjectsEdgeCases:
    """Test edge cases for projects"""
    
    async def test_create_project_missing_required_fields(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test creating project with missing required fields"""
        response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={}
        )
        assert response.status_code == 422
    
    async def test_create_project_invalid_dates(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test creating project with invalid date range"""
        response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "start_date": "2024-12-31",
                "end_date": "2024-01-01",  # End before start
            }
        )
        # Should either validate or allow (depending on business logic)
        assert response.status_code in [200, 400, 422]
    
    async def test_create_project_negative_budget(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test creating project with negative budget"""
        response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Test Project",
                "budget_annual": -1000.0,
            }
        )
        # Should validate negative budget
        assert response.status_code in [200, 400, 422]
    
    async def test_create_project_very_long_name(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test creating project with very long name"""
        long_name = "A" * 1000
        response = await test_client.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": long_name,
            }
        )
        # Should either truncate or reject
        assert response.status_code in [200, 400, 422]
    
    async def test_update_project_not_found(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test updating non-existent project"""
        response = await test_client.put(
            "/api/v1/projects/99999",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Updated Name"}
        )
        assert response.status_code == 404
    
    async def test_delete_project_not_found(
        self, test_client: AsyncClient, admin_token: str
    ):
        """Test deleting non-existent project"""
        # Use a very large ID that definitely doesn't exist
        response = await test_client.request(
            method="DELETE",
            url="/api/v1/projects/999999",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "Content-Type": "application/json",
            },
            content=json.dumps({"password": "testpass123"})
        )
        # Should return 404 or 422 (validation error)
        assert response.status_code in [404, 422]
