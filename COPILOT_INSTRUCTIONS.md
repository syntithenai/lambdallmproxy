# GitHub Copilot Instructions for Lambda LLM Proxy

## Project Overview

This is a serverless Lambda function that provides an LLM proxy with web search capabilities, streaming responses, and continuation support for rate limit handling. The system integrates multiple LLM providers (Groq, OpenAI) with DuckDuckGo search and JavaScript execution tools.

## Architecture

- **Entry Point**: `src/index.js` - Lambda handler with streaming support
- **Core Logic**: `src/lambda_search_llm_handler.js` - Main processing logic with tool loop
- **Tools**: `src/tools.js` - Tool functions (search_web, execute_javascript, scrape_web_content)
- **Search**: `src/search.js` - DuckDuckGo search integration
- **Auth**: `src/auth.js` - Google OAuth token verification
- **Providers**: `src/providers.js` - LLM provider configurations
- **UI**: `docs/` - Frontend with streaming UI and continuation support

## Testing Guidelines

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test:coverage

# Run in watch mode during development
npm test:watch

# Run specific test types
npm run test:unit
npm run test:integration

# Debug tests
DEBUG_TESTS=1 npm test
```

### Test Structure

- **Unit Tests** (`tests/unit/`): Test individual modules in isolation
- **Integration Tests** (`tests/integration/`): Test Lambda functions end-to-end
- **Fixtures** (`tests/fixtures/`): Mock data and test responses
- **Helpers** (`tests/helpers/`): Test utilities and common functions

### Writing Tests

When creating tests, follow these patterns:

```javascript
const { createMockStream, createMockEvent } = require('../helpers/testUtils');
const mockData = require('../fixtures/mockData');

describe('ModuleName', () => {
  let mockStream;
  
  beforeEach(() => {
    mockStream = createMockStream();
    jest.clearAllMocks();
  });

  test('should handle expected scenario', async () => {
    // Arrange
    const input = mockData.validInput;
    
    // Act
    const result = await functionUnderTest(input);
    
    // Assert
    expect(result).toEqual(expectedOutput);
    expect(mockStream.writeEvent).toHaveBeenCalledWith('event_type', expect.any(Object));
  });
});
```

### Mocking Guidelines

1. **External APIs**: Always mock Groq, OpenAI, and DuckDuckGo calls
2. **AWS Services**: Mock Lambda runtime and streaming responses
3. **File System**: Mock file operations for security
4. **Network Requests**: Use fixtures for consistent test data
5. **Time-dependent**: Mock timers and dates for deterministic tests

### Test Coverage Focus

- **Authentication**: Token verification, email validation
- **Search Functionality**: Query processing, result parsing, error handling
- **LLM Integration**: Provider switching, token management, streaming
- **Tool Execution**: Function calling, parameter validation, error recovery
- **Rate Limiting**: Quota detection, continuation state, retry logic
- **Streaming**: Event emission, connection management, error propagation

## Code Style and Patterns

### Function Naming
- Use descriptive names: `parseWaitTimeFromMessage()` not `parseTime()`
- Async functions should be clear: `async searchWeb()` not `search()`
- Event handlers: `handleStreamEvent()`, `processToolResult()`

### Error Handling
```javascript
try {
  const result = await riskyOperation();
  return { success: true, data: result };
} catch (error) {
  console.error('Operation failed:', error.message);
  return { success: false, error: error.message };
}
```

### Streaming Events
```javascript
stream?.writeEvent?.('event_type', {
  message: 'Human readable message',
  data: relevantData,
  timestamp: new Date().toISOString()
});
```

### Tool Function Pattern
```javascript
async function toolFunction(args, context) {
  // Validate parameters
  if (!args.requiredParam) {
    throw new Error('Missing required parameter');
  }
  
  // Execute with error handling
  try {
    const result = await performOperation(args);
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({ error: error.message });
  }
}
```

## Key Implementation Details

### Rate Limit Handling
- Parse wait times from error messages: `parseWaitTimeFromMessage()`
- Emit `quota_exceeded` events with continuation state
- Preserve search results and tool progress for continuation

### Continuation System
- Collect search results during execution: `collectedSearchResults`
- Re-emit previous results on continuation: `continuationState.searchResults`
- Guide LLM with previous research summary

### Memory Management
- Use `TokenAwareMemoryTracker` for large operations
- Implement aggressive content truncation to prevent overflow
- Monitor heap usage during search operations

### Security
- Validate all tool parameters against schemas
- Sanitize HTML content extraction
- Verify Google OAuth tokens for authentication
- Respect CORS policies for web UI

## Performance Considerations

### Token Optimization
- Disabled planning phase to reduce API calls
- Reduced token allocations: LOW=512, MEDIUM=768, HIGH=1024
- Disabled search summaries to prevent cascading API calls
- Aggressive context pruning when conversations get large

### Search Optimization
- Limit search results to prevent token overflow
- Use HTML fallback when API fails
- Implement quality scoring for result filtering
- Cache-friendly result structure

### Streaming Optimization
- Emit events incrementally for UI responsiveness
- Use Server-Sent Events for real-time updates
- Implement connection health checks
- Handle network interruptions gracefully

## Common Patterns to Use

### Environment Configuration
```javascript
const CONFIG_VALUE = Number(process.env.CONFIG_VALUE) || DEFAULT_VALUE;
```

### Safe JSON Parsing
```javascript
function safeParseJson(str, fallback = {}) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}
```

### Tool Parameter Validation
```javascript
// Always validate against schemas - they have additionalProperties: false
const args = safeParseJson(toolCall.arguments || '{}');
if (!args.query) {
  throw new Error('Missing required parameter: query');
}
```

### Event Emission Pattern
```javascript
try {
  stream?.writeEvent?.('event_type', eventData);
  console.log('Event emitted successfully');
} catch (error) {
  console.log('Event emission failed:', error.message);
}
```

## Testing Priorities

1. **Rate Limit Recovery**: Test continuation with preserved state
2. **Tool Integration**: Verify all tools work with proper parameter validation
3. **Authentication**: Ensure security measures work correctly
4. **Search Quality**: Test result filtering and relevance scoring
5. **Memory Safety**: Verify no memory leaks or overflow conditions
6. **Error Resilience**: Test graceful degradation in failure scenarios

## Debugging Tips

- Use `DEBUG_TESTS=1` to see console output during tests
- Check Lambda logs with: `aws logs tail /aws/lambda/llmproxy --since=5m`
- Monitor memory usage with `MemoryTracker`
- Use streaming events to trace execution flow
- Test rate limit scenarios with mock quota errors

## When Adding New Features

1. **Write Tests First**: Create unit and integration tests
2. **Mock External Dependencies**: Don't make real API calls in tests
3. **Test Error Conditions**: Verify graceful failure handling
4. **Document Streaming Events**: Add new event types to documentation
5. **Consider Rate Limits**: Ensure new features don't increase token usage
6. **Test Continuation**: Verify features work with continuation system

## Development Server Configuration

### Local Testing Server

**ALWAYS use port 8081 for the local development server**

```bash
# Correct command for local testing
cd docs && python3 -m http.server 8081

# Alternative with Node.js
cd docs && npx http-server -p 8081

# Access the application at:
# http://localhost:8081
```

### Why Port 8081?

- Avoids conflicts with common development ports (8000, 8080)
- Consistent across all development environments
- Easy to remember and document
- Leaves other ports free for additional services

### Development Workflow

1. Make changes to source files in `ui/` or `src/`
2. Build docs: `./scripts/deploy-docs.sh --build`
3. Start server: `cd docs && python3 -m http.server 8081`
4. Test at: http://localhost:8081
5. Run tests: `npm test`

### Port Usage Guidelines

- **8081**: Main development server (REQUIRED)
- **8080**: Reserved for Lambda local testing
- **8000**: Available for other services
- **3000**: Available for React/Node.js apps
- **5000**: Available for Flask/Python apps