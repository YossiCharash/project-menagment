# CI/CD Workflows

This directory contains GitHub Actions workflows for automated testing and deployment.

## Workflows

### dev-tests.yml
Runs when code is pushed to or PR is created for the `dev` branch.

**Jobs:**
- `backend-tests` - Runs backend unit and integration tests
- `frontend-tests` - Runs frontend component and utility tests
- `integration-tests` - Runs end-to-end integration tests
- `test-summary` - Summarizes test results

**Triggers:**
- Push to `dev` or `DEV` branch
- Pull request to `dev` or `DEV` branch

### main-pre-merge.yml
Runs when a pull request is created for the `main` branch.

**Jobs:**
- `pre-merge-tests` - Runs all tests including edge cases
- Comments on PR with test results
- Blocks merge if tests fail

**Triggers:**
- Pull request to `main`, `MAIN`, or `master` branch

### main-post-merge.yml
Runs when code is merged to the `main` branch.

**Jobs:**
- `post-merge-tests` - Runs all tests again after merge
- `build` - Builds the application
- `deploy` - Deploys to production (if all tests pass)

**Triggers:**
- Push to `main`, `MAIN`, or `master` branch

## Test Execution Flow

1. **DEV Branch**: Tests run on merge → If pass, merge allowed
2. **MAIN Pre-Merge**: Tests run on PR → If pass, merge allowed
3. **MAIN Post-Merge**: Tests run after merge → Build → Deploy

## Environment Variables

Required environment variables (set in GitHub Secrets):
- `DATABASE_URL` - Database connection string for tests
- `JWT_SECRET_KEY` - Secret key for JWT tokens
- Deployment credentials (if needed)

## Coverage Reports

Coverage reports are uploaded to Codecov for tracking:
- Backend coverage
- Frontend coverage
- Combined coverage

## Deployment

The deployment step in `main-post-merge.yml` is a placeholder. Update it with your actual deployment commands:
- Docker build and push
- Cloud provider deployment (AWS, GCP, Azure, etc.)
- Server updates
- Database migrations
