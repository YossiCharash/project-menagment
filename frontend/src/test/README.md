# Frontend Tests

This directory contains test utilities and configuration for frontend tests.

## Test Structure

Tests are located next to the components/pages they test:
- `components/__tests__/` - Component tests
- `pages/__tests__/` - Page tests
- `utils/__tests__/` - Utility function tests
- `lib/__tests__/` - Library/API tests

## Running Tests

### Run all tests
```bash
cd frontend
npm run test
```

### Run tests in watch mode
```bash
npm run test -- --watch
```

### Run tests with UI
```bash
npm run test:ui
```

### Run tests with coverage
```bash
npm run test:coverage
```

## Test Setup

Tests use:
- **Vitest** - Test runner
- **@testing-library/react** - React component testing
- **@testing-library/user-event** - User interaction simulation
- **jsdom** - DOM environment for tests

## Writing Tests

Example test structure:
```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MyComponent from '../MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

## Test Utilities

- `test/utils.tsx` - Custom render function with Redux and Router providers
- `test/setup.ts` - Global test setup and matchers
