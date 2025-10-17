# Error Cost Display Bug Fix

## Problem

When an error occurred (e.g., "No LLM providers configured"), the UI was showing the cost from the **previous successful request** even though no LLM calls were made for the error.

Example error message:
```
❌ Error: No LLM providers configured. Please add at least one provider in settings.

Request cost: $0.0011  ← WRONG! This is from the previous request
(Total: $0.0049)
```

## Root Cause

**Frontend State Management Issue:**

The `lastRequestCost` state variable was not being reset when starting a new request. The UI component displays the cost badge for the last assistant message if `lastRequestCost > 0`, so when an error message was added as an assistant message, it incorrectly showed the cost from the previous successful request.

**Code Location:** `ui-new/src/components/ChatTab.tsx` line ~3843

```tsx
{/* Request cost badge for the last assistant message */}
{msg.role === 'assistant' && !isLoading && lastRequestCost > 0 && idx === messages.length - 1 && (
  <div className="mt-2 flex items-center justify-end">
    <div className="inline-flex items-center gap-1 bg-green-50 ...">
      Request cost: {formatCost(lastRequestCost)}  ← Shows stale cost from previous request
      {usage && (
        <span className="ml-1 opacity-75">
          (Total: {formatCost(usage.totalCost)})
        </span>
      )}
    </div>
  </div>
)}
```

## Backend Verification

The backend is **working correctly**:
- Early errors (authentication, no providers, validation) return immediately with an `error` event
- No LLM calls are made
- No `complete` event with cost is sent
- The cost badge issue was purely a frontend display problem

**Backend Code:** `src/endpoints/chat.js` line ~1031

```javascript
if (!hasProviders) {
    // Send error event
    sseWriter.writeEvent('error', {
        error: 'No LLM providers configured. Please add at least one provider in settings.',
        code: 'FORBIDDEN',
        statusCode: 403,
        requiresProviderSetup: true,
        authorized: authResult.authorized
    });
    responseStream.end();
    return;  // ✅ Returns immediately without sending 'complete' event
}
```

## Solution

Reset `lastRequestCost` to 0 when starting a new request in the `handleSend` function.

**File:** `ui-new/src/components/ChatTab.tsx` line ~1385

**Change:**
```tsx
setInput('');
setHistoryIndex(-1);
setAttachedFiles([]);
setIsLoading(true);
setToolStatus([]);
setStreamingContent('');
setLastRequestCost(0); // ← ADDED: Reset cost for new request
setExpandedToolMessages(new Set());
```

## How It Works Now

1. **User sends a message** → `lastRequestCost` is reset to 0
2. **If error occurs** → Error message is added as assistant message, but cost badge doesn't show (lastRequestCost = 0)
3. **If request succeeds** → `complete` event with cost is received, `lastRequestCost` is updated
4. **Cost badge displays** → Only shows for successful requests with actual LLM costs

## Testing

**Test Case 1: Error with no providers**
1. Remove all providers from settings
2. Send a message
3. Expected: Error message with NO cost badge

**Test Case 2: Successful request then error**
1. Configure providers
2. Send a successful message (cost badge shows: e.g., $0.0011)
3. Remove providers
4. Send another message
5. Expected: Error message with NO cost badge (previous $0.0011 should not appear)

**Test Case 3: Multiple successful requests**
1. Send message 1 → Shows cost for request 1
2. Send message 2 → Shows cost for request 2 (not request 1)
3. Expected: Each request shows its own cost, no stale values

## Files Modified

- ✅ `ui-new/src/components/ChatTab.tsx` - Added `setLastRequestCost(0)` in handleSend function

## Status

✅ **Fixed** - Cost badge now only appears for actual LLM requests with real costs
✅ **No Backend Changes Needed** - Backend was already correct
✅ **Hot Reload** - Vite should auto-reload the changes

---

**Date:** October 17, 2025
**Issue:** Frontend state management bug showing stale cost data
**Fix:** Reset lastRequestCost when starting new request
