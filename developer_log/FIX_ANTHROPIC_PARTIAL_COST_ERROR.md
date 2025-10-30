# Fix: Anthropic API Error - Unsupported 'partialCost' Property

**Date**: October 30, 2025  
**Status**: ✅ FIXED  
**Issue**: Anthropic API rejecting messages with UI-specific properties

---

## Problem

User received error when using Anthropic Claude provider:

```
❌ Error: 'messages.8' : for 'role:assistant' the following must be satisfied
[('messages.8' : property 'partialCost' is unsupported)]
```

### Root Cause

When a user **manually stops** a streaming request in the UI (using the stop button), the frontend saves the partial response with UI-specific metadata properties:

**File**: `ui-new/src/components/ChatTab.tsx` (lines 1525-1560)

```typescript
// When user clicks stop, finalize the streaming message
newMessages[currentStreamingBlockIndex] = {
  ...currentMsg,
  content: partialContent + '\n\n_⏹️ Request stopped by user..._',
  isStreaming: false,
  wasStopped: true,        // ⚠️ UI-only flag
  llmApiCalls,
  partialCost              // ⚠️ UI-only field (cost from partial tokens)
};
```

When this message is included in subsequent conversation turns, the cleanup code (lines 2451-2468) **did not remove** `partialCost` and `wasStopped` properties:

```typescript
// Clean UI-only fields before sending to API
const cleanedMessages = messagesWithSystem.map(msg => {
  const { 
    _attachments, 
    llmApiCalls, 
    isStreaming, 
    toolResults, 
    // ... other UI fields ...
    errorData,
    imageGenerations,
    // ❌ MISSING: partialCost
    // ❌ MISSING: wasStopped
    ...cleanMsg 
  } = msg as any;
  return cleanMsg;
});
```

**Result**: Anthropic API received messages with unsupported properties and rejected the request.

---

## Solution

Added `partialCost` and `wasStopped` to the message cleanup list:

**File**: `ui-new/src/components/ChatTab.tsx` (lines 2451-2470)

```typescript
// Clean UI-only fields before sending to API
const cleanedMessages = messagesWithSystem.map(msg => {
  const { 
    _attachments, 
    llmApiCalls, 
    isStreaming, 
    toolResults, 
    isRetryable, 
    retryCount, 
    originalUserPromptIndex,
    originalErrorMessage,
    extractedContent,
    rawResult,
    evaluations,
    errorData,
    imageGenerations,
    partialCost,        // ✅ ADDED
    wasStopped,         // ✅ ADDED
    ...cleanMsg 
  } = msg as any;
  return cleanMsg;
});
```

---

## Testing

### Before Fix
```
User: "Hello"
Assistant: [streaming response...]
User: [clicks STOP button]
Assistant: [partial response saved with partialCost + wasStopped]

User: "Continue"
Backend: Sends messages including the stopped message
Anthropic API: ❌ Error: 'property partialCost is unsupported'
```

### After Fix
```
User: "Hello"
Assistant: [streaming response...]
User: [clicks STOP button]
Assistant: [partial response saved with partialCost + wasStopped]

User: "Continue"
Backend: Cleans messages, removes partialCost + wasStopped
Anthropic API: ✅ Accepts cleaned messages
Assistant: [responds normally]
```

---

## Related Code

### UI-Only Message Properties (Documentation)

**File**: `ui-new/src/utils/api.ts` (lines 257-259)

```typescript
export interface ChatMessage {
  // ... other fields ...
  
  // Manual stop support
  wasStopped?: boolean;     // Flag indicating request was manually stopped by user
  partialCost?: number;     // Cost calculated from partial tokens received before stop
  
  // ... other fields ...
}
```

These properties are **intentionally UI-only** and should never be sent to backend APIs.

---

## Historical Context

Similar issue was fixed previously for other UI-specific properties:

**File**: `developer_logs/DEPLOYMENT_20251009_114537.md`

```markdown
### Fixed OpenAI API Error

**Problem**: Frontend was sending UI-specific properties (`errorData`, `llmApiCalls`, 
`isStreaming`) in messages, causing OpenAI API to reject requests.

**Solution**: Strip UI-specific properties before sending to LLM API:

```javascript
const cleanMessages = filteredMessages.map(msg => {
    const { isStreaming, errorData, llmApiCalls, ...cleanMsg } = msg;
    return cleanMsg;
});
```
```

This fix extends that pattern to also cover `partialCost` and `wasStopped`.

---

## Verification

✅ **File Modified**: `ui-new/src/components/ChatTab.tsx`  
✅ **No Compilation Errors**: TypeScript check passed for ChatTab.tsx  
✅ **Interface Documented**: Properties already documented in api.ts as UI-only  
✅ **Pattern Consistent**: Follows existing cleanup pattern for other UI fields

---

## Deployment

### Local Testing

```bash
# Rebuild UI with fix
cd ui-new && npm run build

# Restart local dev server
cd .. && make dev

# Test Anthropic provider with stop button
```

### Production Deployment

```bash
# Deploy UI to GitHub Pages
make deploy-ui
```

**Note**: No backend changes required - this is a frontend-only fix.

---

## Impact

- ✅ **Fixes**: Anthropic API errors when conversation includes stopped messages
- ✅ **Improves**: Robustness of message cleanup across all providers
- ✅ **Prevents**: Similar errors for any provider with strict schema validation

---

**End of Document**
