# HTTP Headers Fix - Chat Endpoint

## Problem Identified

The HTTP response headers were not being captured in the **chat endpoint** (`src/endpoints/chat.js`). This endpoint handles the main chat interface and uses a different code path than the search handler.

### Root Cause

The chat endpoint uses `makeStreamingRequest()` function which:
1. Makes HTTPS requests to LLM APIs (Groq/OpenAI)
2. Returns the response stream for SSE parsing
3. **Did NOT capture HTTP headers** before streaming

The search handler (`lambda_search_llm_handler.js`) uses `llmResponsesWithTools()` which we already fixed, but the chat endpoint was a completely separate code path that we missed!

## Solution

Modified the chat endpoint to capture and forward HTTP response headers:

### 1. Updated `makeStreamingRequest()` Function

**File**: `src/endpoints/chat.js` (lines ~117-140)

**Before**:
```javascript
const req = protocol.request(options, (res) => {
    if (res.statusCode !== 200) {
        // error handling
        return;
    }
    
    resolve(res);  // ❌ No headers captured
});
```

**After**:
```javascript
const req = protocol.request(options, (res) => {
    // Capture HTTP response headers for spending tracking
    const httpHeaders = res.headers;
    const httpStatus = res.statusCode;
    
    console.log('📋 HTTP Response Headers captured:', JSON.stringify(httpHeaders, null, 2));
    console.log('📊 HTTP Status:', httpStatus);
    
    if (res.statusCode !== 200) {
        // error handling
        return;
    }
    
    // Attach headers to response object for later use
    res.httpHeaders = httpHeaders;
    res.httpStatus = httpStatus;
    
    resolve(res);  // ✅ Headers attached to response
});
```

### 2. Captured Headers After Request

**File**: `src/endpoints/chat.js` (lines ~392-400)

```javascript
// Make streaming request
const response = await makeStreamingRequest(targetUrl, apiKey, requestBody);

// Capture HTTP headers from response
const httpHeaders = response.httpHeaders || {};
const httpStatus = response.httpStatus;

console.log('📋 DEBUG chat endpoint - httpHeaders:', JSON.stringify(httpHeaders, null, 2));
console.log('📊 DEBUG chat endpoint - httpStatus:', httpStatus);
```

### 3. Updated `llm_response` Event

**File**: `src/endpoints/chat.js` (lines ~460-477)

**Before**:
```javascript
sseWriter.writeEvent('llm_response', {
    phase: 'chat_iteration',
    iteration: iterationCount,
    model,
    response: {
        content: assistantMessage.content,
        tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined
    },
    timestamp: new Date().toISOString()
});
```

**After**:
```javascript
const eventData = {
    phase: 'chat_iteration',
    iteration: iterationCount,
    model,
    response: {
        content: assistantMessage.content,
        tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined
    },
    httpHeaders: httpHeaders || {},      // ✅ ADDED
    httpStatus: httpStatus                // ✅ ADDED
};

console.log('🔧 DEBUG chat endpoint - Event data to send:', JSON.stringify(eventData, null, 2));

eventData.timestamp = new Date().toISOString();
sseWriter.writeEvent('llm_response', eventData);
```

## Two Code Paths

The application has **two separate endpoints** that make LLM API calls:

### 1. Search Handler (`src/lambda_search_llm_handler.js`)
- Used for: Complex multi-step queries with web search
- Function: `llmResponsesWithTools()` from `llm_tools_adapter.js`
- Status: ✅ **Already fixed** (captures headers)

### 2. Chat Endpoint (`src/endpoints/chat.js`)
- Used for: Direct chat interface, most user interactions
- Function: `makeStreamingRequest()` in same file
- Status: ✅ **NOW FIXED** (captures headers)

## Data Flow (Chat Endpoint)

```
User sends message
    ↓
Chat Endpoint (/chat)
    ↓
makeStreamingRequest(targetUrl, apiKey, requestBody)
    ↓
HTTPS request to Groq/OpenAI
    ↓
HTTP response with headers
    ↓
Capture: res.headers, res.statusCode
    ↓
Attach to response: res.httpHeaders, res.httpStatus
    ↓
Parse SSE stream
    ↓
Emit llm_response event with httpHeaders and httpStatus
    ↓
Frontend receives event with headers
    ↓
Display in Response Headers section
```

## Testing

Now when you use the chat interface:

1. **Send any message** in the chat
2. **Check CloudWatch logs** for:
   - `📋 HTTP Response Headers captured:` - Shows headers from LLM API
   - `📊 HTTP Status:` - Shows HTTP status code
   - `🔧 DEBUG chat endpoint - Event data to send:` - Shows full SSE event with headers

3. **Check Frontend** (DevTools Console):
   - Look for `🔍 LLM API Call Debug:` logs
   - Should show `hasHttpHeaders: true`
   - Should show actual header data

4. **Check UI**:
   - Expand "LLM Calls" section
   - Expand "📋 Response Headers"
   - Should see real HTTP headers with rate limits, request IDs, etc.

## Expected Headers

### From Groq
```json
{
  "date": "Tue, 08 Oct 2025 19:47:00 GMT",
  "content-type": "application/json",
  "transfer-encoding": "chunked",
  "connection": "keep-alive",
  "x-groq-id": "req_01jhcqc0e4xnrd0km123",
  "x-ratelimit-limit-requests": "30",
  "x-ratelimit-limit-tokens": "6000",
  "x-ratelimit-remaining-requests": "29",
  "x-ratelimit-remaining-tokens": "5847",
  "x-ratelimit-reset-requests": "2s",
  "x-ratelimit-reset-tokens": "1.53s",
  "cf-ray": "...",
  "server": "cloudflare"
}
```

### From OpenAI
```json
{
  "date": "Tue, 08 Oct 2025 19:47:00 GMT",
  "content-type": "text/event-stream",
  "x-request-id": "req-abc123def456",
  "openai-organization": "org-xyz789",
  "openai-processing-ms": "1234",
  "openai-version": "2024-10-01",
  "cf-ray": "...",
  "server": "cloudflare"
}
```

## Files Modified

- ✅ `src/endpoints/chat.js`:
  - Updated `makeStreamingRequest()` to capture headers
  - Captured headers after request
  - Updated `llm_response` event to include headers

## Deployment

- **Backend**: Deployed via `make fast`
- **Commit**: Ready for commit after testing
- **No frontend changes needed**: Frontend already supports headers

## Why This Wasn't Found Before

1. **Two separate code paths**: Search handler vs. chat endpoint
2. **Search handler was fixed first**: We fixed `llmResponsesWithTools()` but missed `makeStreamingRequest()`
3. **No LLM logs in CloudWatch**: The `🤖 LLM REQUEST/RESPONSE` logs are only in `llm_tools_adapter.js`, not in chat endpoint
4. **Different test scenarios**: Testing might have used search endpoint, not direct chat

## Next Steps

1. **Hard refresh browser** (Ctrl+Shift+R)
2. **Send a chat message** (any message)
3. **Check CloudWatch logs** for debug output
4. **Check browser console** for `🔍 LLM API Call Debug:` with httpHeaders
5. **Check UI** - Expand "Response Headers" section

The headers should now be visible for all chat interactions!

## Benefits

Now you can track:
- ✅ Rate limits (remaining requests/tokens)
- ✅ Request IDs for support tickets
- ✅ Processing times
- ✅ Cost analysis and spending tracking
- ✅ Provider-specific metadata
