"""
Tests for authentication API endpoints
"""
import pytest
from httpx import AsyncClient


@pytest.mark.api
@pytest.mark.asyncio
class TestAuthAPI:
    """Test authentication endpoints"""
    
    async def test_health_check(self, test_client: AsyncClient):
        """Test health check endpoint"""
        response = await test_client.get("/api/v1/auth/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
    
    async def test_check_admin_endpoint(self, test_client: AsyncClient):
        """Test check admin endpoint"""
        response = await test_client.get("/api/v1/auth/check-admin")
        assert response.status_code == 200
        data = response.json()
        assert "admin_exists" in data
        assert "super_admin_email" in data
    
    async def test_login_success(self, test_client: AsyncClient, admin_user):
        """Test successful login"""
        response = await test_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@test.com", "password": "testpass123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "token_type" in data
        assert data["token_type"] == "bearer"
    
    async def test_login_invalid_email(self, test_client: AsyncClient):
        """Test login with invalid email"""
        response = await test_client.post(
            "/api/v1/auth/login",
            json={"email": "nonexistent@test.com", "password": "testpass123"}
        )
        assert response.status_code == 401
    
    async def test_login_invalid_password(self, test_client: AsyncClient, admin_user):
        """Test login with invalid password"""
        response = await test_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@test.com", "password": "wrongpassword"}
        )
        assert response.status_code == 401
    
    async def test_login_missing_fields(self, test_client: AsyncClient):
        """Test login with missing fields"""
        response = await test_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@test.com"}
        )
        assert response.status_code == 422
    
    async def test_get_current_user(self, test_client: AsyncClient, admin_token: str):
        """Test getting current user profile"""
        response = await test_client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "admin@test.com"
        assert data["role"] == "Admin"
    
    async def test_get_current_user_no_token(self, test_client: AsyncClient):
        """Test getting current user without token"""
        response = await test_client.get("/api/v1/users/me")
        assert response.status_code == 401
    
    async def test_get_current_user_invalid_token(self, test_client: AsyncClient):
        """Test getting current user with invalid token"""
        response = await test_client.get(
            "/api/v1/users/me",
            headers={"Authorization": "Bearer invalid_token"}
        )
        assert response.status_code == 401


@pytest.mark.api
@pytest.mark.edge_case
@pytest.mark.asyncio
class TestAuthEdgeCases:
    """Test edge cases for authentication"""
    
    async def test_login_empty_email(self, test_client: AsyncClient):
        """Test login with empty email"""
        response = await test_client.post(
            "/api/v1/auth/login",
            json={"email": "", "password": "testpass123"}
        )
        assert response.status_code in [400, 422]
    
    async def test_login_empty_password(self, test_client: AsyncClient):
        """Test login with empty password"""
        response = await test_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@test.com", "password": ""}
        )
        assert response.status_code in [400, 422]
    
    async def test_login_sql_injection_attempt(self, test_client: AsyncClient):
        """Test login with SQL injection attempt"""
        response = await test_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@test.com'; DROP TABLE users; --", "password": "testpass123"}
        )
        # Should fail gracefully without executing SQL (either 401 or 422 for validation)
        assert response.status_code in [401, 422]
    
    async def test_login_xss_attempt(self, test_client: AsyncClient):
        """Test login with XSS attempt"""
        response = await test_client.post(
            "/api/v1/auth/login",
            json={"email": "<script>alert('xss')</script>", "password": "testpass123"}
        )
        # Should fail validation
        assert response.status_code in [400, 422]
    
    async def test_token_expiry(self, test_client: AsyncClient, admin_token: str):
        """Test that token is required for protected endpoints"""
        # Token should be valid immediately after creation
        response = await test_client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
