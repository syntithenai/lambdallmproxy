# HTTP Response Headers for Spending Tracking

## Summary

Added HTTP response headers from LLM API calls to the frontend for spending tracking. Headers now flow from LLM providers → Lambda backend → SSE events → UI Response Headers section.

## Changes Made

### Backend Changes (src/)

#### 1. `llm_tools_adapter.js`

**httpsRequestJson function (lines 43-80)**:
- Captured `responseHeaders = res.headers` from HTTP response
- Changed return value from `resolve(json)` to `resolve({ data: json, headers: responseHeaders, status })`
- Now returns full response with headers and status

**normalizeFromChat function (lines 106-120)**:
- Added extraction of `httpHeaders` and `httpStatus` from response
- Made backward compatible with old format (just data)
- Returns `{ output, text, rawResponse, httpHeaders, httpStatus }`

#### 2. `lambda_search_llm_handler.js`

**Planning phase (lines 162-174)**:
- Added `httpHeaders: planningResponse.httpHeaders || {}` to llm_response event
- Added `httpStatus: planningResponse.httpStatus` to llm_response event
- Uses `planningResponse.rawResponse || planningResponse` for response

**Tool iteration phase (lines 275-287)**:
- Added `httpHeaders: response.httpHeaders || {}` to llm_response event
- Added `httpStatus: response.httpStatus` to llm_response event

**Final synthesis phase (lines 700-712)**:
- Added `httpHeaders: finalResponse.httpHeaders || {}` to llm_response event
- Added `httpStatus: finalResponse.httpStatus` to llm_response event

### Frontend Changes (ui-new/src/)

**No changes needed** - Frontend was already prepared to receive and display HTTP headers:
- `LlmApiTransparency.tsx` has Response Headers section
- `ChatTab.tsx` stores full response object including httpHeaders
- JsonTree component displays headers in expandable format

## HTTP Headers Available

### OpenAI Headers
- `x-request-id`: Request identifier for support/billing queries
- `openai-organization`: Organization identifier
- `openai-processing-ms`: Processing time
- `openai-version`: API version used

### Groq Headers
- `x-groq-id`: Request identifier
- `x-ratelimit-limit-requests`: Rate limit for requests
- `x-ratelimit-limit-tokens`: Rate limit for tokens
- `x-ratelimit-remaining-requests`: Remaining requests
- `x-ratelimit-remaining-tokens`: Remaining tokens
- `x-ratelimit-reset-requests`: When request limit resets
- `x-ratelimit-reset-tokens`: When token limit resets

### Standard HTTP Headers
- `date`: Response timestamp
- `content-type`: Response content type
- `content-length`: Response size
- `server`: Server identifier

## Usage

1. **View Headers**: Click "LLM Calls" in any assistant message → Expand "📋 Response Headers"
2. **Track Spending**: Monitor rate limits and request IDs to correlate with billing
3. **Debug Issues**: Use request IDs when contacting provider support

## Deployment

**Backend**: Deployed via `make fast` (10 seconds)
- Lambda function updated with HTTP header capture
- All three phases (planning, tool_iteration, final_synthesis) include headers

**Frontend**: Already deployed
- Response Headers section ready at index-D7iBADzc.js

## Testing

To verify HTTP headers are working:
1. Open UI at http://localhost:8081 or production URL
2. Send a query that generates LLM calls
3. Expand "LLM Calls" section on assistant message
4. Expand "📋 Response Headers" for any call
5. Should see headers like `x-groq-id`, `x-ratelimit-*`, `date`, etc.

## Benefits

- **Spending Tracking**: Monitor rate limits and usage patterns
- **Cost Analysis**: Identify high-cost requests by correlating headers with billing
- **Debugging**: Request IDs help track issues through provider support
- **Transparency**: Full visibility into LLM provider responses
- **Rate Limit Management**: Real-time visibility into rate limit consumption
