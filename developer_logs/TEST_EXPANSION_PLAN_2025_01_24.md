# Test Expansion Plan - Integration & End-to-End Testing with Puppeteer
**Date**: January 24, 2025

## Executive Summary

### Current Testing Status

**Test Coverage**: 19.72% overall (CRITICAL - Very Low)
- **Statements**: 2,924/14,825 (19.72%)
- **Branches**: 1,748/10,633 (16.43%)
- **Functions**: 354/1,728 (20.48%)
- **Lines**: 2,839/14,235 (19.94%)

**Test Distribution**:
- **Unit Tests**: 41 files (strong foundation)
- **Integration Tests**: 14 files (needs expansion)
- **End-to-End Tests**: 0 files (MISSING - critical gap)
- **Total Test Suites**: 57
- **Total Tests**: 1,331 (1,185 passed, 37 failed, 109 skipped)

**Test Results Summary**:
- ✅ **Passed**: 40 test suites
- ❌ **Failed**: 7 test suites (streaming/planning issues)
- ⏭️ **Skipped**: 10 test suites
- **Execution Time**: 79.135 seconds

### Key Issues Identified

1. **Critical Coverage Gaps**:
   - Main Lambda handler (src/index.js): Only ~24% coverage
   - Endpoints: Many endpoints lack comprehensive tests
   - Authentication flows: Limited integration testing
   - Error handling paths: Under-tested

2. **Test Infrastructure Issues**:
   - Some tests fail due to AWS Lambda streaming mock issues
   - Planning endpoint tests fail (awslambda.streamifyResponse not mocked properly)
   - Tools tests have incorrect assertions (Gemini error message mismatch)

3. **Missing Test Categories**:
   - **No E2E tests** for user workflows
   - **No browser-based tests** for UI interactions
   - **No performance tests** for streaming responses
   - **No security tests** for authentication bypass attempts
   - **Limited chaos/failure tests** for resilience

---

## 📋 Phase 1: Fix Existing Test Issues (Week 1)

### Priority 1A: Fix Failing Tests

#### 1. Fix Planning Endpoint Tests
**File**: `tests/unit/endpoints/planning.test.js`
**Issue**: `awslambda.streamifyResponse is not a function`

**Solution**:
```javascript
// tests/mockAwsSdk.js - Add streaming mock
global.awslambda = {
  streamifyResponse: (handler) => handler,
  HttpResponseStream: {
    from: (stream, metadata) => {
      stream.statusCode = metadata.statusCode;
      stream.headers = metadata.headers;
      return stream;
    }
  }
};
```

**Tasks**:
- [ ] Update `tests/mockAwsSdk.js` with proper streaming mocks
- [ ] Fix all planning endpoint test assertions
- [ ] Verify streaming response handling in tests
- [ ] Add streaming helper utilities for tests

#### 2. Fix Tools Test Assertions
**File**: `tests/unit/tools.test.js`
**Issue**: Expected error message mismatch for Gemini audio transcription

**Solution**:
```javascript
// Update assertion to match actual error message
expect(parsed.error).toContain('No Whisper-compatible API key found');
// OR update the error message in the source to be more specific
```

**Tasks**:
- [ ] Review all error message assertions in tools tests
- [ ] Update assertions to match current error messages
- [ ] Document expected error messages for each scenario
- [ ] Add error message constants to avoid future mismatches

### Priority 1B: Improve Test Infrastructure

#### 1. Enhanced Mock Setup
**File**: `tests/setup.js`

**Improvements**:
```javascript
// Add comprehensive mocking helpers
global.createMockResponseStream = () => {
  const chunks = [];
  return {
    write: (chunk) => chunks.push(chunk),
    end: () => {},
    getContent: () => chunks.join(''),
    chunks
  };
};

global.createMockLambdaEvent = (overrides = {}) => {
  return {
    httpMethod: 'POST',
    path: '/chat',
    headers: {
      'Authorization': 'Bearer mock-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: 'test' }),
    isBase64Encoded: false,
    ...overrides
  };
};
```

**Tasks**:
- [ ] Create mock helper utilities
- [ ] Add fixture generators for common test data
- [ ] Implement streaming response helpers
- [ ] Add authentication mock helpers

#### 2. Test Data Fixtures Expansion
**Directory**: `tests/fixtures/`

**New Fixtures Needed**:
- [ ] `authentication/` - Valid/invalid tokens, OAuth responses
- [ ] `streaming/` - SSE event streams, partial responses
- [ ] `errors/` - Various error scenarios and edge cases
- [ ] `provider-responses/` - LLM provider API responses (Groq, OpenAI, Gemini)
- [ ] `tools/` - Tool execution results (web search, JS execution)
- [ ] `rag/` - RAG embeddings, search results, snippet data
- [ ] `transcription/` - Audio files, transcription results
- [ ] `images/` - Image generation requests/responses

---

## 📋 Phase 2: Expand Integration Tests (Week 2-3)

### Priority 2A: Endpoint Integration Tests

#### 1. Authentication Flow Tests
**New File**: `tests/integration/authentication-flow.test.js`

**Test Coverage**:
```javascript
describe('Authentication Flow Integration', () => {
  describe('Google OAuth Token Verification', () => {
    test('should accept valid JWT ID token');
    test('should accept valid ya29 access token');
    test('should reject expired tokens');
    test('should reject malformed tokens');
    test('should reject tokens from wrong issuer');
  });
  
  describe('Protected Endpoint Access', () => {
    test('should allow authenticated user to access /chat');
    test('should allow authenticated user to access /planning');
    test('should allow authenticated user to access /search');
    test('should block unauthenticated access to /rag/sync');
    test('should block unauthenticated access to /generate-image');
    test('should block unauthenticated access to /proxy-image');
    test('should block unauthenticated access to /convert-to-markdown');
  });
  
  describe('User Email Verification', () => {
    test('should prevent cross-user data access in RAG sync');
    test('should allow user to access their own billing data');
    test('should prevent user from accessing another user\'s data');
  });
});
```

**Tasks**:
- [ ] Create authentication flow test suite
- [ ] Mock Google OAuth verification service
- [ ] Test all protected endpoints
- [ ] Test cross-user access prevention
- [ ] Test token expiration handling

#### 2. Streaming Response Tests
**New File**: `tests/integration/streaming-responses.test.js`

**Test Coverage**:
```javascript
describe('Streaming Response Integration', () => {
  describe('Chat Endpoint Streaming', () => {
    test('should stream chat response chunks');
    test('should handle tool execution during streaming');
    test('should properly end stream on completion');
    test('should handle streaming errors gracefully');
    test('should include proper SSE formatting');
  });
  
  describe('Planning Endpoint Streaming', () => {
    test('should stream plan generation progress');
    test('should stream search keywords as they are generated');
    test('should handle plan validation errors');
  });
  
  describe('Search Endpoint Streaming', () => {
    test('should stream search results incrementally');
    test('should handle web scraping during search');
    test('should stream synthesis of search results');
  });
  
  describe('Image Generation Streaming', () => {
    test('should stream provider selection phase');
    test('should stream generation progress updates');
    test('should stream download phase');
    test('should handle fallback provider streaming');
  });
});
```

**Tasks**:
- [ ] Create streaming response test suite
- [ ] Implement SSE parser for test validation
- [ ] Test all streaming endpoints
- [ ] Test error handling in streams
- [ ] Test stream interruption scenarios

#### 3. Tool Execution Integration Tests
**New File**: `tests/integration/tool-execution.test.js`

**Test Coverage**:
```javascript
describe('Tool Execution Integration', () => {
  describe('Web Search Tool', () => {
    test('should execute DuckDuckGo search');
    test('should handle search with no results');
    test('should scrape web pages from search results');
    test('should extract text content from HTML');
    test('should respect rate limits');
  });
  
  describe('JavaScript Execution Tool', () => {
    test('should execute safe JavaScript code');
    test('should prevent dangerous operations');
    test('should return execution results');
    test('should handle execution errors');
    test('should enforce timeout limits');
  });
  
  describe('YouTube Caption Tool', () => {
    test('should fetch captions for valid video');
    test('should handle videos without captions');
    test('should support timestamp extraction');
    test('should handle rate limiting');
  });
});
```

**Tasks**:
- [ ] Create tool execution test suite
- [ ] Mock external services (DuckDuckGo, YouTube)
- [ ] Test all tool functions
- [ ] Test tool error handling
- [ ] Test tool rate limiting

#### 4. RAG System Integration Tests
**New File**: `tests/integration/rag-system.test.js`

**Test Coverage**:
```javascript
describe('RAG System Integration', () => {
  describe('Snippet Embedding', () => {
    test('should embed text snippets using Turso vector DB');
    test('should handle batch embedding requests');
    test('should update existing embeddings');
    test('should track embedding status');
  });
  
  describe('Semantic Search', () => {
    test('should find relevant snippets by similarity');
    test('should respect similarity threshold');
    test('should rank results by relevance');
    test('should handle queries with no results');
  });
  
  describe('Google Sheets Sync', () => {
    test('should sync snippets to Google Sheets');
    test('should pull snippets from Google Sheets');
    test('should handle sync conflicts');
    test('should verify user permissions');
  });
});
```

**Tasks**:
- [ ] Create RAG integration test suite
- [ ] Mock Turso vector database
- [ ] Mock Google Sheets API
- [ ] Test embedding workflows
- [ ] Test search and retrieval

#### 5. Billing & Credits Integration Tests
**New File**: `tests/integration/billing-credits.test.js`

**Test Coverage**:
```javascript
describe('Billing & Credits Integration', () => {
  describe('Credit Tracking', () => {
    test('should track chat request costs');
    test('should track image generation costs');
    test('should track transcription costs');
    test('should aggregate costs by user');
  });
  
  describe('Credit Persistence', () => {
    test('should save credits to Google Sheets');
    test('should load credits from Google Sheets');
    test('should handle cache invalidation');
  });
  
  describe('Credit Limits', () => {
    test('should enforce user credit limits');
    test('should block requests when credits exhausted');
    test('should allow requests when credits available');
  });
});
```

**Tasks**:
- [ ] Create billing integration test suite
- [ ] Mock Google Sheets billing backend
- [ ] Test credit tracking for all endpoints
- [ ] Test credit limit enforcement
- [ ] Test cost calculation accuracy

---

## 📋 Phase 3: Puppeteer End-to-End Tests (Week 4-5)

### Priority 3A: E2E Test Infrastructure Setup

#### 1. Puppeteer Test Configuration
**New File**: `tests/e2e/jest.config.js`

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/e2e/**/*.e2e.js'],
  testTimeout: 60000, // 60 seconds for E2E tests
  setupFilesAfterEnv: ['<rootDir>/tests/e2e/setup.js'],
  globalSetup: '<rootDir>/tests/e2e/global-setup.js',
  globalTeardown: '<rootDir>/tests/e2e/global-teardown.js'
};
```

**Tasks**:
- [ ] Create E2E test configuration
- [ ] Set up Puppeteer launch options
- [ ] Configure test environment variables
- [ ] Set up screenshot directory for failures
- [ ] Configure video recording for debugging

#### 2. E2E Test Helpers
**New File**: `tests/e2e/helpers/browser-helpers.js`

```javascript
class BrowserTestHelper {
  async launch(options = {}) {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...options
    });
  }
  
  async createPage() {
    const page = await this.browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    return page;
  }
  
  async login(page, credentials) {
    // Implement Google OAuth mock login
  }
  
  async takeScreenshot(page, name) {
    await page.screenshot({
      path: `tests/e2e/screenshots/${name}.png`,
      fullPage: true
    });
  }
  
  async close() {
    await this.browser.close();
  }
}
```

**Tasks**:
- [ ] Create browser helper utilities
- [ ] Implement page object models
- [ ] Add screenshot/video helpers
- [ ] Add network mocking helpers
- [ ] Add authentication helpers

### Priority 3B: UI End-to-End Tests

#### 1. Chat Interface E2E Tests
**New File**: `tests/e2e/chat-interface.e2e.js`

**Test Coverage**:
```javascript
describe('Chat Interface E2E', () => {
  describe('Basic Chat Flow', () => {
    test('should load chat page successfully');
    test('should send a message and receive response');
    test('should display streaming response in real-time');
    test('should show typing indicator during response');
    test('should handle markdown formatting in responses');
  });
  
  describe('Tool Execution in Chat', () => {
    test('should trigger web search automatically');
    test('should show search results in response');
    test('should execute JavaScript code when requested');
    test('should display code execution results');
  });
  
  describe('Chat History', () => {
    test('should save chat to IndexedDB');
    test('should load previous chat from history');
    test('should display chat list in sidebar');
    test('should delete chat from history');
  });
  
  describe('Image Generation', () => {
    test('should generate image from text prompt');
    test('should show generation progress indicator');
    test('should display generated image inline');
    test('should allow downloading generated image');
    test('should allow copying image to clipboard');
  });
  
  describe('RAG Context', () => {
    test('should enable RAG context toggle');
    test('should search RAG snippets during chat');
    test('should display used RAG context in response');
    test('should adjust similarity threshold');
  });
});
```

**Tasks**:
- [ ] Create chat interface E2E test suite
- [ ] Mock backend API responses
- [ ] Test message sending/receiving
- [ ] Test streaming response rendering
- [ ] Test tool execution UI
- [ ] Test image generation UI
- [ ] Test RAG integration UI

#### 2. Authentication E2E Tests
**New File**: `tests/e2e/authentication.e2e.js`

**Test Coverage**:
```javascript
describe('Authentication E2E', () => {
  describe('Login Flow', () => {
    test('should show login button when not authenticated');
    test('should redirect to Google OAuth on login click');
    test('should complete OAuth flow successfully');
    test('should show user email after login');
    test('should persist authentication across page refreshes');
  });
  
  describe('Logout Flow', () => {
    test('should clear authentication on logout');
    test('should show login button after logout');
    test('should clear cached data on logout');
  });
  
  describe('Protected Features', () => {
    test('should disable chat when not authenticated');
    test('should disable RAG features when not authenticated');
    test('should disable image generation when not authenticated');
    test('should show authentication prompt for protected features');
  });
});
```

**Tasks**:
- [ ] Create authentication E2E test suite
- [ ] Mock Google OAuth flow
- [ ] Test login/logout workflows
- [ ] Test protected feature access
- [ ] Test token refresh

#### 3. RAG/Swag Interface E2E Tests
**New File**: `tests/e2e/swag-interface.e2e.js`

**Test Coverage**:
```javascript
describe('Swag (RAG) Interface E2E', () => {
  describe('Snippet Management', () => {
    test('should create new snippet');
    test('should edit existing snippet');
    test('should delete snippet');
    test('should select multiple snippets');
    test('should merge selected snippets');
  });
  
  describe('Tagging System', () => {
    test('should add tags to snippet');
    test('should filter snippets by tag');
    test('should remove tags from snippet');
    test('should show all available tags');
  });
  
  describe('Embedding Status', () => {
    test('should show embedding status indicator');
    test('should trigger manual embedding');
    test('should bulk embed selected snippets');
    test('should show embedding progress');
  });
  
  describe('Google Sheets Sync', () => {
    test('should sync snippets to Google Sheets');
    test('should pull snippets from Google Sheets');
    test('should show sync status');
    test('should handle sync conflicts');
  });
  
  describe('Search & Filter', () => {
    test('should search snippets by text');
    test('should filter by source type');
    test('should filter by embedding status');
    test('should sort snippets by date');
  });
});
```

**Tasks**:
- [ ] Create Swag interface E2E test suite
- [ ] Test snippet CRUD operations
- [ ] Test tagging system
- [ ] Test embedding workflows
- [ ] Test Google Sheets sync
- [ ] Test search and filtering

#### 4. Transcription Interface E2E Tests
**New File**: `tests/e2e/transcription.e2e.js`

**Test Coverage**:
```javascript
describe('Transcription Interface E2E', () => {
  describe('Audio Transcription', () => {
    test('should upload audio file');
    test('should transcribe uploaded audio');
    test('should show transcription progress');
    test('should display transcription result');
    test('should allow copying transcription');
  });
  
  describe('YouTube Transcription', () => {
    test('should enter YouTube URL');
    test('should fetch video captions');
    test('should display caption text');
    test('should show timestamps in captions');
  });
  
  describe('Error Handling', () => {
    test('should show error for invalid audio file');
    test('should show error for unsupported format');
    test('should show error for invalid YouTube URL');
    test('should allow retry after error');
  });
});
```

**Tasks**:
- [ ] Create transcription E2E test suite
- [ ] Test audio upload workflow
- [ ] Test YouTube URL input
- [ ] Test transcription display
- [ ] Test error scenarios

#### 5. Settings & Configuration E2E Tests
**New File**: `tests/e2e/settings.e2e.js`

**Test Coverage**:
```javascript
describe('Settings & Configuration E2E', () => {
  describe('Provider Selection', () => {
    test('should show available providers');
    test('should select default provider');
    test('should configure provider API keys');
    test('should test provider connection');
  });
  
  describe('Model Selection', () => {
    test('should list available models for provider');
    test('should select chat model');
    test('should select image generation model');
    test('should show model pricing');
  });
  
  describe('Theme & Appearance', () => {
    test('should toggle dark/light mode');
    test('should persist theme preference');
    test('should adjust font size');
  });
  
  describe('RAG Configuration', () => {
    test('should configure embedding model');
    test('should set similarity threshold');
    test('should toggle auto-embedding');
    test('should configure sync settings');
  });
});
```

**Tasks**:
- [ ] Create settings E2E test suite
- [ ] Test provider configuration
- [ ] Test model selection
- [ ] Test theme toggling
- [ ] Test RAG settings

### Priority 3C: API End-to-End Tests

#### 1. Full Request/Response Cycle Tests
**New File**: `tests/e2e/api-full-cycle.e2e.js`

**Test Coverage**:
```javascript
describe('API Full Request/Response Cycle', () => {
  describe('Chat Endpoint Complete Flow', () => {
    test('should handle chat request with web search');
    test('should handle chat request with JS execution');
    test('should handle chat request with RAG context');
    test('should handle chat request with image generation');
    test('should handle multi-turn conversation');
  });
  
  describe('Planning + Search Flow', () => {
    test('should generate plan with search keywords');
    test('should execute searches from plan');
    test('should synthesize results into response');
  });
  
  describe('Error Recovery', () => {
    test('should retry failed provider requests');
    test('should fallback to alternative provider');
    test('should handle rate limit errors');
    test('should handle network timeouts');
  });
});
```

**Tasks**:
- [ ] Create API full-cycle test suite
- [ ] Test complete workflows end-to-end
- [ ] Test error recovery mechanisms
- [ ] Test provider fallback logic
- [ ] Test rate limit handling

---

## 📋 Phase 4: Performance & Load Tests (Week 6)

### Priority 4A: Performance Benchmarks

#### 1. Response Time Tests
**New File**: `tests/performance/response-times.perf.js`

**Metrics to Track**:
- Cold start time
- Warm response time
- Streaming first byte time
- Complete response time
- Tool execution overhead
- Database query latency

**Tasks**:
- [ ] Create performance test suite
- [ ] Measure baseline performance
- [ ] Set performance budgets
- [ ] Test under different loads
- [ ] Generate performance reports

#### 2. Memory Usage Tests
**New File**: `tests/performance/memory-usage.perf.js`

**Metrics to Track**:
- Peak memory usage
- Memory growth over time
- Memory leaks detection
- Garbage collection frequency

**Tasks**:
- [ ] Monitor memory usage during tests
- [ ] Detect memory leaks
- [ ] Test memory limits
- [ ] Generate memory reports

### Priority 4B: Load Testing

#### 1. Concurrent Request Tests
**New File**: `tests/performance/load-test.js`

**Scenarios**:
- 10 concurrent users
- 50 concurrent users
- 100 concurrent users
- Spike load (sudden traffic surge)
- Sustained load (long-running sessions)

**Tasks**:
- [ ] Set up load testing framework
- [ ] Define load test scenarios
- [ ] Execute load tests
- [ ] Analyze bottlenecks
- [ ] Generate load test reports

---

## 📋 Phase 5: Security & Chaos Tests (Week 7)

### Priority 5A: Security Tests

#### 1. Authentication Bypass Tests
**New File**: `tests/security/auth-bypass.security.js`

**Test Coverage**:
```javascript
describe('Authentication Security', () => {
  describe('Token Bypass Attempts', () => {
    test('should reject missing Authorization header');
    test('should reject malformed tokens');
    test('should reject expired tokens');
    test('should reject tokens from wrong issuer');
    test('should reject tampered tokens');
  });
  
  describe('Cross-User Access', () => {
    test('should prevent user A accessing user B data');
    test('should prevent privilege escalation');
    test('should verify user ownership on all operations');
  });
});
```

**Tasks**:
- [ ] Create security test suite
- [ ] Test authentication bypass attempts
- [ ] Test authorization bypasses
- [ ] Test injection attacks
- [ ] Test XSS vulnerabilities

#### 2. Rate Limit Security Tests
**New File**: `tests/security/rate-limits.security.js`

**Test Coverage**:
- Rate limit enforcement
- DDoS protection
- Brute force prevention
- API abuse detection

**Tasks**:
- [ ] Test rate limit enforcement
- [ ] Test bypass attempts
- [ ] Test distributed attacks
- [ ] Generate security reports

### Priority 5B: Chaos Engineering Tests

#### 1. Failure Injection Tests
**New File**: `tests/chaos/failure-injection.chaos.js`

**Scenarios**:
- Provider API failures
- Database connection failures
- Network timeouts
- Partial response failures
- Memory exhaustion

**Tasks**:
- [ ] Create chaos test suite
- [ ] Inject various failures
- [ ] Test recovery mechanisms
- [ ] Test graceful degradation
- [ ] Generate chaos reports

---

## 📋 Phase 6: Continuous Integration (Week 8)

### Priority 6A: CI/CD Pipeline Integration

#### 1. GitHub Actions Workflow
**New File**: `.github/workflows/test.yml`

```yaml
name: Test Suite

on:
  push:
    branches: [main, agent]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      - uses: codecov/codecov-action@v3
  
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration
  
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: e2e-screenshots
          path: tests/e2e/screenshots/
```

**Tasks**:
- [ ] Create CI/CD workflow
- [ ] Configure test environments
- [ ] Set up test secrets
- [ ] Configure artifact uploads
- [ ] Set up coverage reporting

#### 2. Pre-commit Hooks
**New File**: `.husky/pre-commit`

```bash
#!/bin/sh
npm run test:unit
npm run test:integration
```

**Tasks**:
- [ ] Set up Husky pre-commit hooks
- [ ] Run fast tests on commit
- [ ] Run linting on commit
- [ ] Prevent commits with failing tests

---

## 📊 Success Metrics & Goals

### Coverage Goals

| Metric | Current | Target (Phase 3) | Target (Phase 6) |
|--------|---------|------------------|------------------|
| **Statements** | 19.72% | 50% | 75% |
| **Branches** | 16.43% | 45% | 70% |
| **Functions** | 20.48% | 55% | 80% |
| **Lines** | 19.94% | 50% | 75% |

### Test Count Goals

| Category | Current | Target (Phase 3) | Target (Phase 6) |
|----------|---------|------------------|------------------|
| **Unit Tests** | 41 | 50 | 60 |
| **Integration Tests** | 14 | 30 | 40 |
| **E2E Tests** | 0 | 20 | 30 |
| **Performance Tests** | 0 | 5 | 10 |
| **Security Tests** | 0 | 5 | 10 |
| **Total** | 57 | 110 | 150 |

### Quality Goals

- ✅ All tests must pass before merge
- ✅ No failing tests in main branch
- ✅ Coverage must not decrease
- ✅ E2E tests run on every deployment
- ✅ Performance budgets enforced
- ✅ Security tests in CI/CD pipeline

---

## 🛠️ Implementation Checklist

### Week 1: Foundation
- [ ] Fix all failing tests
- [ ] Improve mock infrastructure
- [ ] Expand test fixtures
- [ ] Update test documentation

### Week 2-3: Integration Tests
- [ ] Authentication flow tests
- [ ] Streaming response tests
- [ ] Tool execution tests
- [ ] RAG system tests
- [ ] Billing tests

### Week 4-5: E2E Tests with Puppeteer
- [ ] Set up Puppeteer infrastructure
- [ ] Chat interface E2E tests
- [ ] Authentication E2E tests
- [ ] Swag interface E2E tests
- [ ] Transcription E2E tests
- [ ] Settings E2E tests
- [ ] API full-cycle tests

### Week 6: Performance
- [ ] Performance benchmarks
- [ ] Load testing
- [ ] Memory profiling

### Week 7: Security & Chaos
- [ ] Security tests
- [ ] Chaos engineering tests
- [ ] Penetration tests

### Week 8: CI/CD
- [ ] GitHub Actions workflow
- [ ] Pre-commit hooks
- [ ] Coverage reporting
- [ ] Automated deployment tests

---

## 📚 Resources & Tools

### Testing Frameworks
- **Jest**: Unit and integration testing
- **Puppeteer**: Browser automation and E2E testing
- **Playwright**: Alternative E2E framework (already installed)
- **SuperTest**: HTTP assertion library
- **k6**: Load testing tool

### Monitoring & Reporting
- **Codecov**: Code coverage reporting
- **Jest HTML Reporter**: Test results visualization
- **Lighthouse CI**: Performance monitoring
- **Artillery**: Load testing and performance

### Development Tools
- **Husky**: Git hooks for pre-commit tests
- **lint-staged**: Run tests on staged files only
- **npm-run-all**: Run multiple test suites in parallel

---

## 🎯 Priority Order for Immediate Action

### This Week (Week 1)
1. **Fix failing tests** (highest priority)
2. **Improve mock infrastructure**
3. **Add streaming response helpers**

### Next 2 Weeks (Weeks 2-3)
1. **Authentication flow integration tests**
2. **Streaming response integration tests**
3. **Tool execution integration tests**

### Following 2 Weeks (Weeks 4-5)
1. **Set up Puppeteer E2E infrastructure**
2. **Chat interface E2E tests**
3. **Authentication E2E tests**
4. **Swag interface E2E tests**

---

## 📝 Notes

- All new tests should follow the existing Jest patterns
- E2E tests should be independent and idempotent
- Use Page Object Model pattern for UI tests
- Mock external services in all tests
- Use fixtures for consistent test data
- Document test setup and teardown requirements
- Keep test execution time reasonable (<5 minutes for unit/integration)
- E2E tests can take longer but should be parallelizable
- Generate HTML reports for test results
- Track coverage trends over time

---

## Related Documentation

- `SECURITY_AUDIT_2025_01_24.md` - Security review findings
- `SECURITY_FIXES_2025_01_24.md` - Authentication fixes
- `TYPESCRIPT_FIXES_2025_01_24.md` - Frontend fixes
- `tests/README.md` - Current test documentation
- `.github/copilot-instructions.md` - Development workflow

