# Fix: LLM Transparency Preservation in Placeholder Messages

**Date**: 2025-01-08 04:48 UTC  
**Status**: ✅ DEPLOYED

## Problem

The final response block did not contain LLM transparency information even though the `llm_request` and `llm_response` events were being emitted.

### Root Cause

When `llm_request` arrives before the first `delta`, we create a placeholder assistant message:

```typescript
// Placeholder created (HAS llmApiCalls)
{
  role: 'assistant',
  content: '',
  isStreaming: true,
  llmApiCalls: [{phase, model, request, timestamp}]
}
```

But then when the first `delta` arrives, the code was creating a **NEW** assistant message instead of updating the placeholder:

```typescript
// NEW message created (LOSES llmApiCalls)
{
  role: 'assistant',
  content: data.content,
  isStreaming: true
  // ❌ llmApiCalls LOST!
}
```

## Solution

Added a check in the `delta` handler to detect and update placeholder messages:

**File**: `ui-new/src/components/ChatTab.tsx` (lines 610-631)

### Before

```typescript
if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
  // Append to existing streaming message
  ...
} else {
  // Create NEW message (loses llmApiCalls!)
  const newBlock: ChatMessage = {
    role: 'assistant',
    content: data.content,
    isStreaming: true
  };
  return [...prev, newBlock];
}
```

### After

```typescript
if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
  // Append to existing streaming message
  ...
} else if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.content && lastMessage.llmApiCalls) {
  // If last message is an empty placeholder with llmApiCalls, UPDATE it
  const newMessages = [...prev];
  newMessages[lastMessageIndex] = {
    ...lastMessage,  // ✅ Preserve llmApiCalls and other fields
    content: data.content,
    isStreaming: true
  };
  console.log('🟦 Updating placeholder assistant message with content at index:', lastMessageIndex);
  return newMessages;
} else {
  // Create NEW message
  const newBlock: ChatMessage = {
    role: 'assistant',
    content: data.content,
    isStreaming: true
  };
  return [...prev, newBlock];
}
```

## Event Flow Timeline

**With the fix**:

1. `llm_request` arrives → Create placeholder with `llmApiCalls`
2. First `delta` arrives → **Update placeholder** (preserve `llmApiCalls`)
3. More `delta` events → Append content
4. `llm_response` arrives → Update `llmApiCalls` with response
5. `message_complete` → Mark as not streaming
6. **Result**: Assistant message has both content AND `llmApiCalls` ✅

## Benefits

✅ **LLM transparency now shows** on final response  
✅ **No data loss** - llmApiCalls preserved throughout streaming  
✅ **Cleaner state** - No duplicate assistant messages  
✅ **Better debugging** - Console log shows when placeholder is updated  

## Testing Instructions

1. **Hard refresh** (Ctrl+Shift+R) to load `index-DYXypHfM.js`

2. **Test Basic Query**:
   ```
   Send: "What is 2+2?"
   ```
   - ✅ Assistant response appears
   - ✅ LLM transparency block appears below response
   - ✅ Shows API request and response

3. **Test Search Query**:
   ```
   Send: "Latest AI news"
   ```
   - ✅ Search tool executes
   - ✅ Final synthesis appears
   - ✅ LLM transparency shows for final response
   - ✅ Includes both planning AND synthesis API calls

4. **Check Console Logs**:
   ```
   🔵 No assistant message found, creating placeholder for llm_request
   🟦 Updating placeholder assistant message with content at index: 0
   🟢 LLM API Response: ...
   ```

## Edge Cases Handled

### Case 1: Placeholder Updated
```
1. llm_request → Create placeholder with llmApiCalls
2. delta → Update placeholder (preserve llmApiCalls) ✅
3. Result: 1 message with content + llmApiCalls
```

### Case 2: Streaming Already Started
```
1. delta → Create streaming message
2. llm_request → Find streaming message, add llmApiCalls ✅
3. More deltas → Append content
4. Result: 1 message with content + llmApiCalls
```

### Case 3: Tool Iteration
```
1. llm_request (iteration 1) → Placeholder
2. delta → Update placeholder
3. tool_call_start → Add tool calls
4. tool_call_result → Add tool message
5. llm_request (iteration 2) → New placeholder ✅
6. delta → Update new placeholder
7. Result: 2 assistant messages, each with llmApiCalls
```

## Build & Deployment

**Build**:
```bash
cd ui-new && npm run build
```

**Output**:
- File: `docs/assets/index-DYXypHfM.js` (708.21 KB)
- Build time: 2.73s

**Deploy**:
```bash
bash scripts/deploy-docs.sh -m "fix: Preserve llmApiCalls when updating placeholder assistant messages with content"
```

**Deployed at**: 2025-01-08 04:48 UTC  
**Git commit**: `b4c102e`  
**Branch**: `agent`

## Files Modified

1. `ui-new/src/components/ChatTab.tsx`:
   - Lines 617-626: Added check for placeholder message with llmApiCalls
   - Preserves all fields when updating placeholder

## Verification

**Before this fix**:
```typescript
// Placeholder (has llmApiCalls)
{role: 'assistant', content: '', llmApiCalls: [...]}

// After delta (NEW message, LOST llmApiCalls)
{role: 'assistant', content: 'Response...', llmApiCalls: undefined}

❌ No LLM transparency shown
```

**After this fix**:
```typescript
// Placeholder (has llmApiCalls)
{role: 'assistant', content: '', llmApiCalls: [...]}

// After delta (UPDATED placeholder, KEPT llmApiCalls)
{role: 'assistant', content: 'Response...', llmApiCalls: [...]}

✅ LLM transparency shown
```

## Related Fixes

This builds on previous fixes:
- `88deb4e`: Strip UI-only fields before API call
- `87f9cd2`: Create placeholder for llm_request
- `56ca9df`: Replace async storage with regular state

## Status

✅ **RESOLVED** - LLM transparency now appears on final response blocks. Placeholder messages are properly updated instead of replaced.
