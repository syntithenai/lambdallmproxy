# HTTP Response Headers Fix - Complete Solution

## Problem

Response Headers section in the UI was showing "undefined" despite backend modifications to capture and send HTTP headers. The headers were being sent from the backend but not properly captured and displayed in the frontend.

## Root Cause

The issue was in the **frontend event handler**. While the backend was correctly sending httpHeaders and httpStatus in the llm_response SSE events, the frontend was only storing `data.response` and ignoring the additional fields.

### Backend (✅ Working)

The backend was correctly:
1. Capturing HTTP headers in `httpsRequestJson()` 
2. Preserving them in `normalizeFromChat()`
3. Sending them in SSE events for all phases

### Frontend (❌ Broken)

The frontend `llm_response` event handler was:
```typescript
lastCall.response = data.response;  // ❌ Only storing response, ignoring httpHeaders
```

## Complete Solution

### 1. Frontend Event Handler Fix

**File**: `ui-new/src/components/ChatTab.tsx`

**Before**:
```typescript
case 'llm_response':
  // ...
  if (lastCall && lastCall.phase === data.phase && !lastCall.response) {
    lastCall.response = data.response;  // ❌ Missing httpHeaders
    // ...
  }
```

**After**:
```typescript
case 'llm_response':
  // ...
  if (lastCall && lastCall.phase === data.phase && !lastCall.response) {
    lastCall.response = data.response;
    lastCall.httpHeaders = data.httpHeaders;      // ✅ Capture HTTP headers
    lastCall.httpStatus = data.httpStatus;        // ✅ Capture HTTP status
    // ...
  }
```

### 2. TypeScript Interface Updates

**Files**: 
- `ui-new/src/utils/api.ts`
- `ui-new/src/utils/chatCache.ts`
- `ui-new/src/components/LlmApiTransparency.tsx`

**Added fields to LlmApiCall interface**:
```typescript
interface LlmApiCall {
  phase: string;
  model: string;
  request: any;
  response?: any;
  httpHeaders?: any;    // ✅ NEW: HTTP response headers
  httpStatus?: number;  // ✅ NEW: HTTP status code
  timestamp: string;
}
```

### 3. Display Component Fix

**File**: `ui-new/src/components/LlmApiTransparency.tsx`

**Before** (trying to extract from response):
```typescript
const responseHeaders = call.response ? {
  id: call.response.id,
  model: call.response.model,
  // ... extracting from response object
} : null;
```

**After** (using dedicated field):
```typescript
// Use HTTP headers from the separate field (sent by backend)
const responseHeaders = call.httpHeaders || null;
```

### 4. Backend Logging

**File**: `src/lambda_search_llm_handler.js`

Added debug logging to verify headers are being captured:
```javascript
console.log('📋 HTTP Headers for planning:', JSON.stringify(planningResponse.httpHeaders, null, 2));
console.log('📊 HTTP Status:', planningResponse.httpStatus);
```

## Data Flow

### Complete Flow (All 3 Layers)

1. **Network Layer** (`llm_tools_adapter.js::httpsRequestJson`):
   ```javascript
   const responseHeaders = res.headers;
   resolve({ data: json, headers: responseHeaders, status });
   ```

2. **Adapter Layer** (`llm_tools_adapter.js::normalizeFromChat`):
   ```javascript
   const httpHeaders = responseWithHeaders?.headers || {};
   const httpStatus = responseWithHeaders?.status;
   return { output, text, rawResponse, httpHeaders, httpStatus };
   ```

3. **Handler Layer** (`lambda_search_llm_handler.js`):
   ```javascript
   stream.writeEvent('llm_response', {
     phase: 'planning',
     response: planningResponse.rawResponse,
     httpHeaders: planningResponse.httpHeaders || {},
     httpStatus: planningResponse.httpStatus
   });
   ```

4. **SSE Transport**: Headers sent as JSON in event data

5. **Frontend Reception** (`ChatTab.tsx::parseSSEEvents`):
   ```typescript
   case 'llm_response':
     lastCall.response = data.response;
     lastCall.httpHeaders = data.httpHeaders;     // ✅ NOW CAPTURED
     lastCall.httpStatus = data.httpStatus;       // ✅ NOW CAPTURED
   ```

6. **UI Display** (`LlmApiTransparency.tsx`):
   ```typescript
   const responseHeaders = call.httpHeaders || null;
   // ... display in expandable section
   ```

## What Headers Are Available

### Groq Headers (for Rate Limiting)
```json
{
  "x-groq-id": "req_01jhcqc0e4xnrd0km123",
  "x-ratelimit-limit-requests": "30",
  "x-ratelimit-limit-tokens": "6000",
  "x-ratelimit-remaining-requests": "29",
  "x-ratelimit-remaining-tokens": "5847",
  "x-ratelimit-reset-requests": "2s",
  "x-ratelimit-reset-tokens": "1.53s",
  "date": "Tue, 08 Oct 2025 19:16:52 GMT",
  "content-type": "application/json",
  "content-length": "1234",
  "server": "cloudflare"
}
```

### OpenAI Headers
```json
{
  "x-request-id": "req-abc123def456",
  "openai-organization": "org-xyz789",
  "openai-processing-ms": "1234",
  "openai-version": "2024-10-01",
  "date": "Tue, 08 Oct 2025 19:16:52 GMT",
  "content-type": "application/json"
}
```

## Testing

To verify HTTP headers are now working:

1. **Open the app**: http://localhost:8081 or production URL
2. **Send a query**: Any message that triggers LLM calls
3. **Expand "LLM Calls"**: Click on assistant message
4. **Expand "📋 Response Headers"**: Click on each LLM call's header section
5. **Verify headers appear**: Should see real header values, not undefined

**Expected to see**:
- ✅ Rate limit headers (`x-ratelimit-*`)
- ✅ Request IDs (`x-groq-id`, `x-request-id`)
- ✅ Standard HTTP headers (`date`, `content-type`, `server`)
- ✅ Provider-specific headers (`openai-*`, `x-groq-*`)

**Should NOT see**:
- ❌ `undefined`
- ❌ Empty object `{}`
- ❌ Null values

## Files Modified

### Backend (Previously Fixed)
- ✅ `src/llm_tools_adapter.js` - Capture headers from HTTP response
- ✅ `src/lambda_search_llm_handler.js` - Send headers in SSE events

### Frontend (This Fix)
- ✅ `ui-new/src/components/ChatTab.tsx` - Capture httpHeaders in event handler
- ✅ `ui-new/src/utils/api.ts` - Add httpHeaders to interface
- ✅ `ui-new/src/utils/chatCache.ts` - Add httpHeaders to interface
- ✅ `ui-new/src/components/LlmApiTransparency.tsx` - Use httpHeaders field, update interface

## Deployment

- **Backend**: Deployed via `make fast` with debug logging
- **Frontend**: Deployed to GitHub Pages (index-BfmbgGf3.js)
- **Commit**: 8a2b2b9 - "fix: Display HTTP response headers from backend in Response Headers section"

## Debug Logging

Added console logging in backend to verify headers are being captured:
- `📋 HTTP Headers for planning:` - Shows headers for planning phase
- `📋 HTTP Headers for tool_iteration:` - Shows headers for tool execution
- `📊 HTTP Status:` - Shows HTTP status code

Check CloudWatch Logs to see these debug messages and verify headers are populated.

## Benefits

1. **Spending Tracking**: Monitor rate limits in real-time
2. **Request Correlation**: Use request IDs for support tickets
3. **Performance Monitoring**: Track processing times via headers
4. **Rate Limit Management**: See remaining requests/tokens
5. **Debugging**: Full visibility into LLM provider responses
6. **Cost Analysis**: Identify high-cost requests

## Next Steps (Optional Enhancements)

1. **Format Headers**: Display rate limits in user-friendly format
2. **Warning Indicators**: Show warnings when approaching rate limits
3. **Header Filtering**: Only show relevant headers (hide internals)
4. **Cost Calculation**: Use headers to estimate request cost
5. **Export Functionality**: Allow exporting headers for analysis
