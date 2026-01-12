# Backend Tests

This directory contains all backend tests for the project management system.

## Test Structure

- `conftest.py` - Pytest configuration and fixtures
- `test_auth_api.py` - Authentication API endpoint tests
- `test_projects_api.py` - Projects API endpoint tests
- `test_transactions_api.py` - Transactions API endpoint tests
- `test_integration.py` - Integration tests for complete workflows

## Running Tests

### Run all tests
```bash
cd backend
pytest
```

### Run specific test file
```bash
pytest tests/test_auth_api.py
```

### Run tests with coverage
```bash
pytest --cov=backend --cov-report=html
```

### Run only edge case tests
```bash
pytest -m edge_case
```

### Run only integration tests
```bash
pytest -m integration
```

## Test Markers

Tests are organized using pytest markers:
- `@pytest.mark.api` - API endpoint tests
- `@pytest.mark.integration` - Integration tests
- `@pytest.mark.edge_case` - Edge case tests
- `@pytest.mark.service` - Service layer tests
- `@pytest.mark.repository` - Repository layer tests

## Test Database

Tests use an in-memory SQLite database that is created fresh for each test. This ensures:
- Tests are isolated from each other
- No need for database cleanup between tests
- Fast test execution

## Fixtures

Common fixtures available:
- `test_db` - Database session for tests
- `test_client` - Async HTTP client for API tests
- `admin_user` - Admin user fixture
- `member_user` - Member user fixture
- `admin_token` - Authentication token for admin user
- `member_token` - Authentication token for member user
