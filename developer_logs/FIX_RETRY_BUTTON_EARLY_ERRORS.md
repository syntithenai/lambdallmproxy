# Fix: Retry Button Error - "Cannot find original user prompt for retry"

**Date**: 2025-01-12  
**Type**: Bug Fix  
**Status**: ✅ Complete  

## Problem

When an error occurred immediately after sending a message (like "No LLM providers configured"), clicking the "Try Again" button on the error message would show:

```
❌ Error: Cannot find original user prompt for retry
```

This happened even though the user's original prompt was clearly visible in the chat.

### Example Scenario
1. User types: "What is the current stock price of Tesla and recent news about the company?"
2. User has no LLM providers configured
3. Backend immediately returns error: "No LLM providers configured"
4. Error message displays with "Try Again" button
5. User clicks "Try Again"
6. ❌ Toast appears: "Cannot find original user prompt for retry"
7. Nothing happens

## Root Cause

The issue was a **timing/closure problem** in the `handleSend` function:

1. User message added to state via `setMessages(prev => [...prev, userMessage])`
2. State update is **asynchronous** - doesn't complete immediately
3. Error handling code runs in the same function scope
4. Error handler searches for user message in `messages` variable (from closure)
5. `messages` variable still contains **old state** (before user message was added)
6. Search fails because the new user message isn't in the old state yet
7. `originalUserPromptIndex` set to `undefined`
8. Retry button fails with "Cannot find original user prompt"

### Code Flow

```typescript
// Old buggy code:
const userMessage = { role: 'user', content: textToSend };
setMessages(prev => [...prev, userMessage]); // Async state update

try {
  // ... fetch request ...
} catch (error) {
  // ERROR HANDLER RUNS HERE
  
  // Search for user message in 'messages' variable
  let lastUserMsgIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {  // ❌ 'messages' is OLD state
    if (messages[i].role === 'user') {
      lastUserMsgIndex = i;
      break;
    }
  }
  // lastUserMsgIndex = -1 (not found!)
  
  const errorMessage = {
    originalUserPromptIndex: lastUserMsgIndex >= 0 ? lastUserMsgIndex : undefined
    // ❌ undefined!
  };
}
```

## Solution

Track the user message index **synchronously** when adding the message, rather than searching for it later in stale state.

### Code Changes

**File**: `ui-new/src/components/ChatTab.tsx`

#### 1. Track User Message Index (Line 982-991)

```typescript
// Before:
setMessages(prev => {
  const newMessages = [...prev, userMessage];
  return newMessages;
});

// After:
// Track the index where the user message will be added (for retry functionality)
let currentUserMessageIndex: number = messages.length; // Initialize with current length
setMessages(prev => {
  console.log('🔵 Current messages count before adding user:', prev.length);
  currentUserMessageIndex = prev.length; // User message will be at this index
  const newMessages = [...prev, userMessage];
  console.log('🔵 Messages after adding user:', newMessages.length, 'User message at index:', currentUserMessageIndex);
  return newMessages;
});
```

**How it works:**
- `currentUserMessageIndex` initialized with `messages.length` (synchronous, from closure)
- Updated inside `setMessages` callback with `prev.length` (actual current count)
- Variable persists throughout the entire `handleSend` function scope
- Available to all error handlers

#### 2. Use Tracked Index in SSE Error Handler (Line 1768-1778)

```typescript
// Before:
// Find the last user message index for retry context
let lastUserMsgIndex = -1;
for (let i = messages.length - 1; i >= 0; i--) {
  if (messages[i].role === 'user') {
    lastUserMsgIndex = i;
    break;
  }
}

const errorMessage: ChatMessage = {
  originalUserPromptIndex: lastUserMsgIndex >= 0 ? lastUserMsgIndex : undefined,
  // ...
};

// After:
// Use the tracked user message index for retry context
const errorMessage: ChatMessage = {
  originalUserPromptIndex: currentUserMessageIndex,
  // ...
};
```

#### 3. Use Tracked Index in Timeout Handler (Line 1925-1935)

```typescript
// Before:
if (error instanceof Error && error.name === 'AbortError') {
  let lastUserMsgIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserMsgIndex = i;
      break;
    }
  }
  
  const timeoutMessage: ChatMessage = {
    originalUserPromptIndex: lastUserMsgIndex >= 0 ? lastUserMsgIndex : undefined,
    // ...
  };
}

// After:
if (error instanceof Error && error.name === 'AbortError') {
  const timeoutMessage: ChatMessage = {
    originalUserPromptIndex: currentUserMessageIndex,
    // ...
  };
}
```

#### 4. Use Tracked Index in General Error Handler (Line 1937-1958)

```typescript
// Before:
let lastUserMsgIndex = -1;
for (let i = messages.length - 1; i >= 0; i--) {
  if (messages[i].role === 'user') {
    lastUserMsgIndex = i;
    break;
  }
}

const errorMessage: ChatMessage = {
  originalUserPromptIndex: lastUserMsgIndex >= 0 ? lastUserMsgIndex : undefined,
  // ...
};

// After:
const errorMessage: ChatMessage = {
  originalUserPromptIndex: currentUserMessageIndex,
  // ...
};
```

## Benefits

### Before Fix ❌
- Early errors (validation, no providers, etc.) → retry fails
- User sees confusing "Cannot find original user prompt" error
- Only workaround: manually re-type the message

### After Fix ✅
- All errors have correct `originalUserPromptIndex`
- Retry button works for:
  - Provider validation errors
  - Network errors
  - Timeout errors
  - SSE stream errors
  - Any error that occurs after user message is sent
- User can retry with one click

## Error Types Fixed

1. **Provider Validation Errors**:
   - "No LLM providers configured"
   - "No enabled providers available"
   - Provider API key missing/invalid

2. **Network Errors**:
   - Connection refused
   - DNS resolution failures
   - CORS errors

3. **Timeout Errors**:
   - 4-minute timeout (tool execution taking too long)
   - AbortController triggered

4. **SSE Stream Errors**:
   - Stream interrupted
   - Invalid JSON in stream
   - Backend error events

## Testing

### Test Case 1: No Providers Configured
```
Steps:
1. Disable all providers in settings
2. Send message: "What is the weather today?"
3. See error: "No LLM providers configured"
4. Click "Try Again" button

Expected: ✅ Message restored to input, request auto-submitted
Actual (Before): ❌ "Cannot find original user prompt for retry"
Actual (After): ✅ Works correctly
```

### Test Case 2: Network Error
```
Steps:
1. Disconnect internet
2. Send message: "Hello"
3. See error: "Failed to fetch"
4. Click "Try Again" button

Expected: ✅ Message restored to input, request auto-submitted
Actual (Before): ❌ "Cannot find original user prompt for retry"
Actual (After): ✅ Works correctly
```

### Test Case 3: Timeout Error
```
Steps:
1. Enable all slow tools (web search, scraping, etc.)
2. Send complex query that takes >4 minutes
3. See timeout error
4. Click "Try Again" button

Expected: ✅ Message restored to input, request auto-submitted
Actual (Before): ❌ "Cannot find original user prompt for retry"
Actual (After): ✅ Works correctly
```

## Technical Details

### Why Searching Failed

React state updates are **batched and asynchronous**. The error handler code runs in the same synchronous execution context as the `setMessages` call, so it sees the **old state** from the closure:

```typescript
function handleSend() {
  const messages = [...]; // Closure captures this value
  
  setMessages(prev => [...prev, userMessage]); // Async - doesn't update 'messages' variable
  
  try {
    // fetch...
  } catch (error) {
    // 'messages' still has OLD value here!
    for (let i = messages.length - 1; i >= 0; i--) { // Searches old state
      // ...
    }
  }
}
```

### Why Tracking Works

By capturing the index synchronously and updating it in the setter callback, we have the correct value available throughout the function scope:

```typescript
function handleSend() {
  const messages = [...]; // Old state in closure
  let currentUserMessageIndex = messages.length; // Sync: current length
  
  setMessages(prev => {
    currentUserMessageIndex = prev.length; // Actual current length
    return [...prev, userMessage];
  });
  
  try {
    // fetch...
  } catch (error) {
    // 'currentUserMessageIndex' has correct value!
    const errorMessage = {
      originalUserPromptIndex: currentUserMessageIndex
    };
  }
}
```

## Related Issues Fixed

This fix also resolves:
- Retry button showing "Invalid user prompt for retry"
- Retry count not incrementing properly for early errors
- Retry button disappearing after failed retry attempt

## Files Modified

- `ui-new/src/components/ChatTab.tsx` (lines 982-991, 1768-1778, 1925-1958)

## Deployment

```bash
cd ui-new
npm run build
cd ..
./scripts/deploy-docs.sh --build -m "fix: retry button for early errors"
```

## Success Criteria

✅ Retry button works for provider validation errors  
✅ Retry button works for network errors  
✅ Retry button works for timeout errors  
✅ Retry button works for SSE stream errors  
✅ No "Cannot find original user prompt" errors  
✅ User message correctly restored to input field  
✅ Request automatically submitted after retry click  

---

## Summary

The fix ensures that error messages always have a valid `originalUserPromptIndex` by tracking the index synchronously when the user message is added, rather than searching for it later in stale state. This makes the retry functionality work correctly for all error types, including early validation errors that occur before the state update completes.
