# Test Coverage Improvement Plan

**Date**: 2025-11-02  
**Status**: 📋 Planning Phase  
**Current Coverage**: Partial (41 passed suites, 1238 passed tests, 72 failures)

## Executive Summary

This plan outlines a systematic approach to improve test coverage across the Lambda LLM Proxy codebase. Currently, we have **139 source files** with **62 test suites**. Many critical modules lack comprehensive testing, and some existing tests are failing.

## Current State Analysis

### Test Statistics
- **Total Source Files**: 139 JavaScript files in `src/`
- **Total Test Suites**: 62 (52 ran, 10 skipped)
- **Passing Tests**: 1,238
- **Failing Tests**: 72
- **Skipped Tests**: 109
- **Test Suites Status**:
  - ✅ Passed: 41 suites
  - ❌ Failed: 11 suites
  - ⏭️ Skipped: 10 suites

### Coverage Gaps Identified

#### 🔴 High Priority - No Test Coverage

**Core Infrastructure** (Critical for system reliability):
1. `src/index.js` - Main Lambda handler (excluded from coverage intentionally, needs integration tests)
2. `src/lambda_search_llm_handler.js` - Core request handler
3. `src/credential-pool.js` - API key rotation and management
4. `src/memory-tracker.js` - Memory overflow protection

**Multi-Tenancy** (Recently implemented - Phase 1-4):
1. `src/services/user-isolation.js` - User data isolation utilities ⚠️ **NEW**
2. `src/services/google-sheets-feed.js` - Feed items multi-tenancy
3. `src/services/google-sheets-quiz.js` - Quiz multi-tenancy
4. `src/rag/sheets-storage.js` - RAG snippets/embeddings multi-tenancy ⚠️ **NEW**

**Authentication & Security**:
1. `src/utils/google-oauth-refresh.js` - OAuth token refresh
2. `src/utils/security-headers.js` - CORS and security headers
3. `src/endpoints/oauth.js` - OAuth flow endpoint

**Billing & Usage**:
1. `src/endpoints/billing.js` - Credit management
2. `src/endpoints/paypal.js` - Payment processing
3. `src/utils/credit-check.js` - Credit validation
4. `src/utils/credit-cache.js` - Credit caching layer

**RAG System** (Partial coverage):
1. `src/rag/embeddings.js` - Embedding generation
2. `src/rag/sheets-embedding-storage.js` - Embeddings persistence
3. `src/rag/libsql-storage.js` - LibSQL backend
4. `src/rag/indexeddb-storage.js` - Browser storage
5. `src/rag/user-spreadsheet.js` - User-specific RAG storage

**Endpoints** (Many untested):
1. `src/endpoints/feed.js` - Feed management
2. `src/endpoints/quiz.js` - Quiz management
3. `src/endpoints/sync.js` - Unified sync endpoint
4. `src/endpoints/rag-sync.js` - RAG sync endpoint ⚠️ **NEW**
5. `src/endpoints/transcribe.js` - Audio transcription
6. `src/endpoints/tts.js` - Text-to-speech
7. `src/endpoints/generate-image.js` - Image generation
8. `src/endpoints/image-edit.js` - Image editing
9. `src/endpoints/file.js` - File upload/download
10. `src/endpoints/convert.js` - File format conversion
11. `src/endpoints/v1-chat-completions.js` - OpenAI-compatible API
12. `src/endpoints/v1-models.js` - Model listing API

**Tools & Integrations**:
1. `src/tools/transcribe.js` - Audio transcription tool
2. `src/tools/youtube-downloader.js` - YouTube content download
3. `src/tools/audio-chunker.js` - Audio segmentation
4. `src/tools/image-search.js` - Image search tool
5. `src/tools/image-edit-tools.js` - Image editing tools
6. `src/tools/search_web.js` - Web search integration
7. `src/mcp/client.js` - Model Context Protocol client
8. `src/mcp/tool-cache.js` - MCP tool caching

**Services**:
1. `src/services/tracking-service.js` - Analytics tracking
2. `src/services/error-reporter.js` - Error reporting
3. `src/services/streaming-collator.js` - Stream aggregation
4. `src/services/feed-recommender.js` - Feed recommendation engine
5. `src/services/api-key-manager.js` - API key lifecycle management

**Scrapers** (Web content extraction):
1. `src/scrapers/tier-0-direct.js` - Direct fetch scraper
2. `src/scrapers/tier-1-puppeteer.js` - Puppeteer scraper
3. `src/scrapers/tier-2-playwright.js` - Playwright scraper
4. `src/scrapers/tier-3-selenium.js` - Selenium scraper
5. `src/scrapers/tier-4-interactive.js` - Interactive scraper
6. `src/scrapers/tier-orchestrator.js` - Scraper coordination
7. `src/scrapers/youtube-caption-scraper.js` - YouTube captions
8. `src/scrapers/site-config.js` - Site-specific configs

**Utilities**:
1. `src/utils/environment-config.js` - Environment variables
2. `src/utils/voice-response-generator.js` - Voice synthesis
3. `src/utils/catalog-loader.js` - Provider/model catalogs
4. `src/utils/languageInstructions.js` - Multi-language support

**LLM Providers** (Partial coverage):
1. `src/providers/provider-factory.js` - Provider instantiation
2. `src/image-providers/*.js` - Image generation providers (5 files)

**Config & Setup**:
1. `src/config/memory.js` - Memory limits configuration
2. `src/config/tokens.js` - Token limits configuration

**Rate Limiting**:
1. `src/groq-rate-limits.js` - Groq rate limit handling
2. `src/gemini-rate-limits.js` - Gemini rate limit handling

#### 🟡 Medium Priority - Partial Coverage

**Well-tested modules with room for improvement**:
1. `src/auth.js` - OAuth validation (has tests, could add edge cases)
2. `src/search.js` - DuckDuckGo search (has tests, needs error scenarios)
3. `src/tools.js` - Tool execution (72 failing tests - needs fixes)
4. `src/pricing.js` - Cost calculation (has tests, needs multi-tenant scenarios)

#### 🟢 Low Priority - Good Coverage

**Modules with comprehensive tests**:
- `src/model-selection/*.js` - Model selection logic
- `src/routing/*.js` - Health checking and load balancing
- `src/retry/*.js` - Retry and backoff strategies
- `src/guardrails/*.js` - Content filtering
- `src/utils/todos-manager.js` - Todo list management
- `src/streaming/*.js` - SSE streaming

### Failing Tests Analysis

**Current Failing Tests** (72 failures across 11 suites):
1. **Tools System** (tools.test.js):
   - `execute_javascript` tool returning undefined results
   - `transcribe_url` tool error message mismatch
   - Whisper disabled detection issues

**Root Causes**:
- Code changes without corresponding test updates
- Mock data not matching actual API responses
- Environment-dependent tests (Whisper enablement)
- Async timing issues in some integration tests

## Testing Strategy

### Phase 1: Fix Existing Failures (Week 1)
**Priority**: 🔴 Critical  
**Effort**: 2-3 days  
**Goal**: All existing tests passing

1. **Fix Tools Tests** (72 failures):
   - Debug `execute_javascript` return value handling
   - Update transcribe error message assertions
   - Add proper Whisper environment mocking
   - Review async/await patterns

2. **Fix Integration Tests**:
   - Review skipped tests (109 skipped)
   - Identify flaky tests
   - Add proper test isolation

3. **Success Criteria**:
   - ✅ 0 failing tests
   - ✅ < 10 skipped tests (only intentional skips)
   - ✅ All test suites passing

### Phase 2: Multi-Tenancy Testing (Week 1-2)
**Priority**: 🔴 Critical  
**Effort**: 3-4 days  
**Goal**: Verify Phase 1-4 implementation integrity

**Why Critical**: Recently completed multi-tenancy (Phases 1-4) has NO automated test coverage. This is a security and data isolation risk.

1. **Unit Tests for User Isolation**:
   ```
   tests/unit/services/user-isolation.test.js
   ```
   - Test `filterByUser()` with various data types
   - Test `verifyOwnership()` with edge cases
   - Test `buildUserFilter()` correctness

2. **Unit Tests for Sheets Storage**:
   ```
   tests/unit/rag/sheets-storage.test.js
   ```
   - Test snippet save with project_id
   - Test snippet load filtering by project_id
   - Test snippet delete ownership verification
   - Test embeddings multi-tenancy

3. **Integration Tests for RAG Sync**:
   ```
   tests/integration/rag-sync.test.js
   ```
   - Test push-snippets with project isolation
   - Test pull-snippets filters by project
   - Test cross-user access prevention
   - Test cross-project access prevention

4. **Integration Tests for Feed/Quiz Multi-Tenancy**:
   ```
   tests/integration/multi-tenancy.test.js
   ```
   - Test feed items isolated by user + project
   - Test quiz items isolated by user + project
   - Test unified sync respects project boundaries
   - Test device_id handling

5. **Success Criteria**:
   - ✅ 100% multi-tenancy code coverage
   - ✅ Automated tests for all CRUD operations
   - ✅ Cross-user/cross-project access prevention verified
   - ✅ Edge cases tested (null project_id, missing headers)

### Phase 3: Core Infrastructure Testing (Week 2-3)
**Priority**: 🔴 Critical  
**Effort**: 5-7 days  
**Goal**: Test critical system components

1. **Lambda Handler Integration Tests**:
   ```
   tests/integration/lambda-handler-comprehensive.test.js
   ```
   - Test all endpoints with authentication
   - Test rate limiting and credit deduction
   - Test error handling and logging
   - Test streaming response handling

2. **Credential Pool Tests**:
   ```
   tests/unit/credential-pool.test.js
   ```
   - Test API key rotation
   - Test rate limit tracking
   - Test fallback behavior
   - Test concurrent access

3. **Memory Tracker Tests**:
   ```
   tests/unit/memory-tracker.test.js
   ```
   - Test token counting accuracy
   - Test memory overflow prevention
   - Test content truncation
   - Test memory limit enforcement

4. **Success Criteria**:
   - ✅ Core system components fully tested
   - ✅ Critical path coverage > 90%
   - ✅ Error scenarios documented and tested

### Phase 4: Endpoint Coverage (Week 3-4)
**Priority**: 🟡 High  
**Effort**: 5-7 days  
**Goal**: Test all API endpoints

1. **Authentication & Billing**:
   ```
   tests/integration/oauth.test.js
   tests/integration/billing-paypal.test.js
   tests/unit/credit-management.test.js
   ```
   - OAuth flow testing
   - Credit check and deduction
   - PayPal webhook handling
   - Rate limit enforcement

2. **Content Endpoints**:
   ```
   tests/integration/transcribe.test.js
   tests/integration/tts.test.js
   tests/integration/image-generation.test.js
   tests/integration/file-operations.test.js
   ```
   - Audio transcription workflow
   - Text-to-speech generation
   - Image generation and editing
   - File upload/download/conversion

3. **Data Endpoints**:
   ```
   tests/integration/feed-quiz-sync.test.js
   tests/integration/rag-endpoints.test.js
   ```
   - Feed CRUD operations
   - Quiz CRUD operations
   - Unified sync endpoint
   - RAG sync endpoint

4. **OpenAI-Compatible API**:
   ```
   tests/integration/openai-api-compatibility.test.js
   ```
   - /v1/chat/completions endpoint
   - /v1/models endpoint
   - Streaming support
   - Error format compatibility

5. **Success Criteria**:
   - ✅ All endpoints have integration tests
   - ✅ Happy path + error scenarios covered
   - ✅ Multi-tenancy enforced in all endpoints
   - ✅ Rate limiting tested

### Phase 5: Tools & Integrations (Week 4-5)
**Priority**: 🟡 Medium  
**Effort**: 4-5 days  
**Goal**: Test external integrations

1. **Tool Execution Tests**:
   ```
   tests/unit/tools/transcribe.test.js
   tests/unit/tools/youtube-downloader.test.js
   tests/unit/tools/image-tools.test.js
   tests/unit/tools/search-web.test.js
   ```
   - Mock external APIs (OpenAI, Groq, YouTube)
   - Test parameter validation
   - Test error handling
   - Test quota management

2. **MCP Client Tests**:
   ```
   tests/unit/mcp/client.test.js
   tests/unit/mcp/tool-cache.test.js
   ```
   - MCP protocol compliance
   - Tool discovery and caching
   - Error handling
   - Connection lifecycle

3. **Scraper Tests**:
   ```
   tests/unit/scrapers/tier-orchestrator.test.js
   tests/unit/scrapers/tier-*.test.js
   ```
   - Tier fallback logic
   - Content extraction accuracy
   - Anti-bot detection handling
   - Timeout and error handling

4. **Success Criteria**:
   - ✅ All tools tested with mocked dependencies
   - ✅ Integration tests for critical tools
   - ✅ Scraper tier fallback verified

### Phase 6: Services & Utilities (Week 5-6)
**Priority**: 🟢 Lower  
**Effort**: 3-4 days  
**Goal**: Test supporting services

1. **Service Layer Tests**:
   ```
   tests/unit/services/tracking-service.test.js
   tests/unit/services/error-reporter.test.js
   tests/unit/services/feed-recommender.test.js
   tests/unit/services/api-key-manager.test.js
   ```
   - Google Sheets logging
   - Error reporting
   - Feed recommendation algorithm
   - API key lifecycle

2. **Utility Tests**:
   ```
   tests/unit/utils/environment-config.test.js
   tests/unit/utils/voice-response.test.js
   tests/unit/utils/catalog-loader.test.js
   ```
   - Environment variable parsing
   - Voice response generation
   - Catalog loading and validation

3. **Success Criteria**:
   - ✅ Service layer fully tested
   - ✅ Utility functions have unit tests
   - ✅ Edge cases covered

### Phase 7: Provider Testing (Week 6-7)
**Priority**: 🟢 Lower  
**Effort**: 2-3 days  
**Goal**: Complete provider coverage

1. **LLM Provider Tests**:
   ```
   tests/unit/providers/provider-factory.test.js
   tests/unit/providers/groq-extended.test.js
   tests/unit/providers/openai-extended.test.js
   ```
   - Provider instantiation
   - Error handling
   - Streaming support
   - Rate limit handling

2. **Image Provider Tests**:
   ```
   tests/unit/image-providers/gemini.test.js
   tests/unit/image-providers/openai.test.js
   tests/unit/image-providers/replicate.test.js
   tests/unit/image-providers/together.test.js
   tests/unit/image-providers/atlascloud.test.js
   ```
   - Image generation workflow
   - Parameter validation
   - Error handling
   - Rate limiting

3. **Success Criteria**:
   - ✅ All providers have unit tests
   - ✅ Provider factory tested
   - ✅ Error scenarios covered

## Test Organization

### Directory Structure
```
tests/
├── unit/                    # Unit tests (isolated, fast)
│   ├── services/           # Service layer tests
│   ├── endpoints/          # Endpoint handler tests
│   ├── providers/          # LLM/image provider tests
│   ├── tools/              # Tool execution tests
│   ├── scrapers/           # Scraper tests
│   ├── rag/                # RAG system tests
│   ├── utils/              # Utility function tests
│   └── mcp/                # MCP client tests
├── integration/            # Integration tests (slower, E2E)
│   ├── multi-tenancy.test.js
│   ├── oauth.test.js
│   ├── billing-paypal.test.js
│   └── ...
├── fixtures/               # Test data and mocks
│   ├── mock-responses/     # API response fixtures
│   ├── sample-files/       # Sample audio/video/documents
│   └── test-users.json     # Test user data
├── helpers/                # Test utilities
│   ├── auth-helpers.js     # Auth mocking
│   ├── sheets-helpers.js   # Google Sheets mocking
│   └── api-helpers.js      # API request helpers
└── manual/                 # Manual testing scripts
```

### Test Naming Conventions

**Unit Tests**:
- File: `tests/unit/<module-path>/<module-name>.test.js`
- Example: `tests/unit/services/user-isolation.test.js`

**Integration Tests**:
- File: `tests/integration/<feature-name>.test.js`
- Example: `tests/integration/multi-tenancy.test.js`

**Test Structure**:
```javascript
describe('ModuleName', () => {
  describe('functionName', () => {
    test('should handle happy path', () => { /* ... */ });
    test('should handle error case', () => { /* ... */ });
    test('should validate input', () => { /* ... */ });
  });
});
```

## Testing Best Practices

### 1. Test Isolation
- ✅ Use `beforeEach` to reset state
- ✅ Mock all external dependencies
- ✅ No shared state between tests
- ✅ Clean up resources in `afterEach`

### 2. Mock Strategy
- ✅ Mock AWS SDK (already in `tests/mockAwsSdk.js`)
- ✅ Mock Google Sheets API
- ✅ Mock LLM provider APIs (OpenAI, Groq, Gemini)
- ✅ Mock external services (YouTube, Tavily, PayPal)
- ✅ Use fixtures for consistent test data

### 3. Coverage Targets
- 🎯 **Critical Modules**: 90%+ coverage
  - Authentication, billing, multi-tenancy, core handlers
- 🎯 **Important Modules**: 80%+ coverage
  - Endpoints, tools, services
- 🎯 **Utilities**: 70%+ coverage
  - Helper functions, formatters

### 4. Test Types
- **Unit Tests**: Fast, isolated, mock all dependencies
- **Integration Tests**: Slower, test component interactions
- **E2E Tests**: Manual testing checklist (see below)

### 5. Continuous Integration
- ✅ Run tests on every commit (via Husky pre-commit hook)
- ✅ Block merges if tests fail
- ✅ Generate coverage reports
- ✅ Track coverage trends over time

## Coverage Monitoring

### Coverage Reports
```bash
# Generate HTML coverage report
npm run test:coverage

# View report
open coverage/index.html
```

### Coverage Thresholds
Add to `jest.config.json`:
```json
{
  "coverageThresholds": {
    "global": {
      "branches": 70,
      "functions": 75,
      "lines": 75,
      "statements": 75
    },
    "src/auth.js": {
      "branches": 90,
      "functions": 90,
      "lines": 90,
      "statements": 90
    },
    "src/services/user-isolation.js": {
      "branches": 90,
      "functions": 90,
      "lines": 90,
      "statements": 90
    }
  }
}
```

## Manual Testing Checklist

**Multi-Tenancy** (Priority: Critical):
- [ ] Create snippets in Project A as User 1
- [ ] Create snippets in Project B as User 1
- [ ] Verify User 1 cannot see User 2's snippets
- [ ] Verify Project A snippets don't appear in Project B
- [ ] Test feed items isolation
- [ ] Test quiz items isolation
- [ ] Test embeddings isolation

**Authentication**:
- [ ] Google OAuth login flow
- [ ] Token refresh on expiration
- [ ] Invalid token rejection
- [ ] Rate limiting per user

**Billing**:
- [ ] Credit deduction on API usage
- [ ] PayPal payment processing
- [ ] Credit balance display
- [ ] Free tier limits

**Endpoints**:
- [ ] /chat endpoint with streaming
- [ ] /transcribe with YouTube URL
- [ ] /tts voice generation
- [ ] /generate-image with various providers
- [ ] /feed CRUD operations
- [ ] /quiz CRUD operations

## Timeline & Milestones

### Week 1
- ✅ Fix all failing tests (72 failures)
- ✅ Create multi-tenancy unit tests
- 🎯 **Milestone**: Zero test failures, multi-tenancy tested

### Week 2
- ✅ Complete multi-tenancy integration tests
- ✅ Test core infrastructure (credential pool, memory tracker)
- 🎯 **Milestone**: Critical security features tested

### Week 3-4
- ✅ Test all API endpoints
- ✅ Add OpenAI API compatibility tests
- 🎯 **Milestone**: All endpoints have tests

### Week 5-6
- ✅ Test tools and integrations
- ✅ Test services and utilities
- 🎯 **Milestone**: Supporting systems tested

### Week 7
- ✅ Test all providers
- ✅ Optimize test performance
- 🎯 **Milestone**: 75%+ overall coverage

## Quick Wins (Can start immediately)

1. **Fix Failing Tests** (Day 1):
   - Debug tools.test.js failures
   - Update error message assertions
   - Fix async timing issues

2. **Add Multi-Tenancy Tests** (Day 2-3):
   - Critical for security
   - Recently implemented, no tests yet
   - High impact, medium effort

3. **Add Endpoint Health Tests** (Day 4-5):
   - Simple smoke tests for all endpoints
   - Verify they respond without errors
   - Fast to implement, high visibility

## Success Metrics

### Short-term (1 month)
- ✅ Zero failing tests
- ✅ Multi-tenancy: 100% coverage
- ✅ Core infrastructure: 90%+ coverage
- ✅ All endpoints have basic tests

### Medium-term (2 months)
- ✅ Overall coverage: 75%+
- ✅ All tools tested with mocks
- ✅ All providers tested
- ✅ Integration test suite complete

### Long-term (3+ months)
- ✅ Overall coverage: 85%+
- ✅ Automated E2E tests
- ✅ Performance benchmarks
- ✅ Load testing setup

## Resources Needed

### Tools
- Jest (already installed)
- Supertest for HTTP testing (consider adding)
- nock for HTTP mocking (consider adding)
- faker for test data generation (consider adding)

### Documentation
- Testing guidelines document
- Mock data documentation
- CI/CD pipeline setup

### Time Investment
- **Phase 1 (Critical)**: 2 weeks (fix failures, multi-tenancy, core)
- **Phase 2 (Important)**: 3 weeks (endpoints, tools, services)
- **Phase 3 (Nice-to-have)**: 2 weeks (providers, optimization)
- **Total**: ~7 weeks for comprehensive coverage

## Risk Assessment

### High Risk - No Tests
- Multi-tenancy implementation (data leak potential)
- Authentication & billing (security/financial risk)
- Credential pool (API key exposure)

### Medium Risk - Partial Tests
- Tools execution (has tests, but 72 failures)
- Scrapers (complex, external dependencies)

### Low Risk - Good Tests
- Model selection (well tested)
- Routing & health checks (comprehensive)
- Retry logic (solid coverage)

## Next Steps

1. **Immediate** (This week):
   - [ ] Fix all failing tests
   - [ ] Create multi-tenancy test suite
   - [ ] Set up coverage reporting

2. **Short-term** (This month):
   - [ ] Test core infrastructure
   - [ ] Test all endpoints
   - [ ] Reach 75% coverage

3. **Long-term** (Next quarter):
   - [ ] Complete tool/service testing
   - [ ] Add E2E tests
   - [ ] Reach 85% coverage

## Related Documentation

- `developer_log/IMPLEMENTATION_MULTI_TENANCY.md` - Multi-tenancy implementation
- `developer_log/PHASE_*.md` - Phase-specific documentation
- `.github/copilot-instructions.md` - TDD workflow requirements
- `jest.config.json` - Jest configuration
- `tests/README.md` - Test organization (to be created)

---

**Plan Status**: 📋 Ready for Implementation  
**Owner**: Development Team  
**Priority**: 🔴 Critical (Multi-tenancy testing is urgent)  
**Estimated Effort**: 7 weeks for comprehensive coverage
