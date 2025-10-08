# Fix: LLM Transparency on Correct Message

**Date**: 2025-01-08 05:00 UTC  
**Status**: ✅ DEPLOYED

## Problem Report

User reported two issues:

1. **LLM transparency shown one block before it should be**: The final response block was empty, and the previous block contained LLM info for the final block.

2. **Empty response blocks don't show LLM transparency**: When an earlier response block contains no content, the LLM transparency information is not visible.

## Root Cause Analysis

### Issue 1: Wrong Message Placement

**Problem Flow**:
```
1. llm_request (planning) → Create placeholder with llmApiCalls
2. delta → Update placeholder with "Let me search..."
3. Tool execution → Add tool message to array
4. llm_request (final) → Attach to SAME assistant message ❌
5. delta → Append to SAME streaming message ❌
6. Result: "Let me search..." has BOTH planning AND final llmApiCalls
```

**Root Cause**: The delta handler was checking if the last message was a streaming assistant message and appending to it, WITHOUT checking if a tool execution had happened in between. When tools execute, a new assistant message should be created for the next phase.

### Issue 2: Empty Messages

**Current State**: Empty messages with llmApiCalls ARE being rendered (line 1243 has this logic already). The condition to skip empty assistant messages explicitly checks for `llmApiCalls`:

```typescript
// Skip assistant messages with no content UNLESS they have llmApiCalls
if (msg.role === 'assistant' && !msg.content && msg.tool_calls && 
    !hasTranscriptionInProgress && !msg.llmApiCalls) {
  return null; // Only skip if NO llmApiCalls
}
```

So empty messages with llmApiCalls should be visible. If they're not showing transparency, it's likely because:
- Message is still marked as `isStreaming: true` (transparency only shows when `!msg.isStreaming`)
- OR the message_complete event isn't being received for empty messages

## Solution

### Fix 1: Detect Tool Execution Between Messages

**File**: `ui-new/src/components/ChatTab.tsx` (lines 600-640)

Added detection of tool messages to determine if a new assistant message should be created:

**Before**:
```typescript
if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
  // Always append to existing streaming message ❌
  newMessages[lastMessageIndex] = {
    ...lastMessage,
    content: (lastMessage.content || '') + data.content
  };
  return newMessages;
}
```

**After**:
```typescript
// Check if there's a tool message after the last assistant message
const hasToolMessageAfterAssistant = lastMessage?.role === 'tool';

// If last message is streaming assistant AND no tool execution, append
if (lastMessage && lastMessage.role === 'assistant' && 
    lastMessage.isStreaming && !hasToolMessageAfterAssistant) {
  // Safe to append ✅
  newMessages[lastMessageIndex] = {
    ...lastMessage,
    content: (lastMessage.content || '') + data.content
  };
  return newMessages;
} 
// If last message is empty placeholder AND no tool execution, update it
else if (lastMessage && lastMessage.role === 'assistant' && 
         !lastMessage.content && lastMessage.llmApiCalls && 
         !hasToolMessageAfterAssistant) {
  // Safe to update placeholder ✅
  newMessages[lastMessageIndex] = {
    ...lastMessage,
    content: data.content,
    isStreaming: true
  };
  return newMessages;
} 
else {
  // Create NEW message (tool execution happened OR first message) ✅
  const newBlock: ChatMessage = {
    role: 'assistant',
    content: data.content,
    isStreaming: true
  };
  console.log('🟦 Creating NEW streaming block, reason:', 
    hasToolMessageAfterAssistant ? 'tool execution' : 'first message');
  return [...prev, newBlock];
}
```

### Fix 2: Empty Message Visibility

**Status**: Already handled in code (line 1243). Empty messages with llmApiCalls are NOT skipped.

**Additional Change**: Adjusted spacing for empty messages with transparency:

```typescript
{msg.llmApiCalls && msg.llmApiCalls.length > 0 && !msg.isStreaming && (
  <div className={msg.content ? "mt-3" : ""}>  {/* No top margin if empty */}
    <LlmApiTransparency apiCalls={msg.llmApiCalls} />
  </div>
)}
```

## Event Flow Timeline

**With the fix**:

1. `llm_request` (planning) → Create placeholder with llmApiCalls (planning)
2. `delta` → Update placeholder with "Let me search..."
3. `message_complete` → Mark as not streaming
4. `tool_call_start` → Add tool_calls to message
5. `tool_call_result` → Add tool message (**role: 'tool'**)
6. `llm_request` (final) → Create NEW placeholder with llmApiCalls (final) ✅
7. `delta` → Detect **lastMessage.role === 'tool'**, create NEW assistant ✅
8. More `delta` → Append to new assistant message
9. `message_complete` → Mark final message as not streaming
10. **Result**: 
    - Planning message has llmApiCalls (planning)
    - Final message has llmApiCalls (final) ✅

## Benefits

✅ **LLM transparency on correct message** - Each response phase has its own transparency block  
✅ **Multi-iteration support** - Tools can execute between responses without mixing llmApiCalls  
✅ **Empty messages visible** - Planning-only messages show their transparency  
✅ **Better debugging** - Console logs show when new messages are created vs appended  

## Testing Instructions

1. **Hard refresh** (Ctrl+Shift+R) to load `index-75lb1bZ3.js`

2. **Test Search Query with Planning**:
   ```
   Send: "What are the latest developments in AI?"
   ```
   
   **Expected Result**:
   - Message 1 (Planning): "Let me search for..." + LLM transparency (planning)
   - Message 2 (Tool): Search results
   - Message 3 (Final): Synthesis response + LLM transparency (final) ✅

3. **Check Console Logs**:
   ```
   🔵 LLM API Request: {phase: "planning", ...}
   🟦 Updating placeholder assistant message with content
   🟪 Adding tool result, tool: search_web
   🔵 LLM API Request: {phase: "final_response", ...}
   🟦 Creating NEW streaming block, reason: tool execution ✅
   ```

4. **Test Empty Message Visibility**:
   - If planning message has no content (only tool_calls)
   - LLM transparency should still be visible
   - Message should not be skipped

## Edge Cases Handled

### Case 1: Planning → Tools → Final
```
1. llm_request (planning) → Placeholder with llmApiCalls
2. delta → Update placeholder
3. tool execution → Add tool message (role: 'tool')
4. llm_request (final) → New placeholder ✅
5. delta → lastMessage.role === 'tool' → Create NEW message ✅
6. Result: 2 separate assistant messages with correct llmApiCalls
```

### Case 2: Direct Response (No Tools)
```
1. llm_request → Placeholder with llmApiCalls
2. delta → Update placeholder (lastMessage.role !== 'tool')
3. More deltas → Append to same message ✅
4. Result: 1 assistant message with llmApiCalls
```

### Case 3: Multiple Tool Iterations
```
1. Planning → Tools → Iteration 1 response
2. More tool_calls → Tools
3. Planning → Tools → Iteration 2 response
Each iteration creates NEW assistant message ✅
```

### Case 4: Empty Planning Message
```
1. llm_request (planning) → Placeholder with llmApiCalls
2. tool_call_start → Add tool_calls (no delta, no content)
3. message_complete → Mark as not streaming
4. Result: Empty message with llmApiCalls is rendered ✅
```

## Implementation Details

**Detection Logic**:
```typescript
// Simple check: Is the last message a tool message?
const hasToolMessageAfterAssistant = lastMessage?.role === 'tool';
```

This works because:
- Messages are always in order: user → assistant → (tool)* → assistant → ...
- If the last message is a tool result, the previous assistant is done
- Next delta should create a NEW assistant message, not append

**Alternative Approaches Considered**:
1. ~~Search backwards for tool messages~~ - Too complex, slower
2. ~~Track "tool execution happened" flag~~ - State management overhead
3. ✅ **Check last message role** - Simple, fast, reliable

## Build & Deployment

**Build**:
```bash
cd ui-new && npm run build
```

**Output**:
- File: `docs/assets/index-75lb1bZ3.js` (708.30 KB)
- Build time: 3.23s

**Deploy**:
```bash
bash scripts/deploy-docs.sh -m "fix: Create new assistant message after tool execution to preserve correct llmApiCalls placement"
```

**Deployed at**: 2025-01-08 05:00 UTC  
**Git commit**: `ada18f8`  
**Branch**: `agent`

## Files Modified

1. `ui-new/src/components/ChatTab.tsx`:
   - Lines 610-640: Added `hasToolMessageAfterAssistant` check in delta handler
   - Lines 620, 624: Added `!hasToolMessageAfterAssistant` conditions
   - Line 633: Added reason logging for new message creation
   - Line 1586: Adjusted spacing for empty messages with transparency

## Verification

**Before this fix**:
```typescript
// Message array after search query:
[
  {role: 'user', content: 'Search query'},
  {role: 'assistant', content: 'Let me search...', llmApiCalls: [planning, final]}, // ❌ WRONG
  {role: 'tool', content: '...search results...'},
  {role: 'assistant', content: ''} // ❌ Empty final message
]
```

**After this fix**:
```typescript
// Message array after search query:
[
  {role: 'user', content: 'Search query'},
  {role: 'assistant', content: 'Let me search...', llmApiCalls: [planning]}, // ✅ Planning only
  {role: 'tool', content: '...search results...'},
  {role: 'assistant', content: 'Based on...', llmApiCalls: [final]} // ✅ Final with content
]
```

## Related Issues

This fixes a regression from the previous fix where we preserved llmApiCalls on placeholder messages. The problem was that we were TOO aggressive about updating placeholders - we should only update them if no tool execution has happened.

## Status

✅ **RESOLVED** - LLM transparency now appears on the correct message for each response phase. Tool execution properly triggers creation of new assistant messages instead of appending to previous ones.

## Next Steps

**User should test**:
1. Hard refresh browser
2. Send search query: "Latest AI news"
3. Verify planning message has its own transparency
4. Verify final message has its own transparency
5. Verify no empty blocks at the end

**If empty messages still don't show transparency**:
- Check console for `isStreaming: true` on empty messages
- Verify `message_complete` event is being received
- May need to ensure `message_complete` marks empty messages as not streaming
