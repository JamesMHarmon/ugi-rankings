# UGI Rankings Test Suite

This directory contains comprehensive tests for the UGI Rankings system.

## Test Structure

### Unit Tests

- **`database.test.ts`** - Tests for database operations
  - Table initialization
  - Engine management (add, list, rankings)
  - Game result recording
  - ELO rating updates
  - Pair game counting

- **`ugi-engine.test.ts`** - Tests for UGI engine communication
  - Engine process spawning
  - UGI protocol command handling
  - Game flow integration
  - Error handling and timeouts

- **`tournament.test.ts`** - Tests for tournament system
  - Tournament configuration validation
  - Pairing generation for round-robin
  - Concurrent game execution
  - Result tracking and rankings

- **`configuration.test.ts`** - Tests for configuration management
  - Config file loading and validation
  - Engine configuration validation
  - Environment-specific configurations

- **`elo-rating.test.ts`** - Tests for ELO rating calculations
  - Rating change formulas
  - Edge cases and boundary conditions
  - Multi-game rating progression
  - System properties (conservation, symmetry)

### Integration Tests

- **`integration.test.ts`** - End-to-end workflow tests
  - Complete tournament execution
  - Error recovery scenarios
  - Performance and scalability
  - Data integrity

## Running Tests

### Install Dependencies

```bash
npm install
```

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Database tests
npm test -- tests/database.test.ts

# UGI engine tests  
npm test -- tests/ugi-engine.test.ts

# Tournament tests
npm test -- tests/tournament.test.ts

# Configuration tests
npm test -- tests/configuration.test.ts

# ELO rating tests
npm test -- tests/elo-rating.test.ts

# Integration tests
npm test -- tests/integration.test.ts
```

### Using the Test Runner Script

```bash
# Make script executable (Linux/Mac)
chmod +x run-tests.sh

# Run specific test suite
./run-tests.sh database
./run-tests.sh tournament
./run-tests.sh elo

# Run all tests with coverage
./run-tests.sh all
```

### Coverage Reports

Generate coverage reports:

```bash
npm run test:coverage
```

View coverage report:
- Open `coverage/lcov-report/index.html` in your browser

### Watch Mode

Run tests in watch mode during development:

```bash
npm run test:watch
```

## Test Configuration

Tests are configured via `jest.config.json`:

- **TypeScript Support**: Uses `ts-jest` preset
- **Test Environment**: Node.js environment
- **Coverage**: Collects from `src/` directory
- **Setup**: Uses `tests/setup.ts` for global test configuration

## Test Patterns

### Mocking

Tests use Jest mocking to isolate units:

```typescript
// Mock database pool
const mockPool = {
    query: jest.fn(),
    // ... other methods
} as jest.Mocked<Pool>;

// Mock child process
jest.mock('child_process');
```

### Async Testing

Tests handle async operations properly:

```typescript
it('should handle async operations', async () => {
    const result = await someAsyncFunction();
    expect(result).toBeDefined();
});
```

### Error Testing

Tests verify error handling:

```typescript
it('should handle errors gracefully', async () => {
    mockFunction.mockRejectedValue(new Error('Test error'));
    await expect(functionUnderTest()).rejects.toThrow('Test error');
});
```

## Test Data

Tests use deterministic test data:

- Engine ratings start at 1500
- Predictable game outcomes for rating calculations
- Fixed configurations for repeatability

## Best Practices

1. **Isolation**: Each test is independent
2. **Mocking**: External dependencies are mocked
3. **Descriptive**: Test names clearly describe what is being tested
4. **Coverage**: Aim for high code coverage
5. **Fast**: Tests run quickly using mocks instead of real databases

## Debugging Tests

### Verbose Output

```bash
npm test -- --verbose
```

### Run Single Test

```bash
npm test -- --testNamePattern="should calculate correct rating changes"
```

### Debug Mode

```bash
npm test -- --detectOpenHandles --forceExit
```

## CI/CD Integration

Tests are designed to run in CI environments:

- No external dependencies required
- Deterministic results
- Fast execution
- Clear pass/fail reporting

Add to your CI pipeline:

```yaml
- name: Run Tests
  run: |
    npm install
    npm test
    npm run test:coverage
```
