# Testing Guide

This document describes the testing strategy and CI/CD pipeline for the project management system.

## Overview

The project uses comprehensive testing at multiple levels:
- **Backend**: API endpoint tests, service tests, integration tests, and edge case tests
- **Frontend**: Component tests, page tests, utility tests, and edge case tests

## Test Execution Flow

### DEV Branch
When code is merged to the `dev` branch:
1. Backend tests run (unit, integration, edge cases)
2. Frontend tests run (components, pages, utilities)
3. Integration tests verify end-to-end workflows
4. If all tests pass, merge is allowed

### MAIN Branch - Pre-Merge
Before merging to `main`:
1. All tests from DEV branch run again
2. Additional edge case tests run
3. Coverage reports are generated
4. PR is commented with test results
5. Merge is blocked if tests fail

### MAIN Branch - Post-Merge
After merging to `main`:
1. All tests run again (backend, frontend, integration, edge cases)
2. Application is built
3. If all tests pass, deployment to production begins
4. Post-deployment health checks run
5. Deployment is marked as successful or failed

## Running Tests Locally

### Backend Tests
```bash
cd backend
pytest                    # Run all tests
pytest -v                 # Verbose output
pytest --cov=backend      # With coverage
pytest -m edge_case       # Only edge case tests
pytest -m integration     # Only integration tests
```

### Frontend Tests
```bash
cd frontend
npm run test              # Run all tests
npm run test:ui           # Run with UI
npm run test:coverage     # With coverage
```

## Test Coverage

The CI/CD pipeline generates coverage reports for:
- Backend code coverage
- Frontend code coverage
- Combined coverage reports

Coverage reports are uploaded to Codecov for tracking.

## Edge Case Testing

Edge case tests cover:
- Invalid input validation
- SQL injection attempts
- XSS attempts
- Boundary conditions
- Error handling
- Security vulnerabilities

## CI/CD Workflows

### `.github/workflows/dev-tests.yml`
Runs when code is pushed to or PR is created for `dev` branch.

### `.github/workflows/main-pre-merge.yml`
Runs when PR is created for `main` branch. Blocks merge if tests fail.

### `.github/workflows/main-post-merge.yml`
Runs when code is merged to `main` branch. Runs tests, builds, and deploys.

## Test Requirements

All tests must pass before:
- Merging to DEV
- Merging to MAIN
- Deploying to production

## Adding New Tests

When adding new features:
1. Add unit tests for new functions/components
2. Add integration tests for new workflows
3. Add edge case tests for new inputs
4. Ensure all tests pass locally before pushing

## Troubleshooting

### Tests fail in CI but pass locally
- Check environment variables
- Verify database setup
- Check Python/Node versions match CI

### Coverage is low
- Add tests for uncovered code paths
- Test error conditions
- Test edge cases
