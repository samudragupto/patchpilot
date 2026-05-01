# PatchPilot Testing Guide

This document provides comprehensive guidelines for testing the PatchPilot AI pipeline.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Test Categories](#test-categories)
- [Writing Tests](#writing-tests)
- [Test Utilities](#test-utilities)
- [Coverage Requirements](#coverage-requirements)
- [Best Practices](#best-practices)

## Overview

PatchPilot uses **Jest** as the testing framework with comprehensive test coverage across:
- Unit tests for individual phases
- Integration tests for complete pipeline execution
- API endpoint tests
- Cache layer tests

### Test Stack

- **Jest**: Testing framework
- **@testing-library/react**: React component testing
- **@testing-library/jest-dom**: DOM matchers
- **ts-jest**: TypeScript support

## Test Structure

```
__tests__/
├── utils/
│   ├── mocks.ts           # Mock factories and test data
│   └── helpers.ts         # Test helper functions
├── pipeline/
│   ├── phases/            # Unit tests for each phase
│   │   ├── input-analysis.test.ts
│   │   ├── ai-reasoning.test.ts
│   │   ├── graph-traversal.test.ts
│   │   ├── fix-generation.test.ts
│   │   ├── validation.test.ts
│   │   └── pr-assembly.test.ts
│   ├── cache/             # Cache layer tests
│   │   └── cache-manager.test.ts
│   └── integration/       # Integration tests
│       └── pipeline-execution.test.ts
└── api/
    └── pipeline/          # API endpoint tests
        └── route.test.ts
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm test -- --watch
```

### Run Specific Test File

```bash
npm test -- input-analysis.test.ts
```

### Run Tests with Coverage

```bash
npm test -- --coverage
```

### Run Tests for Specific Pattern

```bash
npm test -- --testPathPattern=pipeline/phases
```

## Test Categories

### 1. Unit Tests

Test individual phases in isolation with mocked dependencies.

**Location**: `__tests__/pipeline/phases/`

**Example**:
```typescript
import { InputAnalysisPhase } from '@/lib/pipeline/phases/input-analysis'
import { createMockPipelineContext } from '../../utils/mocks'

describe('InputAnalysisPhase', () => {
  it('should parse stack trace correctly', async () => {
    const phase = new InputAnalysisPhase()
    const context = createMockPipelineContext()
    
    const result = await phase.execute(context)
    
    expect(result.success).toBe(true)
    expect(result.data.parsedStackTrace).toBeDefined()
  })
})
```

### 2. Integration Tests

Test complete pipeline execution with all phases working together.

**Location**: `__tests__/pipeline/integration/`

**Example**:
```typescript
import { PipelineOrchestrator } from '@/lib/pipeline/core/orchestrator'
import { createMockPipelineInput } from '../../utils/mocks'

describe('Pipeline Integration', () => {
  it('should execute all phases successfully', async () => {
    const orchestrator = new PipelineOrchestrator()
    const input = createMockPipelineInput()
    
    const result = await orchestrator.execute(input)
    
    expect(result.prPackage).toBeDefined()
    expect(result.metrics).toBeDefined()
  })
})
```

### 3. Cache Tests

Test caching functionality including TTL, eviction, and statistics.

**Location**: `__tests__/pipeline/cache/`

**Example**:
```typescript
import { CacheManager } from '@/lib/pipeline/cache/cache-manager'
import { CacheBackend } from '@/lib/pipeline/cache/cache-types'

describe('CacheManager', () => {
  it('should cache and retrieve values', async () => {
    const cache = new CacheManager({
      backend: CacheBackend.MEMORY,
      defaultTTL: 3600,
    })
    
    await cache.set('key', { data: 'value' })
    const result = await cache.get('key')
    
    expect(result.hit).toBe(true)
    expect(result.value).toEqual({ data: 'value' })
  })
})
```

### 4. API Tests

Test API endpoints for request validation and response format.

**Location**: `__tests__/api/`

**Example**:
```typescript
import { POST } from '@/app/api/pipeline/route'
import { NextRequest } from 'next/server'

describe('POST /api/pipeline', () => {
  it('should accept valid requests', async () => {
    const request = new NextRequest('http://localhost/api/pipeline', {
      method: 'POST',
      body: JSON.stringify({ stackTrace: 'Error: test', repoUrl: '...' }),
    })
    
    const response = await POST(request)
    
    expect(response.status).toBeLessThan(500)
  })
})
```

## Writing Tests

### Test Structure

Follow the AAA pattern: **Arrange, Act, Assert**

```typescript
describe('Feature', () => {
  describe('Scenario', () => {
    it('should behave correctly', async () => {
      // Arrange: Set up test data and mocks
      const input = createMockInput()
      const mockService = jest.fn()
      
      // Act: Execute the code under test
      const result = await functionUnderTest(input)
      
      // Assert: Verify the results
      expect(result).toBeDefined()
      expect(mockService).toHaveBeenCalled()
    })
  })
})
```

### Naming Conventions

- **Test files**: `*.test.ts` or `*.spec.ts`
- **Describe blocks**: Use feature/component names
- **Test cases**: Start with "should" and describe expected behavior

### Mocking

Use the provided mock factories from `__tests__/utils/mocks.ts`:

```typescript
import {
  createMockPipelineContext,
  createMockPipelineInput,
  createMockInputAnalysisOutput,
  MockWatsonxClient,
} from '../../utils/mocks'

// Create mock context
const context = createMockPipelineContext({
  input: createMockPipelineInput({
    stackTrace: 'Custom stack trace',
  }),
})

// Mock AI client
const mockAI = new MockWatsonxClient()
```

## Test Utilities

### Mock Factories

Located in `__tests__/utils/mocks.ts`:

- `createMockPipelineContext()` - Create pipeline context
- `createMockPipelineInput()` - Create pipeline input
- `createMockInputAnalysisOutput()` - Create phase 1 output
- `createMockAIReasoningOutput()` - Create phase 2 output
- `createMockGraphTraversalOutput()` - Create phase 3 output
- `createMockFixGenerationOutput()` - Create phase 4 output
- `createMockValidationOutput()` - Create phase 5 output
- `createMockPRAssemblyOutput()` - Create phase 6 output
- `MockWatsonxClient` - Mock AI client

### Helper Functions

Located in `__tests__/utils/helpers.ts`:

- `assertPhaseSuccess()` - Assert phase succeeded
- `assertPhaseFailure()` - Assert phase failed
- `wait()` - Wait for specified time
- `measureExecutionTime()` - Measure function execution time
- `validateRequiredFields()` - Validate object has required fields
- `sanitizeForSnapshot()` - Prepare data for snapshot testing

### Example Usage

```typescript
import { assertPhaseSuccess, wait } from '../../utils/helpers'

it('should complete successfully', async () => {
  const result = await phase.execute(context)
  
  // Use helper to assert success
  assertPhaseSuccess(result)
  
  // Wait for async operations
  await wait(100)
})
```

## Coverage Requirements

### Target Coverage

- **Overall**: 80%+
- **Branches**: 80%+
- **Functions**: 80%+
- **Lines**: 80%+
- **Statements**: 80%+

### View Coverage Report

```bash
npm test -- --coverage
```

Coverage reports are generated in `coverage/` directory.

### Coverage by Category

- **Pipeline Phases**: 85%+ (critical path)
- **Cache Layer**: 80%+
- **API Endpoints**: 75%+
- **Utilities**: 70%+

## Best Practices

### 1. Test Isolation

Each test should be independent and not rely on other tests:

```typescript
beforeEach(() => {
  // Reset state before each test
  jest.clearAllMocks()
})

afterEach(() => {
  // Clean up after each test
  jest.restoreAllMocks()
})
```

### 2. Mock External Dependencies

Always mock external services and file system operations:

```typescript
jest.mock('fs/promises')
jest.mock('@/lib/ai/watsonx-client')

beforeEach(() => {
  (fs.readFile as jest.Mock).mockResolvedValue('mock data')
})
```

### 3. Test Both Success and Failure Cases

```typescript
describe('Error Handling', () => {
  it('should handle success', async () => {
    // Test happy path
  })
  
  it('should handle errors gracefully', async () => {
    // Test error scenarios
  })
})
```

### 4. Use Descriptive Test Names

```typescript
// Good
it('should parse JavaScript stack trace with line numbers', async () => {})

// Bad
it('should work', async () => {})
```

### 5. Test Edge Cases

```typescript
describe('Edge Cases', () => {
  it('should handle empty input', async () => {})
  it('should handle very large input', async () => {})
  it('should handle malformed data', async () => {})
})
```

### 6. Keep Tests Fast

- Mock slow operations (file I/O, network calls)
- Use appropriate timeouts
- Run expensive tests separately

```typescript
it('should complete quickly', async () => {
  // Fast test
}, 1000) // 1 second timeout

it('should handle complex scenario', async () => {
  // Slower integration test
}, 30000) // 30 second timeout
```

### 7. Use Snapshots Sparingly

Snapshots are useful for complex objects but can be brittle:

```typescript
import { sanitizeForSnapshot } from '../../utils/helpers'

it('should match snapshot', () => {
  const result = generateComplexObject()
  
  // Remove dynamic fields before snapshot
  expect(sanitizeForSnapshot(result)).toMatchSnapshot()
})
```

## Continuous Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Pre-deployment

### CI Configuration

Tests must pass before merging:
- All tests pass
- Coverage thresholds met
- No linting errors

## Debugging Tests

### Run Single Test

```bash
npm test -- -t "should parse stack trace"
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--no-cache"],
  "console": "integratedTerminal"
}
```

### Verbose Output

```bash
npm test -- --verbose
```

## Common Issues

### Issue: Tests timeout

**Solution**: Increase timeout or mock slow operations

```typescript
it('should complete', async () => {
  // Test code
}, 10000) // Increase timeout
```

### Issue: Mock not working

**Solution**: Ensure mock is set up before import

```typescript
jest.mock('@/lib/service')

// Then import
import { Service } from '@/lib/service'
```

### Issue: Flaky tests

**Solution**: Ensure proper cleanup and avoid timing dependencies

```typescript
afterEach(async () => {
  await cleanup()
  jest.clearAllTimers()
})
```

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/)
- [TypeScript Jest](https://kulshekhar.github.io/ts-jest/)

## Contributing

When adding new features:
1. Write tests first (TDD)
2. Ensure tests pass locally
3. Maintain coverage thresholds
4. Update this documentation if needed

---

**Made with Bob** 🤖