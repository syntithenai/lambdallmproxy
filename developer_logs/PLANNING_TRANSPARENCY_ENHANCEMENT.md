# Planning Endpoint Transparency Enhancement

## Overview

Enhanced the planning endpoint to provide real-time transparency information and detailed error reporting for debugging 429 rate limit issues and other LLM errors.

## Features Added

### 1. Real-time LLM Request Transparency

**Before the request is sent:**
- `llm_request` SSE event with:
  - Selected model and provider
  - Whether load balancing was used
  - Request timestamp
  - Query being processed
  - Status: "sending_request"

**After successful response:**
- `llm_response` SSE event with:
  - Full model and provider details
  - Token usage (prompt, completion, total)
  - HTTP status and headers
  - Response timestamp
  - Load balancing indicator

### 2. Enhanced Error Reporting

**429 Rate Limit Detection:**
- Automatic detection of rate limit errors via HTTP status and keywords
- Error code: `RATE_LIMIT_EXCEEDED`
- Provider and model context extraction

**Detailed Error Events:**
- `error` SSE event with full context:
  - HTTP status code and headers
  - Provider and model information
  - Rate limit detection flag
  - User email and query context
  - Timestamp

**LLM-specific Error Events:**
- `llm_error` SSE event for provider-specific debugging:
  - Provider and model details
  - HTTP response details
  - Rate limit status
  - Error classification

### 3. Enhanced LLM Tools Adapter

**Request Logging:**
- Full HTTP request details with redacted authorization
- Complete response logging with status and headers

**Error Context Enhancement:**
- HTTP errors include full context (status, headers, response body)
- Provider context added to all errors
- Endpoint URL included for debugging

**Provider-specific Error Handling:**
- OpenAI, Groq, and Gemini errors enhanced with provider context
- Consistent error structure across all providers

### 4. JSON Response Handling

**Markdown Wrapper Handling:**
- Automatic detection and removal of ```json wrappers
- Graceful handling of various JSON response formats
- Better error messages for JSON parsing failures

## Usage

### Client-side SSE Event Handling

```javascript
const eventSource = new EventSource('/planning');

eventSource.addEventListener('llm_request', (event) => {
  const data = JSON.parse(event.data);
  console.log('LLM Request:', data.model, data.message);
});

eventSource.addEventListener('llm_response', (event) => {
  const data = JSON.parse(event.data);
  console.log('LLM Response:', data.totalTokens, 'tokens');
});

eventSource.addEventListener('error', (event) => {
  const data = JSON.parse(event.data);
  if (data.isRateLimit) {
    console.error('Rate Limit:', data.provider, data.model);
  }
});

eventSource.addEventListener('llm_error', (event) => {
  const data = JSON.parse(event.data);
  console.error('LLM Error:', data.httpStatus, data.error);
});
```

### Error Structure Examples

**Rate Limit Error:**
```json
{
  "error": "HTTP 429: Too Many Requests",
  "code": "RATE_LIMIT_EXCEEDED", 
  "httpStatus": 429,
  "provider": "groq",
  "model": "llama-3.3-70b-versatile",
  "isRateLimit": true,
  "timestamp": "2025-10-14T14:00:00.000Z"
}
```

**LLM Request Event:**
```json
{
  "phase": "planning",
  "model": "groq:llama-3.3-70b-versatile",
  "provider": "groq", 
  "modelName": "llama-3.3-70b-versatile",
  "status": "sending_request",
  "selectedViaLoadBalancing": true,
  "message": "Sending planning request to groq:llama-3.3-70b-versatile..."
}
```

## Benefits

1. **Immediate Visibility**: See what model is being used before the request completes
2. **Rate Limit Debugging**: Detailed context for 429 errors with provider information
3. **Token Transparency**: Real-time token usage tracking
4. **Load Balancing Visibility**: Know when load balancing selected the model
5. **Error Context**: Full HTTP context for debugging API issues
6. **Consistent Error Reporting**: Standardized error structure across all providers

## Testing

The enhancements are backwards compatible and don't affect existing functionality. The planning endpoint continues to work normally while providing additional transparency through SSE events.

## Files Modified

- `src/endpoints/planning.js`: Main transparency and error handling enhancements
- `src/llm_tools_adapter.js`: Enhanced HTTP error context and provider-specific error handling
- JSON response parsing improvements for markdown-wrapped responses

## Deployment Status

✅ Deployed and active in Lambda function
✅ Real-time transparency working
✅ Enhanced error reporting functional
✅ Backwards compatible with existing clients