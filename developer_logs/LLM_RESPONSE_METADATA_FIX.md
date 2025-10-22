# LLM Response Metadata Fix

## Issue
The Response Headers section in the LLM Calls UI was showing all null values because the backend was not sending the full response metadata.

## Root Cause
The `normalizeFromChat()` function in `src/llm_tools_adapter.js` was extracting only `output` and `text` from the LLM API response and discarding all metadata including:
- Response ID
- Model name
- Created timestamp
- System fingerprint
- Usage statistics (tokens, timing)
- Provider-specific metadata (x_groq)

## Solution

### Backend Changes

1. **Modified `src/llm_tools_adapter.js`**:
   - Updated `normalizeFromChat()` to return the full raw response:
   ```javascript
   return { 
     output: out, 
     text: choice?.message?.content || '',
     rawResponse: data  // NEW: Include full raw response with all metadata
   };
   ```

2. **Modified `src/lambda_search_llm_handler.js`**:
   - Updated tool_iteration phase to send rawResponse:
   ```javascript
   stream?.writeEvent?.('llm_response', {
     phase: 'tool_iteration',
     response: response.rawResponse || { output, text },
     // ...
   });
   ```
   
   - Updated final_synthesis phase to send rawResponse:
   ```javascript
   stream?.writeEvent?.('llm_response', {
     phase: 'final_synthesis',
     response: finalResponse.rawResponse || finalResponse
   });
   ```

### What's Now Sent

The `llm_response` SSE event now includes the complete response object with:
- `id`: Response ID from the LLM provider
- `model`: Actual model used
- `created`: Unix timestamp
- `system_fingerprint`: System identifier
- `usage`: Token counts and timing information
  - `prompt_tokens`: Input tokens
  - `completion_tokens`: Output tokens
  - `total_tokens`: Total tokens
  - `queue_time`: Time spent in queue (if available)
  - `prompt_time`: Time to process prompt (if available)
  - `completion_time`: Time to generate completion (if available)
  - `total_time`: Total API call time (if available)
- `x_groq`: Groq-specific metadata (if using Groq)
- `choices[0]`: The actual response content

## Frontend Display

The UI now properly displays in the Response Headers expandable section:
- All response metadata fields
- Properly formatted JSON tree view
- Expandable/collapsible for easy inspection

The grey header also shows extracted timing and token information for quick reference.

## Deployment

- **Backend**: Deployed via `make fast` (10 seconds)
- **Date**: 2025-10-08 18:01 UTC
- **Lambda URL**: https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/

## Testing

To verify the fix:
1. Send a query that generates LLM calls
2. Expand the "LLM Calls" section
3. Expand the "Response Headers" section for any call
4. Verify that fields like `id`, `model`, `created`, `usage`, etc. now show actual values instead of null
