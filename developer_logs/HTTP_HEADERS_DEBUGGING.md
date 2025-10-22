# HTTP Response Headers Debugging Guide

## Goal

Capture **HTTP response headers** from upstream LLM API calls (Groq, OpenAI) and display them in the UI's "Response Headers" section for spending tracking and rate limit monitoring.

## Current Status

### Backend Implementation ✅

The backend code is set up to capture headers:

1. **`httpsRequestJson()`** - Captures `res.headers` from HTTPS response
2. **`normalizeFromChat()`** - Returns `{ ..., httpHeaders, httpStatus }`
3. **Lambda handler** - Sends headers in SSE `llm_response` events

### Frontend Implementation ✅

The frontend code is set up to display headers:

1. **`ChatTab.tsx`** - Captures `data.httpHeaders` from SSE events
2. **`LlmApiTransparency.tsx`** - Displays headers in expandable section
3. **Debug logging** - Console logs show header data structure

## The Issue 🐛

Response headers are showing as undefined or empty in the UI, despite backend code looking correct.

## Debugging Steps

### Step 1: Check Backend Logs

The Lambda now has extensive debug logging:

```javascript
console.log('📋 DEBUG - Full planningResponse object keys:', Object.keys(planningResponse));
console.log('📋 DEBUG - httpHeaders value:', planningResponse.httpHeaders);
console.log('📋 DEBUG - httpHeaders JSON:', JSON.stringify(planningResponse.httpHeaders, null, 2));
console.log('📊 DEBUG - HTTP Status:', planningResponse.httpStatus);
console.log('🔧 DEBUG - Event data to send:', JSON.stringify(eventData, null, 2));
```

**To check logs**:
```bash
aws logs tail /aws/lambda/llmproxy --since 5m --format short | grep DEBUG
```

### Step 2: Check What's Being Sent

Look for the `🔧 DEBUG - Event data to send:` log entry. This shows the exact data being sent in the SSE event.

**Expected to see**:
```json
{
  "phase": "planning",
  "response": { ... },
  "httpHeaders": {
    "date": "...",
    "content-type": "application/json",
    "x-groq-id": "...",
    "x-ratelimit-limit-requests": "30",
    ...
  },
  "httpStatus": 200
}
```

**If httpHeaders is empty `{}`**, the issue is in the backend (headers not being captured).

**If httpHeaders has data**, the issue is in frontend (not receiving or displaying).

### Step 3: Check Frontend Console

Open browser DevTools → Console, look for:

```javascript
🔍 LLM API Call Debug: {
  index: 0,
  phase: "planning",
  model: "...",
  hasResponse: true,
  hasHttpHeaders: true/false,  // ← Should be true
  httpHeaders: { ... },         // ← Should have data
  responseHeaders: { ... }      // ← Should have data
}
```

### Step 4: Check Response Headers Section

In the UI:
1. Expand "LLM Calls"
2. Expand "📋 Response Headers"
3. Should see either:
   - ✅ HTTP headers as expandable tree
   - ⚠️ Debug info showing what's missing

## Possible Issues

### Issue 1: Headers Lost in `httpsRequestJson`

**Symptom**: Backend logs show `httpHeaders: {}` or `httpHeaders: undefined`

**Check**: Look for `🤖 LLM RESPONSE:` log entry - should show `headers` object

**Fix**: Verify `res.headers` is populated in the HTTPS request handler

### Issue 2: Headers Lost in `normalizeFromChat`

**Symptom**: Backend logs show headers in LLM RESPONSE but not in planningResponse

**Check**: The `normalizeFromChat` function should extract headers from response

**Fix**: Verify the function properly handles the `{ data, headers, status }` structure

### Issue 3: Headers Lost in Event Emission

**Symptom**: Backend logs show headers in event data but not in frontend

**Check**: SSE event serialization might be dropping the headers

**Fix**: Verify `writeEvent` properly serializes all fields

### Issue 4: Headers Not Captured in Frontend

**Symptom**: Frontend console logs show `hasHttpHeaders: false`

**Check**: The `llm_response` event handler in ChatTab.tsx

**Fix**: Verify `lastCall.httpHeaders = data.httpHeaders` is executing

## Test Script

Run the test script to see full debug output:

```bash
./scripts/test-http-headers.sh
```

This will:
1. Make a request to the Lambda
2. Wait for logs to propagate
3. Show debug output from CloudWatch

## What We're Looking For

### From Groq API
```json
{
  "date": "Tue, 08 Oct 2025 19:37:00 GMT",
  "content-type": "application/json",
  "content-length": "1234",
  "x-groq-id": "req_01jhcqc0e4xnrd0km123",
  "x-ratelimit-limit-requests": "30",
  "x-ratelimit-limit-tokens": "6000",
  "x-ratelimit-remaining-requests": "29",
  "x-ratelimit-remaining-tokens": "5847",
  "x-ratelimit-reset-requests": "2s",
  "x-ratelimit-reset-tokens": "1.53s",
  "server": "cloudflare"
}
```

### From OpenAI API
```json
{
  "date": "Tue, 08 Oct 2025 19:37:00 GMT",
  "content-type": "application/json",
  "x-request-id": "req-abc123def456",
  "openai-organization": "org-xyz789",
  "openai-processing-ms": "1234",
  "openai-version": "2024-10-01"
}
```

## Next Steps

1. **Run the test script** to see debug output
2. **Check backend logs** for httpHeaders value
3. **Check frontend console** for received data
4. **Share the logs** so we can identify where headers are lost

## Files to Check

### Backend
- `src/llm_tools_adapter.js` - httpsRequestJson, normalizeFromChat
- `src/lambda_search_llm_handler.js` - Event emission with headers

### Frontend
- `ui-new/src/components/ChatTab.tsx` - llm_response event handler (line ~1028)
- `ui-new/src/components/LlmApiTransparency.tsx` - Headers display (line ~144, ~230)

## Expected Flow

```
Groq/OpenAI API
    ↓ (HTTP response with headers)
httpsRequestJson()
    ↓ { data, headers, status }
normalizeFromChat()
    ↓ { output, text, rawResponse, httpHeaders, httpStatus }
Lambda handler
    ↓ SSE event: { phase, response, httpHeaders, httpStatus }
Frontend SSE parser
    ↓ data.httpHeaders
ChatTab llm_response handler
    ↓ lastCall.httpHeaders = data.httpHeaders
LlmApiTransparency component
    ↓ Displays in "Response Headers" section
```

The debug logging should help us identify exactly where in this flow the headers are being lost.
