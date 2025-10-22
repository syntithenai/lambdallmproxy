# Planning Endpoint: Single Request Architecture

## Issue Identified & Fixed

### 🚨 **Problem Found**
The planning endpoint was inadvertently making **duplicate model selections** due to transparency preview code:

1. **First Selection**: In transparency preview code (before actual request)
2. **Second Selection**: In `generatePlan()` function (for actual request)

This could cause:
- Rate limit tracker confusion
- Round-robin state corruption  
- Provider availability double-checking
- Potential 429 errors from rapid successive calls

### ✅ **Solution Implemented**

**Removed duplicate model selection logic** from transparency preview and simplified to:

```javascript
// Before: Complex model selection preview (duplicate logic)
// After: Simple status event
sseWriter.writeEvent('llm_request', {
    phase: 'planning',
    timestamp: new Date().toISOString(),
    status: 'initializing',
    query: query,
    requestedModel: requestedModel,
    message: 'Initializing planning request...'
});
```

**Detailed transparency sent after completion:**
```javascript
// After successful generatePlan() call
sseWriter.writeEvent('llm_request', {
    // ... detailed model info
    status: 'completed'
});

sseWriter.writeEvent('llm_response', {
    // ... full response details with tokens
});
```

## Current Architecture

### ✅ **Single Request Flow**

```
Planning Request → generatePlan() → llmResponsesWithTools() → Single LLM Call → Result
```

**Key Points:**
- ✅ **Exactly one LLM request** per planning call
- ✅ **No retry logic** in planning endpoint  
- ✅ **No duplicate model selection**
- ✅ **Efficient transparency events** (sent after completion)
- ✅ **Rate limit friendly** (single model selection pass)

### 📊 **Request Sequence**

1. **Planning Request Received**
   - Authentication check
   - Send `llm_request` (status: 'initializing')

2. **Single generatePlan() Call**
   - Model selection (one pass)
   - Single LLM request via `llmResponsesWithTools()`
   - JSON parsing and validation

3. **Transparency Events Sent**
   - `llm_request` (status: 'completed') with model details
   - `llm_response` with tokens, timing, headers
   - `result` with research plan

4. **Complete**
   - Single research plan returned
   - Ready for injection into chat

## Error Handling

**429 Rate Limit Sources:**
- ❌ **NOT** from planning endpoint (single request)
- ✅ **Likely** from research execution (multiple concurrent calls)
- ✅ **Likely** from chat endpoint retry mechanisms

**Planning Endpoint Rate Limit Prevention:**
- Single model selection pass
- No retry logic
- Efficient provider checking
- Respects rate limit tracker state

## Verification

**To confirm single request behavior:**
1. Check logs for `🔍 Planning: Calling generatePlan...` (should appear once)
2. Look for `🤖 LLM REQUEST:` entries (should be one per planning call)
3. Monitor rate limit headers in transparency events
4. Verify no multiple model selection logs

**Transparency Events Available:**
- `llm_request` (initializing → completed)
- `llm_response` (full details with tokens)
- `error`/`llm_error` (if failures occur)

## Status: ✅ FIXED

The planning endpoint now makes **exactly one reasoning model request** as intended, with efficient transparency logging and no duplicate operations that could cause rate limiting issues.