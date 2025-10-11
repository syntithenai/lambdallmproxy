# Provider Field Fix - LLM Transparency

**Date**: October 8, 2025  
**Issue**: Provider showing as "Unknown" in LLM transparency info block  
**Status**: ✅ Fixed and Deployed

---

## Problem

The LLM transparency info block was showing "Unknown" for the provider field because:
1. Backend was **not sending** the `provider` field in SSE events
2. Frontend was **falling back** to model name pattern matching
3. Pattern matching failed for some model names

**User Report**: "in the llm info block the provider is showing as unknown"

---

## Root Cause

### Backend Issue
The chat endpoint (`src/endpoints/chat.js`) had access to the `provider` variable (determined from model name or explicit provider setting) but was **not including it** in the SSE events:

**❌ Before**:
```javascript
sseWriter.writeEvent('llm_request', {
    phase: 'chat_iteration',
    iteration: iterationCount,
    model,  // ❌ No provider field
    request: requestBody,
    timestamp: new Date().toISOString()
});
```

### Frontend Issue
The frontend (`LlmApiTransparency.tsx`) was using pattern matching to detect provider:

```typescript
const getProviderFromModel = (model: string): string => {
  if (model.startsWith('gpt-') || model.startsWith('o1-')) {
    return 'OpenAI';
  }
  if (model.includes('claude')) {
    return 'Anthropic';
  }
  if (model.includes('llama') || model.includes('mixtral') || model.includes('gemma')) {
    return 'Groq';
  }
  return 'Unknown';  // ❌ Returned when no pattern matched
};
```

This approach:
- ✅ Works for common model names
- ❌ Fails for custom or unknown model names
- ❌ Doesn't respect user's explicit provider selection
- ❌ Doesn't work when model names don't follow conventions

---

## Solution

### Backend Changes

**File**: `src/endpoints/chat.js`

Added `provider` field to both `llm_request` and `llm_response` events:

**✅ After** (llm_request):
```javascript
// Emit LLM request event
sseWriter.writeEvent('llm_request', {
    phase: 'chat_iteration',
    iteration: iterationCount,
    provider,  // ✅ Added provider field
    model,
    request: requestBody,
    timestamp: new Date().toISOString()
});
```

**✅ After** (llm_response):
```javascript
// Emit LLM response event with HTTP headers
const eventData = {
    phase: 'chat_iteration',
    iteration: iterationCount,
    provider,  // ✅ Added provider field
    model,
    response: {
        content: assistantMessage.content,
        tool_calls: currentToolCalls.length > 0 ? currentToolCalls : undefined
    },
    httpHeaders: httpHeaders || {},
    httpStatus: httpStatus
};
```

The `provider` variable is already available in the chat endpoint (line ~330):
```javascript
const { provider: detectedProvider } = parseProviderModel(model);
const provider = body.provider || detectedProvider;
```

### Frontend Changes

**File**: `ui-new/src/utils/api.ts`

Updated TypeScript interface to include `provider` field:

```typescript
llmApiCalls?: Array<{
  phase: string;
  provider?: string;    // ✅ Added provider field
  model: string;
  request: any;
  response?: any;
  httpHeaders?: any;
  httpStatus?: number;
  timestamp: string;
}>;
```

**File**: `ui-new/src/components/LlmApiTransparency.tsx`

1. **Updated interface**:
```typescript
interface LlmApiCall {
  phase: string;
  provider?: string;  // ✅ Added
  model: string;
  request: any;
  response?: any;
  httpHeaders?: any;
  httpStatus?: number;
  timestamp: string;
}
```

2. **Enhanced provider detection** to use explicit provider when available:
```typescript
const getProviderFromModel = (model: string, provider?: string): string => {
  // Use explicit provider if available
  if (provider) {
    return provider.charAt(0).toUpperCase() + provider.slice(1); // Capitalize
  }
  
  // Fall back to model name detection
  if (model.startsWith('gpt-') || model.startsWith('o1-')) {
    return 'OpenAI';
  }
  if (model.includes('claude')) {
    return 'Anthropic';
  }
  if (model.includes('llama') || model.includes('mixtral') || model.includes('gemma')) {
    return 'Groq';
  }
  return 'Unknown';
};
```

3. **Updated all calls** to pass provider:
```typescript
// In the header display
{getProviderFromModel(call.model, call.provider)}

// In the full-screen modal
{getProviderFromModel(apiCalls[fullScreenCall].model, apiCalls[fullScreenCall].provider)}
```

**File**: `ui-new/src/components/ChatTab.tsx`

Updated event handlers to capture and store the `provider` field:

```typescript
// llm_request handler
llmApiCalls: [
  ...(newMessages[i].llmApiCalls || []),
  {
    phase: data.phase,
    provider: data.provider,  // ✅ Capture provider
    model: data.model,
    request: data.request,
    timestamp: data.timestamp
  }
]

// New placeholder creation
llmApiCalls: [{
  phase: data.phase,
  provider: data.provider,  // ✅ Capture provider
  model: data.model,
  request: data.request,
  timestamp: data.timestamp
}]
```

---

## Data Flow

```
User sends chat message
    ↓
Backend chat endpoint
    ↓
Determines provider from model or body.provider
    ↓
Includes provider in llm_request event
    ↓
Makes request to LLM API
    ↓
Includes provider in llm_response event
    ↓
Frontend ChatTab receives events
    ↓
Stores provider in llmApiCalls
    ↓
LlmApiTransparency displays provider
    ↓
Shows "Groq", "OpenAI", or "Anthropic" instead of "Unknown"
```

---

## Benefits

### ✅ Accurate Provider Display
- Provider now correctly shown as "Groq", "OpenAI", or "Anthropic"
- No more "Unknown" for valid providers
- Works for ALL model names, not just common patterns

### ✅ Respects User Settings
- If user explicitly sets provider in settings, it's respected
- Backend determines provider correctly and sends it to frontend

### ✅ Future-Proof
- New models don't need frontend pattern updates
- Adding new providers only requires backend configuration
- Frontend automatically displays any provider name

### ✅ Consistent with HTTP Headers
- This fix complements the recent HTTP headers work
- Both provider and headers now correctly captured and displayed
- Complete LLM transparency for spending tracking

---

## Testing

### Before Fix
```
LLM Calls (1)
├─ Chat Iteration
│  ├─ Unknown • llama-3.3-70b-versatile  ❌
│  └─ ...
```

### After Fix
```
LLM Calls (1)
├─ Chat Iteration
│  ├─ Groq • llama-3.3-70b-versatile  ✅
│  └─ ...
```

---

## Files Modified

### Backend
- ✅ `src/endpoints/chat.js` - Added `provider` to llm_request and llm_response events

### Frontend
- ✅ `ui-new/src/utils/api.ts` - Added `provider` to LlmApiCall interface
- ✅ `ui-new/src/components/LlmApiTransparency.tsx` - Updated to use provider field
- ✅ `ui-new/src/components/ChatTab.tsx` - Capture provider from events

---

## Deployment

### Backend
```bash
./scripts/deploy-fast.sh
```
**Status**: ✅ Deployed at 2025-10-08 20:01:16 UTC  
**Package**: llmproxy-20251008-200116.zip (101K)  
**Deployment Time**: ~10 seconds

### Frontend
```bash
cd ui-new && npm run build
./scripts/deploy-docs.sh -m "fix: Add provider field to LLM transparency info"
```
**Status**: ✅ Deployed at 2025-10-08 20:01:43 UTC  
**Build**: index-B0mwDEZ9.js  
**Commit**: 32a9889

---

## Related Work

This fix is part of the broader **LLM Transparency** initiative:

1. **✅ Phase 1-13**: Basic LLM transparency UI, JSON tree display, metadata
2. **✅ Phase 14-17**: HTTP response headers capture (for spending tracking)
3. **✅ Phase 18**: Provider field fix (this document)

Together, these provide complete visibility into:
- **Provider**: Which API service (Groq/OpenAI/Anthropic)
- **Model**: Which specific model
- **Request**: Full request body with expandable JSON
- **Response**: Full response with expandable JSON
- **Headers**: HTTP headers with rate limits, request IDs
- **Timing**: Request duration and timestamps
- **Cost**: Spending tracking via headers

---

## Next Steps

Users should now see the correct provider name (Groq, OpenAI, Anthropic) instead of "Unknown" in the LLM transparency info block.

To verify:
1. Hard refresh browser (Ctrl+Shift+R)
2. Send a chat message
3. Expand "LLM Calls"
4. Check that provider shows correctly (e.g., "Groq" for Llama models)

---

**Last Updated**: October 8, 2025 20:02 UTC  
**Author**: GitHub Copilot
