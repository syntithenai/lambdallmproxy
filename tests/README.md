# Tests

This directory contains tests for the Lambda LLM Proxy project.

## Test Structure

- `unit/` - Unit tests for individual modules
- `integration/` - Integration tests for Lambda functions
- `fixtures/` - Test data and mock responses
- `helpers/` - Test utilities and helper functions

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/unit/search.test.js

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode (for development)
npm run test:watch
```

## Test Categories

### Unit Tests
- `auth.test.js` - Authentication and authorization
- `search.test.js` - DuckDuckGo search functionality
- `providers.test.js` - LLM provider configurations
- `tools.test.js` - Tool functions (search_web, execute_javascript, etc.)
- `html-parser.test.js` - HTML parsing utilities
- `memory-tracker.test.js` - Memory management

### Integration Tests
- `lambda-handler.test.js` - End-to-end Lambda function testing
- `streaming.test.js` - Streaming response functionality
- `continuation.test.js` - Continuation system testing
- `rate-limits.test.js` - Rate limit handling

### Test Data
- `fixtures/` contains sample responses, mock data, and test configurations

## Writing Tests

Use Jest framework with the following patterns:

```javascript
describe('ModuleName', () => {
  beforeEach(() => {
    // Setup
  });

  test('should handle specific scenario', async () => {
    // Arrange
    const input = {};
    
    // Act  
    const result = await functionUnderTest(input);
    
    // Assert
    expect(result).toEqual(expectedOutput);
  });
});
```

## Mock Guidelines

- Mock external API calls (Groq, OpenAI, DuckDuckGo)
- Use fixtures for consistent test data
- Mock AWS services when testing Lambda integration
- Avoid mocking internal business logic