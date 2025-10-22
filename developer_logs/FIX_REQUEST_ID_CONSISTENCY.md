# Fix: Request ID Consistency Between Lambda Invocation and LLM Calls

## Problem
The Lambda invocation logs were using a different request ID than the LLM calls they triggered. This made it impossible to group all logs from a single request together in Google Sheets.

**Root Cause**: The chat endpoint was generating its own request ID instead of using the one set by the main Lambda handler in `src/index.js`.

## Architecture Flow

### Before Fix
```
1. src/index.js handler generates: requestId = "local-1234-abc"
2. Stores in context.requestId
3. Logs Lambda invocation with: requestId = "local-1234-abc"
4. Routes to chat endpoint
5. chat.js IGNORES context.requestId and generates: requestId = "local-5678-xyz"  ❌
6. All LLM calls logged with: requestId = "local-5678-xyz"
7. Result: Lambda invocation and LLM calls have DIFFERENT request IDs
```

### After Fix
```
1. src/index.js handler generates: requestId = "local-1234-abc"
2. Stores in context.requestId
3. Logs Lambda invocation with: requestId = "local-1234-abc"
4. Routes to chat endpoint
5. chat.js USES context.requestId: requestId = "local-1234-abc"  ✅
6. All LLM calls logged with: requestId = "local-1234-abc"
7. Result: Lambda invocation and LLM calls have SAME request ID
```

## Changes Made

### 1. src/index.js (Line 85)
**Added comprehensive logging for request ID**:
```javascript
// Generate consistent request ID for grouping all logs from this request
const requestId = context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Store requestId in context for endpoint handlers to use
if (context) {
    context.requestId = requestId;
    context.awsRequestId = requestId;
}

console.log('🆔 Lambda Invocation Request ID:', requestId);
```

### 2. src/endpoints/chat.js (Lines 859-872)
**Fixed to prioritize context.requestId**:
```javascript
// Check for custom request ID from headers (e.g., from voice transcription)
const customRequestId = event.headers?.['x-request-id'] || event.headers?.['X-Request-Id'] || null;

// Use request ID for grouping all logs from this request
// Priority: custom header > context (set by index.js) > generated
// Note: context.requestId was already set by index.js Lambda handler
const requestId = customRequestId || context?.requestId || context?.awsRequestId || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

if (customRequestId) {
    console.log('🔗 Using custom request ID from header:', customRequestId);
} else if (context?.requestId) {
    console.log('🔗 Using Lambda invocation request ID from context:', context.requestId);
} else {
    console.log('🔗 Generated new request ID:', requestId);
}
```

## Request ID Priority (All Endpoints)

1. **Custom Header** (`x-request-id` or `X-Request-Id`) - Used by voice transcription to link chat requests
2. **Context Request ID** (`context.requestId`) - Set by Lambda handler for the invocation
3. **AWS Request ID** (`context.awsRequestId`) - AWS-generated ID (fallback)
4. **Generated ID** (`local-{timestamp}-{random}`) - Last resort for local development

## Verification of Other Endpoints

All other endpoints already correctly use `context?.requestId`:

- ✅ **src/endpoints/planning.js** (line 709): Uses `context?.requestId`
- ✅ **src/endpoints/rag.js** (line 44): Uses `context?.requestId`
- ✅ **src/endpoints/transcribe.js** (line 400): Uses `context?.requestId` with custom header fallback
- ✅ **src/endpoints/generate-image.js** (line 231): Uses `context?.requestId`
- ✅ **src/tools.js** (lines 1074, 1228, 1350, 2431): All use `context?.requestId`

## Google Sheets Logging Schema

Both Lambda invocations and LLM calls log to the same sheet with the same schema:

| Column | Lambda Invocation | LLM Call |
|--------|------------------|----------|
| Provider | `aws-lambda` | `openai`, `groq`, `gemini` |
| Model | Endpoint path (e.g., `/chat`) | Model name (e.g., `gpt-4o`) |
| Type | `lambda_invocation` | `chat`, `embedding`, `guardrail_input`, etc. |
| Request ID | **Same as LLM calls** ✅ | **Same as Lambda invocation** ✅ |
| Cost | Lambda compute + request cost | Token-based cost |

## Testing

To verify the fix:

1. Start local dev server: `make dev`
2. Send a chat request via UI at http://localhost:8081
3. Check logs for request ID tracking:
   ```
   🆔 Lambda Invocation Request ID: local-1234567890-abcdef
   🔗 Using Lambda invocation request ID from context: local-1234567890-abcdef
   ```
4. Check Google Sheets logs - all entries for this request should have the same Request ID

## Benefits

1. **Unified Logging**: Can now filter all logs (Lambda invocation + all LLM calls) by a single request ID
2. **Cost Attribution**: Can calculate total cost per request by summing all rows with the same request ID
3. **Debugging**: Easy to trace the entire request flow from Lambda invocation through all LLM calls
4. **Voice Transcription**: Custom request ID headers still work to link transcription → chat requests

## Related Files

- `src/index.js` - Lambda handler, generates and stores request ID
- `src/endpoints/chat.js` - Chat endpoint, now uses context request ID
- `src/services/google-sheets-logger.js` - Logs both Lambda invocations and LLM calls
- All other endpoints already correctly implemented

## Deployment

Changes affect:
- ✅ Local development (via `make dev`)
- ✅ Production Lambda (via `make deploy-lambda-fast`)

No environment variable changes needed.
