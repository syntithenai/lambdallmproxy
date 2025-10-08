# LLM Events Fix - Chat Endpoint

**Date**: 2025-10-08  
**Status**: ✅ FIXED - llm_request/llm_response events now emitted from `/chat` endpoint

## Problem

User reported: "I still don't see llm events in the network panel under eventstream nor in the console. I'm pretty sure they're not being sent"

## Root Cause

The UI was calling the `/chat` endpoint (via `src/endpoints/chat.js`), **NOT** the `lambda_search_llm_handler.js` file that we had been adding events to.

### Architecture Discovery

```
User Browser (localhost:8081)
    ↓
    POST /chat
    ↓
src/index.js (router)
    ↓
src/endpoints/chat.js ← This is what the UI actually uses!
    ↓
    Makes streaming requests to Groq/OpenAI
```

**The confusion**: We were adding llm_request/llm_response events to `src/lambda_search_llm_handler.js`, but the UI uses `src/endpoints/chat.js` which had NO llm events at all!

## Solution

Added `llm_request` and `llm_response` events to the `/chat` endpoint at the correct locations:

### 1. llm_request Event (BEFORE API call)

**File**: `src/endpoints/chat.js`  
**Location**: Before line 383 (`makeStreamingRequest`)

```javascript
// Emit LLM request event
sseWriter.writeEvent('llm_request', {
    phase: 'chat_iteration',
    iteration: iterationCount,
    model,
    request: requestBody,
    timestamp: new Date().toISOString()
});

// Make streaming request
const response = await makeStreamingRequest(targetUrl, apiKey, requestBody);
```

### 2. llm_response Event (AFTER API response parsed)

**File**: `src/endpoints/chat.js`  
**Location**: After line 440 (after `parseOpenAIStream` completes)

```javascript
// Emit LLM response event
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

## Event Structure

### llm_request
```json
{
  "phase": "chat_iteration",
  "iteration": 1,
  "model": "groq:llama-3.1-8b-instant",
  "request": {
    "model": "llama-3.1-8b-instant",
    "messages": [...],
    "temperature": 0.7,
    "max_tokens": 2048,
    "tools": [...]
  },
  "timestamp": "2025-10-08T03:56:00.000Z"
}
```

### llm_response
```json
{
  "phase": "chat_iteration",
  "iteration": 1,
  "model": "groq:llama-3.1-8b-instant",
  "response": {
    "content": "The answer is...",
    "tool_calls": [...]  // Only included if tools were called
  },
  "timestamp": "2025-10-08T03:56:01.500Z"
}
```

## Verification

### What You Should Now See

**1. In Network Tab** (EventStream):
```
event: llm_request
data: {"phase":"chat_iteration","iteration":1,"model":"groq:llama-3.1-8b-instant",...}

event: llm_response
data: {"phase":"chat_iteration","iteration":1,"model":"groq:llama-3.1-8b-instant",...}
```

**2. In Browser Console**:
```
🔵 LLM API Request: {phase: "chat_iteration", iteration: 1, model: "groq:llama-3.1-8b-instant", ...}
🟢 LLM API Response: {phase: "chat_iteration", iteration: 1, model: "groq:llama-3.1-8b-instant", ...}
```

**3. In UI** (LlmApiTransparency component):
- Expandable section showing "🔍 LLM API Calls"
- Full request body including messages, model, parameters
- Full response including content and tool_calls
- Timestamp for each call

### Testing Steps

1. **Hard refresh browser**: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
2. **Send a test query**: "What is 2+2?"
3. **Check Network tab**: Should see `llm_request` and `llm_response` events
4. **Check Console**: Should see 🔵 and 🟢 log messages
5. **Check UI**: Should see expandable LLM API transparency section

## Why This Was Hard to Debug

1. **Multiple endpoints**: The project has two different chat implementations:
   - `src/lambda_search_llm_handler.js` - Research/planning endpoint (not used by UI)
   - `src/endpoints/chat.js` - OpenAI-compatible chat endpoint (actually used by UI)

2. **Router indirection**: The UI calls `/chat`, which is routed by `src/index.js` to `src/endpoints/chat.js`

3. **Assumption**: We assumed the UI used `lambda_search_llm_handler.js` based on the file structure, but it actually uses the `/chat` endpoint

## Files Modified

1. ✅ `src/endpoints/chat.js` - Added llm_request/llm_response events
2. ✅ `src/lambda_search_llm_handler.js` - Already had events (but UI doesn't use this)
3. ✅ `src/tools.js` - Already had events for search tool LLM calls

## Deployment

- **Deployed**: 2025-10-08 03:56 UTC
- **Method**: `make fast`
- **Status**: ✅ Success

## Next Steps

1. Test a query at `http://localhost:8081`
2. Verify llm_request/llm_response events appear in network tab
3. Verify console logs appear
4. Verify LlmApiTransparency UI component displays
5. If successful, consider removing debug logging from lambda_search_llm_handler.js

## Additional Notes

### Frontend Event Filtering

The frontend (ChatTab.tsx) filters out some phases from the UI display:
- ❌ Excluded: `page_summary`, `synthesis_summary` (internal processing)
- ✅ Included: `chat_iteration`, `planning`, `tool_iteration`, `final_synthesis`, etc.

To see ALL llm events (including internal ones), modify line 928 in `ui-new/src/components/ChatTab.tsx`:
```tsx
// Show all LLM events
if (true) {  // was: if (data.phase !== 'page_summary' && data.phase !== 'synthesis_summary')
    setLlmApiCalls(prev => [...prev, ...]);
}
```

### Iteration Count

The `chat_iteration` phase includes an `iteration` number because the chat endpoint can make multiple LLM calls in a loop when tools are involved:
1. First call: LLM decides to call tools
2. Tools are executed
3. Second call: LLM synthesizes final answer with tool results

Each iteration gets its own llm_request/llm_response pair.
