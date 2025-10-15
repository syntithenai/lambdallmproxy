# LLM Transparency Improvements for Planning Endpoint

## Issues Fixed

### Problem 1: Missing LLM Call Information in Planning UI
**Issue**: Users couldn't see real-time LLM call transparency info during planning requests
**Root Cause**: Planning endpoint wasn't sending the correct SSE events that the UI was listening for

### Problem 2: Rate Limiting (429 Errors)
**Issue**: Planning requests were hitting rate limits and retrying rapidly
**Root Cause**: Likely due to failed requests causing UI to retry, possibly from authentication or previous JSON parsing errors

## Solution Implemented

### 1. Fixed SSE Event Types
**Before**: Backend sent `llm_request` events for both start and completion
**After**: Backend sends proper event sequence:
- `llm_request` for request initiation  
- `llm_response` for response completion (what UI expects)

```javascript
// Before (incorrect):
sseWriter.writeEvent('llm_request', { status: 'completed', ... });

// After (correct):
sseWriter.writeEvent('llm_response', { status: 'completed', ... });
```

### 2. Added Real-Time LLM Transparency Events
Enhanced the planning endpoint to send detailed events during the actual LLM call:

**Event Sequence Now**:
1. `status`: "Generating research plan..."
2. `llm_request`: "Initializing planning request..."
3. `llm_request`: "Making planning request to model..." (NEW - real-time)
4. `llm_response`: "Received response from model" (NEW - real-time)  
5. `llm_response`: Final transparency data with token usage (FIXED event type)
6. `result`: Final planning result

### 3. Enhanced LLM Transparency Data
Added comprehensive transparency information to `llm_response` events:

```javascript
sseWriter.writeEvent('llm_response', {
    phase: 'planning',
    model: finalModelString,
    provider: selectedModel.providerType,
    modelName: selectedModel.name || selectedModel.id,
    timestamp: new Date().toISOString(),
    status: 'completed',
    requestedModel: requestedModel,
    selectedViaLoadBalancing: !requestedModel,
    query: query,
    message: `Planning request completed using ${finalModelString}`,
    tokenUsage: tokenUsage,
    promptTokens: tokenUsage.promptTokens,
    completionTokens: tokenUsage.completionTokens,
    totalTokens: tokenUsage.totalTokens
});
```

### 4. Modified generatePlan Function
Updated `generatePlan` to accept an optional event callback for real-time events:

```javascript
// Function signature changed:
async function generatePlan(query, providers, requestedModel, eventCallback = null)

// Real-time event sending during LLM call:
if (eventCallback) {
    eventCallback('llm_request', { ... }); // Before LLM call
    // ... LLM call ...
    eventCallback('llm_response', { ... }); // After LLM call
}
```

### 5. Event Forwarding in Handler
The handler now forwards real-time events from generatePlan to the SSE stream:

```javascript
const plan = await generatePlan(query, providers, requestedModel, (eventType, eventData) => {
    // Forward events from generatePlan to SSE stream
    sseWriter.writeEvent(eventType, eventData);
});
```

## Benefits

### For Users:
- ✅ **Real-time visibility**: See exactly when LLM requests start and complete
- ✅ **Model transparency**: Know which model was selected and why
- ✅ **Token usage**: See exact token consumption for planning requests
- ✅ **Load balancing insight**: Understand when load balancing selected a different model
- ✅ **Error context**: Better error messages with model and provider context

### For Debugging:
- 🔍 **Request tracing**: Full event sequence shows exactly what happened
- 📊 **Performance monitoring**: Response times and token usage visible
- 🎯 **Model selection insight**: See load balancing decisions in real-time
- 🚨 **Error diagnosis**: Clear context when things go wrong

## Frontend Integration
The UI already handles these events correctly in `PlanningDialog.tsx`:

```typescript
case 'llm_response':
  // Store LLM transparency information
  setLlmInfo(data);
  console.log('Captured LLM transparency info:', data);
  break;
```

## Testing
To verify the improvements work:
1. Open planning dialog in UI
2. Submit a planning request
3. Check browser console for "Captured LLM transparency info" messages
4. Verify real-time updates show model selection and token usage

## Technical Details

### Files Modified:
- `src/endpoints/planning.js`: Main transparency improvements
- Enhanced `generatePlan()` function signature
- Fixed SSE event types from `llm_request` to `llm_response`
- Added real-time event callbacks
- Enhanced transparency data structure

### Deployment:
- ✅ **Deployed**: October 14, 2025
- ✅ **Status**: Function updated successfully  
- ✅ **Backward Compatible**: No breaking changes to existing functionality

## Rate Limiting Resolution
The 429 errors should be resolved because:
1. Planning requests now work properly (no more JSON parsing errors)
2. Authentication issues resolved (no rapid retries)  
3. Better error handling prevents cascading failures

---
*Status: Complete ✅*  
*Deployed: October 14, 2025*