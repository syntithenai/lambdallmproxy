# LLM Info Attachment Fix - Phase 31

**Date**: October 8, 2025 22:51 UTC  
**Issue**: LLM transparency info was being attached to previous query's assistant message  
**Fix**: Only attach to "active" assistants (empty or currently streaming)  
**Deployment**: commit 0f72606, build index-C5lJpF0p.js

## Problem Description

When a new query is sent and an `llm_request` event arrives with LLM transparency info (showing what request/response was sent to upstream LLM), the event handler would search backwards through ALL messages to find an assistant message to attach the info to.

This caused the NEW query's LLM transparency info to be incorrectly attached to the PREVIOUS query's completed assistant message, because that was the "last assistant" in the message history.

## Root Cause

**File**: `ui-new/src/components/ChatTab.tsx`  
**Lines**: 1008-1070 (llm_request event handler)

The handler searched backwards for "any assistant message":

```typescript
// BUGGY CODE (before fix):
for (let i = newMessages.length - 1; i >= 0; i--) {
  if (newMessages[i].role === 'assistant') {
    // ATTACH HERE ← Could be from previous query!
    newMessages[i] = {
      ...newMessages[i],
      llmApiCalls: [...(newMessages[i].llmApiCalls || []), llmData]
    };
    foundAssistant = true;
    break;
  }
}
```

**Problem**: This searches through ALL messages without checking if the found assistant is from the current query or a previous query.

## Solution

Added a check to only attach to "active" assistants - those that are:
- Currently streaming (`isStreaming: true`), OR
- Empty (no content yet), OR
- Have empty/whitespace-only content

Completed assistants with content are from previous queries and should be skipped.

```typescript
// FIXED CODE (after fix):
for (let i = newMessages.length - 1; i >= 0; i--) {
  if (newMessages[i].role === 'assistant') {
    // CRITICAL: Only attach to assistant if it's empty or currently streaming
    // If it has content and isn't streaming, it's from a previous query
    const isActiveAssistant = 
      newMessages[i].isStreaming || 
      !newMessages[i].content || 
      newMessages[i].content.trim().length === 0;
    
    if (isActiveAssistant) {
      console.log('🔵 Attaching llmApiCalls to active assistant at index:', i);
      newMessages[i] = {
        ...newMessages[i],
        llmApiCalls: [...(newMessages[i].llmApiCalls || []), llmData]
      };
      foundAssistant = true;
    } else {
      console.log('🔵 Skipping completed assistant at index:', i, '(from previous query)');
    }
    break;
  }
}
```

## Pattern Recognition

This is the **THIRD instance** of the same underlying bug pattern:

1. **Phase 29 (UI message filter)**: Searched for "last user message" without tracking query boundaries → kept wrong messages
2. **Phase 30 (backend filter)**: Had same pattern (hardened as defense-in-depth)
3. **Phase 31 (LLM info attachment)**: Searched for "last assistant" without tracking query boundaries → attached to wrong message

**Common Root Cause**: Not properly distinguishing between "current query cycle" and "previous query history" when searching backwards through messages.

## Impact

**Before Fix**:
- Multi-turn conversations: LLM transparency info from query N appeared on assistant message from query N-1
- Users couldn't see which LLM was used for the current response
- Transparency feature was broken for all multi-turn conversations

**After Fix**:
- LLM transparency info correctly attaches to the current query's assistant message
- Users can see which provider/model was used for each response
- Works correctly in both single-turn and multi-turn conversations

## Testing

To verify the fix works:

1. **Start new conversation**: Send first query
   - ✅ LLM info should show on first response
   
2. **Send follow-up query**: Send second query in same conversation
   - ✅ LLM info should show on second response (NOT first)
   - ✅ First response should retain its original LLM info
   
3. **Multi-turn conversation**: Send 3+ queries
   - ✅ Each response should show its own LLM info
   - ✅ No LLM info should "jump" to previous responses

## Files Changed

**UI Source**: `ui-new/src/components/ChatTab.tsx`
- Lines 1023-1042: Added `isActiveAssistant` check
- Lines 1033: Added skip logging for completed assistants

**Generated Files**: `docs/assets/index-C5lJpF0p.js`
- Built: October 8, 2025 22:51 UTC
- Size: 714.75 KB (213.09 KB gzipped)

## Deployment

**Git**:
- Commit: `0f72606`
- Message: "docs: update built site (2025-10-08 22:51:53 UTC) - fix: LLM info only attaches to active assistant (current query)"
- Branch: `agent`
- Remote: `origin`

**Build**:
- Node.js: 20.12.2 (note: Vite recommends 20.19+ or 22.12+)
- Vite: 7.1.9
- Modules: 531 transformed
- Build time: 2.95s

## Related Issues

- **Phase 28**: Initial Layer 12 implementation (tool_calls stripping)
- **Phase 29**: Critical UI filter bug (last user message logic)
- **Phase 30**: Backend filter hardening (defense-in-depth)
- **Phase 31**: This fix (LLM info attachment)

See `UI_FILTER_BUG_FIX.md` and `TOKEN_OPTIMIZATION_STRATEGY.md` for related fixes.

## Future Improvements

**Architectural Consideration**: All three bugs (Phases 29-31) stem from the same root cause: no explicit tracking of "current query cycle" boundaries.

**Potential Solution**: Introduce explicit cycle tracking:
```typescript
interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  cycleId?: string; // Track which query cycle this message belongs to
  // ...
}
```

This would make it trivial to:
- Filter messages by cycle
- Attach info only to current cycle's assistants
- Prevent similar bugs in the future

However, the current fix is sufficient and avoids architectural changes.
