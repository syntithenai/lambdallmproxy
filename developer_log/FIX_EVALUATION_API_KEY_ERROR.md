# Fix: Response Evaluation API Key Error

**Date**: 2025-10-12  
**Status**: ✅ Completed and Deployed  
**Deployment**: Backend (deploy-lambda-fast)

## Issue

Response evaluation was showing **"Evaluation error - assuming comprehensive"** instead of properly evaluating whether the response was sufficient. The error was:

```
HTTP 401: {"error":{"message":"Invalid API Key","type":"invalid_request_error","code":"invalid_api_key"}}
Response evaluation failed: HTTP 401: Invalid API Key
✅ Response deemed comprehensive: Evaluation error - assuming comprehensive
```

## Root Cause

The evaluation function was incorrectly calling `llmResponsesWithTools` with wrong parameter format:

**Incorrect (before)**:
```javascript
await llmResponsesWithTools({
    model: model,
    provider: provider,      // ❌ Not recognized by llmResponsesWithTools
    apiKey: apiKey,          // ❌ Should be in options.apiKey
    request: evalRequestBody, // ❌ Should be 'input' with proper format
    options: {
        enforceJson: false,
        timeoutMs: 15000
    }
});
```

**Issue**: The `llmResponsesWithTools` function expects:
- `model`: Model name
- `input`: Array of message blocks with `{role, content}` format
- `tools`: Array of tools (empty for evaluation)
- `options`: Object containing `apiKey`, `temperature`, `max_tokens`, etc.

But the evaluation was passing:
- `provider` at top level (not used)
- `apiKey` at top level (not in options)
- `request` instead of `input` (wrong format)

This caused the API key to not be passed correctly, resulting in 401 errors.

## Solution

Fixed the evaluation function to correctly format parameters for `llmResponsesWithTools`:

```javascript
// Convert messages to input format expected by llmResponsesWithTools
const input = evalRequestBody.messages.map(msg => ({
    role: msg.role,
    content: msg.content
}));

const evalResponse = await llmResponsesWithTools({
    model: model,
    input: input,              // ✅ Proper format
    tools: [],                 // ✅ No tools for evaluation
    options: {
        apiKey: apiKey,        // ✅ API key in options
        temperature: 0.1,
        max_tokens: 200,
        enforceJson: false,
        timeoutMs: 15000
    }
});
```

## Additional Improvements

### Error Handling for Auth Failures

Updated error handling to detect authentication errors and skip further evaluation attempts:

```javascript
const isAuthError = error.message?.includes('Invalid API Key') || 
                   error.message?.includes('401') ||
                   error.message?.includes('authentication') ||
                   error.message?.includes('unauthorized');

if (isAuthError) {
    console.warn('⚠️ Evaluation skipped due to authentication error - proceeding without evaluation');
    return {
        isComprehensive: true,
        reason: 'Evaluation skipped - API authentication failed',
        usage: null,
        error: error.message,
        skipEvaluation: true // Signal to skip further attempts
    };
}
```

### Retry Loop Improvement

Added check to exit evaluation loop early if auth error occurs:

```javascript
// If evaluation should be skipped (e.g., auth error), exit evaluation loop but proceed with response
if (evaluation.skipEvaluation) {
    console.log(`⚠️ Evaluation skipped due to API error - proceeding with current response`);
    break;
}
```

## Files Modified

- `src/endpoints/chat.js`:
  - Lines 95-113: Fixed `llmResponsesWithTools` call parameters in evaluation
  - Lines 142-160: Enhanced error handling for auth errors
  - Lines 1918-1923: Added skipEvaluation check in retry loop
  - Lines 1968-1987: Fixed retry request to use correct `llmResponsesWithTools` format

## Expected Behavior

### Before Fix
```
🔍 Evaluating response comprehensiveness with llama-3.3-70b-versatile
⚠️ Model "llama-3.3-70b-versatile" missing provider prefix, assuming groq:llama-3.3-70b-versatile
🤖 LLM REQUEST: { url: 'https://api.groq.com/openai/v1/chat/completions', ... }
🤖 LLM RESPONSE: { status: 401, body: '{"error":{"message":"Invalid API Key",...}}' }
❌ Response evaluation failed: HTTP 401: Invalid API Key
✅ Response deemed comprehensive: Evaluation error - assuming comprehensive
```

### After Fix
```
🔍 Evaluating response comprehensiveness with llama-3.3-70b-versatile
🤖 LLM REQUEST: { url: 'https://api.groq.com/openai/v1/chat/completions', ... }
🤖 LLM RESPONSE: { status: 200, body: '{"comprehensive": true, "reason": "..."}' }
✅ Response deemed comprehensive: Response directly answers the query with sufficient detail
```

OR (if auth error):
```
🔍 Evaluating response comprehensiveness with llama-3.3-70b-versatile
⚠️ Evaluation skipped due to authentication error - proceeding without evaluation
⚠️ Evaluation skipped due to API error - proceeding with current response
```

## Testing

### Test Case 1: Normal Evaluation
1. Send a query with valid Groq API key
2. **Expected**: Evaluation should succeed with proper assessment
3. **Expected**: No "Evaluation error" message

### Test Case 2: Invalid API Key
1. Send a query with invalid Groq API key
2. **Expected**: Evaluation skipped with clear message
3. **Expected**: Response still sent (not blocked)
4. **Expected**: No retry attempts after auth error

### Test Case 3: Comprehensive Response
1. Ask: "What is 2+2?"
2. **Expected**: Evaluation deems response comprehensive
3. **Expected**: No retry attempts

### Test Case 4: Incomplete Response
1. Ask: "Tell me about the history of AI from 1950 to 2024"
2. Response: "AI started in the 1950s"
3. **Expected**: Evaluation deems response NOT comprehensive
4. **Expected**: System retries with encouragement

## Impact

### Positive
- ✅ Proper evaluation of response quality
- ✅ Correct API key passing to evaluation calls
- ✅ Clear error messages for auth failures
- ✅ No blocking on evaluation errors

### Potential Issues
- ⚠️ Evaluation still assumes comprehensive on non-auth errors
- ⚠️ May need to add fallback to different provider if primary fails

## User Requirement

> "The evaluation should be that the response was sufficient (or not) and if there is an evaluation error, the system should continue with further queries"

**Status**: ✅ Implemented
- Evaluation now properly assesses if response is sufficient
- Auth errors don't block response sending
- System continues with current response if evaluation fails

## Deployment

```bash
# Backend deployment
make deploy-lambda-fast
# ✅ Deployed: 2025-10-12 14:39:19
# Package size: 242K
# Function: llmproxy
# URL: https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws
```

## Related Issues

- **Previous fix**: Evaluation display moved to LLM transparency dialog
- **Related**: Tool usage improvements for calculations

## Update 2: Fixed Retry Request Format (2025-10-12 14:43)

### Additional Issue Found
The evaluation retry mechanism was also using incorrect parameter format, causing **empty messages array** to be sent:

```javascript
// BEFORE (incorrect):
const retryResponse = await llmResponsesWithTools({
    model: model,
    provider: provider,      // ❌ Not used
    apiKey: apiKey,          // ❌ Wrong location
    request: retryRequestBody, // ❌ Wrong format
    options: {
        enforceJson: false,
        timeoutMs: 30000
    }
});
// Result: '  "messages": [],\n' + (EMPTY!)
```

**Symptom**: Logs showed `"messages": []` causing empty response with `completion_tokens: 0`

**Fix**:
```javascript
// AFTER (correct):
const retryInput = retryMessages.map(msg => ({
    role: msg.role,
    content: msg.content
}));

const retryResponse = await llmResponsesWithTools({
    model: model,
    input: retryInput,       // ✅ Proper format
    tools: [],               // ✅ No tools
    options: {
        apiKey: apiKey,      // ✅ Correct location
        temperature: requestBody.temperature || 0.7,
        max_tokens: requestBody.max_tokens || 4096,
        enforceJson: false,
        timeoutMs: 30000
    }
});
```

**Impact**: Retry requests now properly send messages and should receive valid responses.

## Next Steps

1. ✅ Test evaluation with valid Groq API key
2. ✅ Test retry mechanism when response is not comprehensive
3. 📝 Consider adding evaluation provider fallback (use different provider if primary fails)
4. 📝 Add metrics for evaluation success/failure rates
5. 📝 Consider caching evaluation results for similar responses

## Notes

- `llmResponsesWithTools` is used throughout the codebase but expects specific parameter format
- The function auto-detects provider from model prefix (e.g., `groq:`, `openai:`, `gemini:`)
- API key MUST be passed in `options.apiKey`, not at top level
- Evaluation uses same provider/model as main request for consistency

---

**Keywords**: evaluation, API key, 401 error, llmResponsesWithTools, parameter format, authentication, Groq provider, self-evaluation, response quality
