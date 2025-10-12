# Testing Report and Comprehensive Testing Plan

**Date**: October 12, 2025  
**Project**: LambdaLLMProxy  
**Test Framework**: Jest 29.x  

---

## Executive Summary

**Current State:**
- ✅ **728 total tests** implemented
- ✅ **685 tests passing** (94% pass rate)
- ⚠️ **29 tests failing** (4% failure rate)
- ℹ️ **14 tests skipped** (2% skipped)
- ⏱️ **Test suite runtime:** 75.4 seconds
- 📊 **Test suites:** 36 total (26 passing, 10 failing)

**Overall Assessment**: **GOOD** - High test coverage with mostly passing tests, but requires attention to fix failing tests and improve coverage in critical areas.

---

## 1. Current Testing State

### 1.1. Test Organization

```
tests/
├── unit/                      # 28 test files - Isolated module tests
│   ├── auth.test.js           # Authentication and token validation
│   ├── model-*.test.js        # Model selection and categorization (4 files)
│   ├── endpoints/             # Endpoint handlers (4 files)
│   ├── *.test.js              # Utilities, prompts, services, etc.
│   └── ...
├── integration/               # 8 test files - End-to-end tests
│   ├── lambda-handler.test.js # Complete Lambda flow
│   ├── chat-endpoint.test.js  # Chat endpoint integration
│   ├── endpoints.test.js      # Router and endpoint routing
│   └── ...
├── helpers/                   # Test utilities
│   ├── testUtils.js           # Common test helpers
│   └── sse-test-utils.js      # SSE stream testing
├── fixtures/                  # Mock data
│   └── mockData.js
└── setup.js                   # Jest configuration

Frontend Tests: NONE (Critical gap - see section 3.2)
```

### 1.2. Test Coverage by Category

| Category | Test Files | Status | Notes |
|----------|-----------|--------|-------|
| **Core Lambda** | 2 | ✅ Good | Handler and routing |
| **Authentication** | 1 | ✅ Good | OAuth token validation |
| **Model Management** | 5 | ✅ Good | Selection, categorization, config |
| **Endpoints** | 8 | ⚠️ Some Failures | Chat, search, planning, proxy, static |
| **Tools** | 0 | ❌ Missing | CRITICAL GAP |
| **Web Scraping** | 0 | ❌ Missing | HTML parser untested |
| **Load Balancing** | 1 | ✅ Good | Load balancer logic |
| **Rate Limiting** | 1 | ✅ Good | Rate limit tracking |
| **Error Handling** | 2 | ✅ Good | Circuit breaker, classifier |
| **Services** | 1 | ✅ Good | Service integrations |
| **Frontend** | 0 | ❌ Missing | CRITICAL GAP |

### 1.3. Failing Tests Analysis

**Main Router Integration Tests** (5 failures in `endpoints.test.js`):
- Static file routing (404 vs 200)
- Method not allowed (405 status codes)
- Error handling (500 status codes)
- CORS headers in responses

**Root Cause**: Mock stream metadata not being properly set or checked.  
**Impact**: Medium - These are integration tests, core functionality may still work.  
**Fix Priority**: High - Indicates routing issues.

**Other Failures** (24 across various suites):
- Need detailed investigation per suite
- Many appear to be mocking or assertion issues
- Some may be outdated tests after code changes

---

## 2. Test Coverage Analysis

### 2.1. Well-Tested Areas ✅

1. **Authentication & Authorization**
   - Google OAuth token validation
   - Email verification
   - Token refresh handling
   - Unauthorized access handling

2. **Model Management**
   - Provider selection algorithm
   - Model categorization (fast/general/advanced/vision)
   - Model configuration and capabilities
   - Legacy model selector compatibility

3. **Load Balancing & Resilience**
   - Load balancer logic
   - Rate limit tracking
   - Circuit breaker pattern
   - Retry strategies
   - Backoff algorithms

4. **Core Routing**
   - Endpoint routing
   - Request parsing
   - Response formatting
   - SSE streaming basics

5. **Utilities**
   - Token calculation
   - Weighted scoring
   - Prompt management
   - Error classification

### 2.2. Untested or Poorly Tested Areas ❌

#### CRITICAL GAPS (Priority 1):

1. **Tools System** - 0% coverage
   - `src/tools.js` (3,175 lines) - UNTESTED
   - Tool execution flow
   - Parameter validation
   - Error handling in tools
   - Tool result formatting
   - **Risk**: Tool execution is core functionality, complete failure possible

2. **Web Scraping** - 0% coverage
   - `src/html-parser.js` (443 lines) - UNTESTED
   - SimpleHTMLParser class
   - Image extraction with relevance scoring
   - Link extraction and filtering
   - Content extraction
   - **Risk**: Broken scraping affects search quality

3. **Frontend React Application** - 0% coverage
   - `ui-new/src/` (20,000+ lines) - UNTESTED
   - All React components
   - Context providers
   - Custom hooks
   - API client
   - **Risk**: UI bugs invisible until user reports

4. **Streaming Response Handler** - Minimal coverage
   - SSE message formatting
   - Stream error recovery
   - Progress events
   - **Risk**: Streaming is core UX feature

#### HIGH RISK GAPS (Priority 2):

5. **Provider Integrations**
   - `src/providers/*.js` - Minimal coverage
   - OpenAI, Anthropic, Groq, Gemini, etc.
   - API error handling
   - Response parsing
   - Token counting
   - **Risk**: Provider-specific bugs

6. **Chat Endpoint Logic**
   - Tool call iteration loop
   - Memory management
   - Context truncation
   - LLM transparency tracking
   - **Risk**: Memory overflow, infinite loops

7. **Cache System**
   - Search cache
   - Scrape cache
   - Cache invalidation
   - **Risk**: Stale data, cache poisoning

8. **Environment Configuration**
   - `.env` parsing
   - Lambda environment variables
   - Configuration validation
   - **Risk**: Deployment failures

#### MEDIUM RISK GAPS (Priority 3):

9. **Google Services Integration**
   - Google Docs save
   - OAuth flow
   - Token refresh
   - **Risk**: Integration breaks

10. **MCP Server Integration**
    - Server discovery
    - Tool routing
    - Error handling
    - **Risk**: MCP features fail

11. **Puppeteer Lambda**
    - Browser launching
    - Page scraping
    - Memory cleanup
    - **Risk**: Lambda timeouts, memory leaks

12. **Usage Tracking**
    - Token counting
    - Cost calculation
    - Usage storage
    - **Risk**: Incorrect billing

---

## 3. Testing Plan - Prioritized Implementation

### Phase 1: Fix Existing Failures (Week 1)

**Goal**: Get to 100% test pass rate

**Tasks**:
1. Investigate and fix router integration test failures (5 tests)
   - Fix mock stream metadata handling
   - Update assertions to match actual behavior
   - Verify CORS header handling

2. Investigate and fix remaining 24 test failures
   - Categorize by root cause
   - Update mocks if APIs changed
   - Fix assertions if expected behavior changed

3. Review and re-enable 14 skipped tests
   - Determine why they were skipped
   - Fix or remove permanently

**Deliverable**: All tests passing (728/728)  
**Estimated Time**: 1-2 days

### Phase 2: Critical Missing Coverage (Week 2-3)

**Goal**: Test highest-risk untested code

#### 2.1. Tools System Tests (Priority 1 - CRITICAL)

**Test File**: `tests/unit/tools.test.js`

```javascript
describe('Tools System', () => {
  describe('Tool Execution', () => {
    it('should execute search_web tool with valid parameters')
    it('should validate required parameters')
    it('should handle missing parameters gracefully')
    it('should handle tool execution errors')
    it('should format tool results correctly')
    it('should handle timeout in tool execution')
  })
  
  describe('Tool Parameter Validation', () => {
    it('should validate search_web parameters')
    it('should validate scrape_web_content parameters')
    it('should validate execute_javascript parameters')
    it('should validate generate_chart parameters')
    it('should reject invalid parameter types')
    it('should use default values for optional parameters')
  })
  
  describe('Tool Result Formatting', () => {
    it('should format search results correctly')
    it('should format scrape results with images/links')
    it('should format javascript execution results')
    it('should handle tool result errors')
  })
})
```

**Estimated Tests**: 25-30  
**Coverage Target**: 80%+ of `src/tools.js`

#### 2.2. Web Scraping Tests (Priority 1 - CRITICAL)

**Test File**: `tests/unit/html-parser.test.js`

```javascript
describe('SimpleHTMLParser', () => {
  describe('Image Extraction', () => {
    it('should extract images with src URLs')
    it('should extract image captions from alt text')
    it('should extract image captions from figcaption')
    it('should extract image captions from nearby text')
    it('should calculate relevance scores based on query')
    it('should filter out tracking pixels')
    it('should filter out small icons')
    it('should prioritize large images')
    it('should limit results to specified count')
  })
  
  describe('Link Extraction', () => {
    it('should extract links with href')
    it('should calculate relevance based on query')
    it('should filter navigation links')
    it('should filter footer links')
    it('should filter ad domain links')
    it('should categorize YouTube links')
    it('should categorize video links')
    it('should categorize audio links')
    it('should limit results to maxLinks')
  })
  
  describe('Content Extraction', () => {
    it('should extract readable text')
    it('should strip HTML tags')
    it('should preserve important structure')
    it('should handle malformed HTML')
  })
})
```

**Estimated Tests**: 30-35  
**Coverage Target**: 85%+ of `src/html-parser.js`

#### 2.3. Streaming Response Tests (Priority 1 - CRITICAL)

**Test File**: `tests/unit/streaming.test.js`

```javascript
describe('SSE Streaming', () => {
  describe('Message Formatting', () => {
    it('should format SSE message correctly')
    it('should handle multiline data')
    it('should include event type')
    it('should include message ID')
  })
  
  describe('Stream Error Handling', () => {
    it('should recover from write errors')
    it('should close stream on critical errors')
    it('should send error events to client')
  })
  
  describe('Progress Events', () => {
    it('should emit tool_call_start events')
    it('should emit tool_call_progress events')
    it('should emit tool_call_complete events')
    it('should emit message_complete events')
  })
})
```

**Estimated Tests**: 15-20  
**Coverage Target**: 80%+ of streaming logic

### Phase 3: Provider Integration Tests (Week 4)

**Goal**: Test all LLM provider integrations

**Test Files**: 
- `tests/unit/providers/openai.test.js`
- `tests/unit/providers/anthropic.test.js`
- `tests/unit/providers/groq.test.js`
- `tests/unit/providers/gemini.test.js`
- `tests/unit/providers/replicate.test.js`

**Tests Per Provider** (~15 tests each):
- API request formatting
- Response parsing
- Error handling (rate limits, invalid keys, etc.)
- Token counting
- Stream handling
- Cost calculation

**Total Tests**: ~75  
**Coverage Target**: 75%+ of provider code

### Phase 4: Frontend Testing (Week 5-6)

**Goal**: Test React components and UI logic

**Setup**: 
- Install React Testing Library
- Configure Jest for JSX/TypeScript
- Set up mock providers

**Priority Components**:

1. **ChatTab.tsx** (4,391 lines - largest component)
   - Message rendering
   - Streaming updates
   - Tool result display
   - Image gallery
   - SWAG capture
   - **Estimated Tests**: 50+

2. **AuthContext.tsx** (authentication flow)
   - Google OAuth login
   - Token refresh
   - Logout
   - **Estimated Tests**: 15

3. **SettingsContext.tsx** (settings management)
   - Provider configuration
   - Settings persistence
   - Validation
   - **Estimated Tests**: 20

4. **API Client** (`utils/api.ts`)
   - Request formatting
   - Response parsing
   - Error handling
   - Streaming support
   - **Estimated Tests**: 25

**Total Frontend Tests**: ~110  
**Coverage Target**: 60%+ (lower for UI, focus on logic)

### Phase 5: Integration and E2E Tests (Week 7-8)

**Goal**: Test complete user flows

**Test Scenarios**:

1. **Complete Chat Flow**
   - User sends message → LLM response → Tool execution → Final response
   - Tests: 5-10 complete flows with different tools

2. **Authentication Flow**
   - Login → Token refresh → API calls → Logout
   - Tests: 5 scenarios

3. **Search and Scrape Flow**
   - Search query → Results → Scrape page → Display content
   - Tests: 8-10 scenarios

4. **Error Recovery**
   - Rate limit → Retry → Success
   - Invalid token → Refresh → Success
   - Tool error → Fallback → Partial success
   - Tests: 10 scenarios

5. **Streaming Scenarios**
   - Normal streaming
   - Stream interrupted
   - Stream resumed
   - Tests: 8 scenarios

**Total Integration Tests**: 40-50  
**Coverage Target**: Critical paths covered

---

## 4. Testing Infrastructure Improvements

### 4.1. Current Setup ✅

- Jest 29.x configured
- Test helpers and utilities
- Mock data fixtures
- SSE testing utilities

### 4.2. Needed Improvements

1. **Coverage Reporting**
   ```bash
   npm test -- --coverage --coverageReporters=text --coverageReporters=html
   ```
   - Generate HTML coverage reports
   - Set coverage thresholds in `package.json`
   - Fail builds if coverage drops

2. **Frontend Test Setup**
   ```bash
   npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event
   ```
   - Configure Jest for React/TypeScript
   - Set up mock providers
   - Create component test templates

3. **CI/CD Integration**
   - Run tests on every commit (GitHub Actions)
   - Block merges if tests fail
   - Report coverage to PR

4. **Test Data Management**
   - Expand `tests/fixtures/` with realistic data
   - Create test data generators
   - Version test data with schema changes

5. **Performance Testing**
   - Benchmark critical operations
   - Monitor test suite performance
   - Identify slow tests

---

## 5. Coverage Targets

### 5.1. Coverage Goals by Phase

| Phase | Timeline | Coverage Target | Tests Added |
|-------|----------|-----------------|-------------|
| Phase 0 (Current) | - | ~40% (estimated) | 728 |
| Phase 1 | Week 1 | 40% + fixes | 0 (fix existing) |
| Phase 2 | Week 2-3 | 60% | +70-85 |
| Phase 3 | Week 4 | 70% | +75 |
| Phase 4 | Week 5-6 | 75% | +110 |
| Phase 5 | Week 7-8 | 80% | +50 |
| **Total** | **2 months** | **80%** | **~1,033 tests** |

### 5.2. Module-Specific Targets

| Module | Current | Target | Priority |
|--------|---------|--------|----------|
| Authentication | 80% | 90% | High |
| Tools | 0% | 80% | Critical |
| Scraping | 0% | 85% | Critical |
| Providers | 20% | 75% | High |
| Streaming | 30% | 80% | Critical |
| Frontend | 0% | 60% | High |
| Endpoints | 50% | 75% | High |
| Utilities | 70% | 85% | Medium |

---

## 6. Testing Best Practices (Standards)

### 6.1. Test Structure

```javascript
describe('FeatureName', () => {
  describe('SubFeature', () => {
    // Setup
    beforeEach(() => {
      // Reset mocks
      // Set up test data
    });
    
    afterEach(() => {
      // Cleanup
    });
    
    // Tests
    it('should do something specific', async () => {
      // Arrange
      const input = { ... };
      
      // Act
      const result = await functionUnderTest(input);
      
      // Assert
      expect(result).toEqual(expectedOutput);
    });
    
    it('should handle errors gracefully', async () => {
      // Test error cases
    });
  });
});
```

### 6.2. Mock Strategy

**External Services** - Always mock:
- LLM APIs (OpenAI, Anthropic, etc.)
- Search APIs (Tavily, DuckDuckGo)
- AWS services (Lambda, S3, CloudWatch)
- Google APIs (OAuth, Docs)

**Internal Modules** - Mock selectively:
- File system operations
- Network requests
- Database queries
- Time-dependent functions

**Don't Mock**:
- Pure utility functions
- Data structures
- Simple transformations

### 6.3. Test Data

```javascript
// Use fixtures for complex data
const mockChatMessage = require('../fixtures/chatMessage');

// Use factories for variations
const createMockUser = (overrides = {}) => ({
  email: 'test@example.com',
  name: 'Test User',
  ...overrides
});

// Use builders for complex scenarios
const chatScenario = new ChatScenarioBuilder()
  .withUserMessage('Hello')
  .withToolCall('search_web')
  .withToolResult({ results: [...] })
  .withAssistantResponse('Here are the results')
  .build();
```

---

## 7. Quick Wins (Immediate Actions)

### 7.1. This Week

1. **Fix Failing Tests** (Priority 1)
   - Focus: `endpoints.test.js` failures
   - Time: 4-6 hours
   - Impact: Get to green build

2. **Add Tools Tests** (Priority 1)
   - Focus: Parameter validation
   - Time: 6-8 hours
   - Impact: 20% coverage increase

3. **Add HTML Parser Tests** (Priority 1)
   - Focus: Image/link extraction
   - Time: 6-8 hours
   - Impact: Critical functionality tested

### 7.2. Next Week

4. **Add Provider Tests** (Priority 2)
   - Focus: OpenAI and Anthropic first
   - Time: 8-10 hours
   - Impact: 15% coverage increase

5. **Set Up Frontend Testing** (Priority 2)
   - Focus: Infrastructure and first component
   - Time: 6-8 hours
   - Impact: Foundation for UI tests

---

## 8. Success Metrics

### 8.1. Quantitative Metrics

- **Test Pass Rate**: 100% (currently 94%)
- **Code Coverage**: 80% (currently ~40%)
- **Test Count**: 1,000+ (currently 728)
- **Test Suite Speed**: <2 minutes (currently 75 seconds)
- **Zero Skipped Tests**: (currently 14 skipped)

### 8.2. Qualitative Metrics

- All critical paths have integration tests
- All tools have comprehensive unit tests
- Frontend components have behavior tests
- Error scenarios are well-covered
- Tests serve as documentation

### 8.3. Process Metrics

- Tests run on every commit (CI/CD)
- Coverage reported on every PR
- Tests written before or with code (TDD)
- No commits without passing tests
- Coverage never decreases

---

## 9. Risks and Mitigation

### 9.1. Identified Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Tests too slow | Devs skip tests | Medium | Optimize slow tests, run in parallel |
| Mock complexity | Tests brittle | High | Simplify mocks, use test utilities |
| Outdated tests | False confidence | Medium | Regular review, update with code |
| Coverage gaps | Production bugs | High | Prioritized testing plan, monitoring |
| Frontend test setup | Delayed UI testing | Medium | Allocate dedicated time, get help |

### 9.2. Risk Mitigation Actions

1. **Weekly Test Review**: Review test failures and coverage
2. **Test Maintenance Sprint**: Monthly cleanup of outdated tests
3. **Pair Programming**: Complex tests written in pairs
4. **Test Documentation**: Document complex test scenarios
5. **Coverage Monitoring**: Alert if coverage drops >5%

---

## 10. Resources and Timeline

### 10.1. Effort Estimates

| Phase | Developer Days | Calendar Time |
|-------|---------------|---------------|
| Phase 1 (Fix) | 2 days | Week 1 |
| Phase 2 (Critical) | 5 days | Weeks 2-3 |
| Phase 3 (Providers) | 3 days | Week 4 |
| Phase 4 (Frontend) | 6 days | Weeks 5-6 |
| Phase 5 (Integration) | 4 days | Weeks 7-8 |
| **Total** | **20 days** | **8 weeks** |

### 10.2. Resource Needs

- **1 Developer** (full-time for testing)
- **Code Review** from team
- **Frontend Testing Expertise** (consultant or training)
- **CI/CD Setup** (DevOps support)

### 10.3. Milestones

1. **Week 1**: All tests passing ✅
2. **Week 3**: 60% coverage, tools tested ✅
3. **Week 4**: 70% coverage, providers tested ✅
4. **Week 6**: 75% coverage, frontend foundation ✅
5. **Week 8**: 80% coverage, integration tests ✅

---

## 11. Conclusion

### Current State Summary
- **Good foundation**: 728 tests, 94% passing
- **Critical gaps**: Tools, scraping, frontend untested
- **Immediate action needed**: Fix 29 failing tests

### Recommended Approach
1. **Fix failing tests first** (Week 1)
2. **Test critical untested code** (Weeks 2-4)
3. **Build frontend testing** (Weeks 5-6)
4. **Add integration tests** (Weeks 7-8)

### Expected Outcome
- **80% code coverage**
- **1,000+ tests**
- **100% pass rate**
- **Confidence in deployments**
- **Faster development cycles**

### Next Steps
1. Review this plan with team
2. Allocate resources
3. Start Phase 1 (fix failures)
4. Schedule weekly reviews
5. Track progress with metrics

---

## 12. Consolidated Testing Checklists (from Developer Logs)

**Source**: Extracted from 331 developer log files  
**Last Updated**: October 12, 2025

### 12.1. Authentication Testing

- [ ] **Fresh Login Flow**: Clear localStorage, visit app → should see LoginScreen
- [ ] **Google Sign-In**: Click button → OAuth flow → successful login
- [ ] **UI Visibility**: After login → full app UI visible (header, chat, settings)
- [ ] **User Display**: Header shows user picture, name, email, logout button
- [ ] **Auto-Login**: Refresh page → should stay logged in (no login screen)
- [ ] **Silent Refresh**: Wait for token expiry → should refresh without popup
- [ ] **Logout**: Click Sign Out → returns to LoginScreen, localStorage cleared
- [ ] **One Tap**: Return as recent user → may see One Tap for instant sign-in
- [ ] **Expired Token on Load**: Old token in localStorage → silent refresh or show LoginScreen
- [ ] **Invalid Token**: Corrupted localStorage → show LoginScreen, clear state
- [ ] **Network Failure**: Silent refresh fails → logout gracefully

### 12.2. Chat & UI Testing

#### Basic Message Flow
- [ ] **Send User Message**: Type message, click Send or Enter → appears on right side with blue background
- [ ] **Receive Assistant Response**: Wait for response → appears on left side with gray background
- [ ] **Empty Chat State**: No messages → shows welcome message or placeholder
- [ ] **Message Alignment**: User messages right-aligned, assistant messages left-aligned
- [ ] **Reset Button**: User messages have 🔄 reset button on left side
- [ ] **No Reset on Assistant**: Assistant messages should not have reset button

#### Retry Functionality
- [ ] **Retry Button Display**: First retry shows "Try Again" (no number)
- [ ] **Retry Counter**: Second retry shows "Try Again (2)", third shows "Try Again (3)"
- [ ] **No Zero Counter**: Initial retry should never show "(0)"
- [ ] **Retry Auto-Submit**: Click "Try Again" → failed message removed, user message restored, request auto-submitted
- [ ] **Multiple Retries**: Test up to 3 retries, counter increments correctly

#### Tool Results Display
- [ ] **Web Search Results**: Search results displayed with URLs, summaries
- [ ] **Code Execution Output**: JavaScript execution results shown
- [ ] **Scraped Content**: URL content extracted and displayed
- [ ] **YouTube Search**: Video results with thumbnails (if available)
- [ ] **YouTube Transcripts**: Transcript text displayed
- [ ] **Generated Charts**: Mermaid charts rendered
- [ ] **Generated Images**: Images displayed with proper formatting
- [ ] **Location Data**: Location information displayed when granted
- [ ] **Transcription Output**: Audio/video transcription text shown

#### Extracted Content
- [ ] **Content Sections**: Expandable sections for URLs, images, videos
- [ ] **Image Gallery**: Priority images displayed (3 max)
- [ ] **Gallery Error Handling**: Failed images hidden, priority images replaced with next available
- [ ] **Expandable Media**: Full image/video list expandable
- [ ] **Grab Buttons**: All images have grab button for SWAG capture
- [ ] **No +X More Block**: Selected images gallery should not show "+2 more" block

### 12.3. SWAG (Snippets with A Grab) Testing

#### Single Image Capture
- [ ] **Grab from Gallery**: Click grab button on priority image → added to SWAG as base64
- [ ] **Grab from Expandable**: Click grab button in expandable list → added to SWAG as base64
- [ ] **Base64 Encoding**: Verify grabbed image is stored as data URI (data:image/...)
- [ ] **SWAG Display**: Grabbed image displays correctly in SWAG panel
- [ ] **Image Quality**: Base64 image should be resized (max 1200px) but maintain quality

#### Full Content Capture
- [ ] **Capture Button**: Click "Capture to SWAG" button
- [ ] **Multiple Images**: Full content with multiple images captured
- [ ] **All Images Base64**: Verify all <img> tags use base64 data URIs
- [ ] **Content Formatting**: HTML formatting preserved
- [ ] **Tool Results Included**: Tool results (if selected) included in capture

#### Storage & Export
- [ ] **SWAG Export**: Export SWAG → verify base64 images included in HTML
- [ ] **SWAG Import**: Import SWAG → verify base64 images display correctly
- [ ] **Storage Size**: Check browser storage usage (base64 is larger than URLs)
- [ ] **Memory Constraints**: Test on mobile devices with limited memory
- [ ] **Large Images**: Test with images >5MB → should be resized
- [ ] **Broken URLs**: Test with 404 image URLs → fallback to original URL
- [ ] **CORS-Restricted**: Test with CORS-restricted images → should use backend proxy

### 12.4. Tool Execution Testing

#### Web Search Tool
- [ ] **Basic Search**: "What are the latest AI developments?" → returns search results
- [ ] **Multiple Results**: Search returns multiple results (up to 10)
- [ ] **Content Extraction**: Each result includes summary/content
- [ ] **URL Validation**: All result URLs are valid and accessible
- [ ] **Cache Behavior**: Repeated search uses cache (check logs)

#### Code Execution Tool (execute_js)
- [ ] **Simple Calculation**: "Calculate 2+2" → returns 4
- [ ] **Console Output**: "Run: console.log('Hello World')" → returns "Hello World"
- [ ] **Complex Code**: Multi-line JavaScript execution
- [ ] **Error Handling**: Invalid JavaScript → proper error message
- [ ] **Timeout**: Long-running code (>5s) → timeout error

#### URL Scraping Tool (scrape_url)
- [ ] **Simple Page**: Scrape basic HTML page → returns content
- [ ] **JavaScript-Heavy**: Scrape SPA (React/Vue) → uses Puppeteer fallback
- [ ] **Large Page**: Scrape page >1MB → content truncated appropriately
- [ ] **404 Error**: Scrape invalid URL → proper error message
- [ ] **CORS Handling**: Scraping handles CORS restrictions

#### YouTube Tools
- [ ] **YouTube Search**: "Search YouTube for Python tutorials" → returns videos
- [ ] **Transcript Extraction**: Get transcript from video URL → returns text
- [ ] **No Transcript Available**: Video without transcript → proper error message
- [ ] **Long Transcript**: Video >1 hour → transcript truncated if needed
- [ ] **OAuth Required**: Transcript requiring auth → handles gracefully

#### Chart Generation Tool
- [ ] **Generate Chart**: Request Mermaid chart → chart rendered
- [ ] **Chart Types**: Test flowchart, sequence diagram, class diagram
- [ ] **Chart Errors**: Invalid Mermaid syntax → error message with fix button
- [ ] **Fix Chart**: Click fix button → corrected chart

#### Image Generation Tool
- [ ] **Generate Image**: "Generate image of a sunset" → returns image URL
- [ ] **Image Display**: Generated image displays in chat
- [ ] **Provider Failover**: If one provider fails, tries next
- [ ] **NSFW Filter**: Inappropriate content request → filtered/rejected

#### Location Tool
- [ ] **Permission Request**: First use → prompts for location permission
- [ ] **Grant Permission**: Allow location → lat/lon captured
- [ ] **Deny Permission**: Deny location → graceful fallback
- [ ] **Location Accuracy**: High accuracy mode enabled
- [ ] **Reverse Geocoding**: Location converted to address (Nominatim)
- [ ] **24-Hour Cache**: Location cached for 24 hours
- [ ] **Expiry Handling**: After 24 hours → re-requests location

#### Transcription Tool
- [ ] **Audio File**: Upload audio → transcription starts
- [ ] **Video File**: Upload video → audio extracted, transcribed
- [ ] **Progress Display**: Transcription progress shown (if implemented)
- [ ] **Long File**: >1 hour file → handles appropriately
- [ ] **Unsupported Format**: Invalid file type → error message

### 12.5. Streaming & Response Testing

- [ ] **SSE Connection**: Streaming starts → events received
- [ ] **Streaming Content**: Partial content appears in real-time
- [ ] **Tool Calls During Stream**: Tools execute mid-stream
- [ ] **Stream Completion**: Final message_complete event received
- [ ] **Stream Interruption**: Network loss → proper error handling
- [ ] **Resume Stream**: Connection restored → continues or restarts
- [ ] **Multiple Concurrent Streams**: Test parallel conversations
- [ ] **Stream Cancellation**: Abort stream → proper cleanup

### 12.6. Error Handling Testing

#### Request Errors
- [ ] **Invalid JSON**: Malformed request body → 400 error with message
- [ ] **Missing Fields**: Required fields missing → 400 error with details
- [ ] **Invalid Model**: Non-existent model → 404 error
- [ ] **Empty Messages**: No messages in request → 400 error

#### Authentication Errors
- [ ] **Missing Token**: No auth token → 401 error
- [ ] **Invalid Token**: Corrupted token → 401 error
- [ ] **Expired Token**: Old token → auto-refresh or 401 error

#### Provider Errors
- [ ] **API Key Missing**: Provider key missing → proper error message
- [ ] **Rate Limit (429)**: Too many requests → retry with backoff
- [ ] **Provider Down**: Provider unavailable → failover to next provider
- [ ] **Timeout**: Request timeout → proper error message
- [ ] **Model Not Available**: Model not found on provider → try next

#### Tool Errors
- [ ] **Tool Execution Failure**: Tool throws error → error displayed to user
- [ ] **Tool Timeout**: Tool exceeds timeout → cancellation message
- [ ] **Tool Not Found**: Unknown tool called → error message
- [ ] **Tool Parameter Validation**: Invalid parameters → validation error

### 12.7. Performance Testing

#### Load Testing
- [ ] **10 Concurrent Users**: All receive responses within acceptable time
- [ ] **Large Search Results**: 10+ URLs → context managed appropriately
- [ ] **Long Transcripts**: >10k words → summarized or truncated
- [ ] **Multiple Images**: 20+ images in response → rendered efficiently
- [ ] **Heavy Tool Usage**: 5+ tool calls in sequence → executes successfully

#### Latency Testing
- [ ] **Cold Start Time**: Lambda cold start <3 seconds
- [ ] **Warm Start Time**: Lambda warm start <500ms
- [ ] **Streaming Latency**: First token <2 seconds
- [ ] **Tool Execution Time**: Search <5s, scrape <10s, execute_js <2s
- [ ] **Cache Hit Latency**: Cached result <100ms

#### Memory Testing
- [ ] **Base Memory Usage**: Lambda starts <500MB
- [ ] **Peak Memory Usage**: Under load <1GB
- [ ] **Memory Leaks**: Long-running conversations don't accumulate memory
- [ ] **Cleanup**: After response, memory returns to baseline

#### Cache Testing
- [ ] **Cache Hit Rate**: Repeated queries hit cache >80%
- [ ] **Cache Miss Behavior**: First query populates cache
- [ ] **Cache Expiry**: Expired cache entries regenerated
- [ ] **Cache Size**: Cache doesn't exceed limits

### 12.8. Browser Compatibility Testing

#### Desktop Browsers
- [ ] **Chrome (Latest)**: All features work
- [ ] **Firefox (Latest)**: All features work
- [ ] **Safari (Latest)**: All features work
- [ ] **Edge (Latest)**: All features work

#### Mobile Browsers
- [ ] **Mobile Chrome**: UI responsive, features work
- [ ] **Mobile Safari**: UI responsive, features work
- [ ] **Mobile Firefox**: UI responsive, features work

#### Special Modes
- [ ] **Incognito/Private Mode**: App works without persistent storage
- [ ] **Clear localStorage**: Fresh state handled correctly
- [ ] **Disable Cookies**: Essential features still work

### 12.9. Deployment Testing

#### Backend Deployment
- [ ] **Lambda Deploy**: Function deployed successfully
- [ ] **Environment Variables**: All env vars deployed
- [ ] **Lambda Layer**: Dependencies layer deployed
- [ ] **Puppeteer Lambda**: Separate Lambda deployed (if applicable)
- [ ] **CloudWatch Logs**: Logs visible and readable
- [ ] **Health Check**: /usage endpoint responds correctly

#### Frontend Deployment
- [ ] **UI Build**: npm run build succeeds without errors
- [ ] **Asset Paths**: All CSS/JS assets load correctly
- [ ] **GitHub Pages**: Routing works with base path
- [ ] **Static Assets**: Images, fonts load correctly
- [ ] **CORS Headers**: Requests to backend succeed
- [ ] **Environment Config**: VITE_BACKEND_URL correct

#### Integration Testing
- [ ] **End-to-End**: Frontend connects to backend
- [ ] **OAuth Flow**: Complete login flow works
- [ ] **API Requests**: All API endpoints reachable
- [ ] **Tool Execution**: Tools work end-to-end
- [ ] **Error Display**: Backend errors displayed in UI

### 12.10. Security Testing

- [ ] **XSS Prevention**: User input sanitized
- [ ] **CSRF Protection**: CSRF tokens or same-origin policy
- [ ] **SQL Injection**: No SQL injection vulnerabilities (if applicable)
- [ ] **Secrets Not Exposed**: API keys not visible in frontend
- [ ] **HTTPS Only**: All requests over HTTPS
- [ ] **Token Security**: Tokens stored securely
- [ ] **Input Validation**: All user input validated

### 12.11. Accessibility Testing

- [ ] **Keyboard Navigation**: All features accessible via keyboard
- [ ] **Screen Reader**: ARIA labels present, content readable
- [ ] **Focus Indicators**: Visible focus rings on interactive elements
- [ ] **Color Contrast**: Text meets WCAG AA standards
- [ ] **Alt Text**: Images have descriptive alt text
- [ ] **Form Labels**: All form inputs properly labeled

---

## 13. Testing Priorities from Developer Logs

**Extracted from 331 developer log files**

### 13.1. High Priority (Immediate)
1. Fix 29 failing tests (Week 1)
2. Test tools.js (0% coverage)
3. Test web scraping (0% coverage)
4. Test frontend components (0% coverage)
5. Test image base64 conversion with proxy
6. Test CORS-restricted image fetching
7. Test authentication token refresh
8. Test provider failover on errors

### 13.2. Medium Priority (Short-term)
1. Test streaming SSE responses
2. Test chat history persistence
3. Test SWAG export/import
4. Test YouTube transcript extraction
5. Test code execution sandbox
6. Test Puppeteer scraping fallback
7. Test cache expiry logic
8. Test cost tracking calculations

### 13.3. Low Priority (Long-term)
1. Test internationalization
2. Test accessibility features
3. Test performance under extreme load
4. Test multi-region deployment
5. Test error analytics
6. Test MCP server integration

---

**Document Status**: UPDATED WITH CONSOLIDATED CHECKLISTS  
**Approval Needed**: Team Lead, Tech Lead  
**Implementation Start**: Upon approval  
**Questions**: Contact test automation team

```
