# Tool Calls in Current Cycle Fix

**Date**: October 8, 2025  
**Issue**: Tool calls generated during a request cycle were being filtered out  
**Status**: ✅ Fixed and Deployed

---

## Problem

The tool message filtering optimization was incorrectly filtering messages **within the same request cycle**, preventing tool calls and their results from being passed back to the LLM for generating the final response.

**User Report**: "it seems like tool calls generated during a request cycle are not being passed to the llm"

---

## Root Cause

**File**: `src/endpoints/chat.js`  
**Function**: `filterToolMessagesForCurrentCycle(messages)`

The filter was designed to remove old tool messages from previous user queries to save tokens. However, it was being called **on every iteration** of the tool execution loop, including iterations that contained fresh tool calls and results from the current request cycle.

### Message Flow (Before Fix)

**Iteration 1**:
```javascript
// Client sends:
messages: [
  { role: 'user', content: 'Search for AI news' }
]

// LLM responds with tool calls:
assistantMessage: {
  role: 'assistant',
  content: '',
  tool_calls: [{ id: 'call_1', function: { name: 'search_web', arguments: '...' } }]
}

// Backend executes tools and adds results:
currentMessages: [
  { role: 'user', content: 'Search for AI news' },
  { role: 'assistant', content: '', tool_calls: [...] },
  { role: 'tool', tool_call_id: 'call_1', content: 'Search results...' }
]
```

**Iteration 2** (get final response):
```javascript
// ❌ PROBLEM: Filter is applied to currentMessages
const filteredMessages = filterToolMessagesForCurrentCycle(currentMessages);

// Filter finds last user message (the query)
// Keeps everything before/at user message
// Filters out tool messages AFTER user message

// Result:
filteredMessages: [
  { role: 'user', content: 'Search for AI news' },
  { role: 'assistant', content: '', tool_calls: [...] },
  // ❌ FILTERED OUT: { role: 'tool', tool_call_id: 'call_1', content: 'Search results...' }
]

// LLM receives request WITHOUT tool results!
// Cannot generate proper response based on search results
```

### Why It Happened

The filter logic was:
1. Find the last user message
2. Keep everything before/at that message
3. **Filter out tool messages after it** (assuming they're from previous cycles)

But in the tool execution loop:
- The user message is from the **current** request
- The tool messages after it are also from the **current** request (just executed!)
- The filter incorrectly treated them as "old" messages to be removed

---

## Solution

Modified the filter to distinguish between:
1. **Initial request** (iteration 1): Messages from client, may contain old tool results → **Apply filtering**
2. **Subsequent iterations** (iteration 2+): Messages from current cycle's tool execution → **Keep all messages**

### Implementation

**File**: `src/endpoints/chat.js`

#### 1. Added `isInitialRequest` Parameter

```javascript
/**
 * Filter messages to only include tool outputs from the current query cycle
 * @param {Array} messages - Array of message objects
 * @param {boolean} isInitialRequest - True if this is the first iteration (messages from client)
 * @returns {Array} Filtered messages
 */
function filterToolMessagesForCurrentCycle(messages, isInitialRequest = false) {
    if (!messages || messages.length === 0) return messages;
    
    // On initial request from client, we need to filter old tool messages
    // In subsequent iterations within the same request cycle, keep all messages (they're from current cycle)
    if (!isInitialRequest) {
        // Within the same request cycle - keep all messages
        return messages;
    }
    
    // ... existing filter logic for initial request ...
}
```

#### 2. Updated Call Site

```javascript
// Tool calling loop
while (iterationCount < maxIterations) {
    iterationCount++;
    
    // Build request
    // Filter out tool messages from previous query cycles (token optimization)
    // Only apply filtering on first iteration (initial messages from client)
    // Subsequent iterations contain tool calls/results from current cycle
    const isInitialRequest = (iterationCount === 1);
    const filteredMessages = filterToolMessagesForCurrentCycle(currentMessages, isInitialRequest);
    
    // Clean messages by removing UI-specific properties before sending to LLM
    const cleanMessages = filteredMessages.map(msg => {
        const { isStreaming, ...cleanMsg } = msg;
        return cleanMsg;
    });
    
    // ... send to LLM ...
}
```

---

## Message Flow (After Fix)

**Iteration 1** (initial):
```javascript
// Client sends:
messages: [
  { role: 'user', content: 'What is 2+2?' },
  { role: 'assistant', content: '', tool_calls: [...] },
  { role: 'tool', tool_call_id: 'old_1', content: 'Old result' }, // ← From previous query
  { role: 'assistant', content: 'Previous answer' },
  { role: 'user', content: 'Search for AI news' } // ← NEW query
]

// Apply filter (isInitialRequest = true)
const filteredMessages = filterToolMessagesForCurrentCycle(messages, true);

// Result:
filteredMessages: [
  { role: 'user', content: 'What is 2+2?' },
  { role: 'assistant', content: '', tool_calls: [...] },
  // ✅ FILTERED: { role: 'tool', tool_call_id: 'old_1', content: 'Old result' }
  { role: 'assistant', content: 'Previous answer' }, // ← Summary kept
  { role: 'user', content: 'Search for AI news' }
]

// Send to LLM → LLM decides to call search_web tool
```

**Iteration 2** (tool execution in current cycle):
```javascript
// currentMessages now has fresh tool execution:
currentMessages: [
  { role: 'user', content: 'What is 2+2?' },
  { role: 'assistant', content: '', tool_calls: [...] },
  { role: 'assistant', content: 'Previous answer' },
  { role: 'user', content: 'Search for AI news' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', ... }] }, // ← NEW
  { role: 'tool', tool_call_id: 'call_1', content: 'Search results...' } // ← NEW
]

// Apply filter (isInitialRequest = false)
const filteredMessages = filterToolMessagesForCurrentCycle(currentMessages, false);

// Result: ALL messages kept (no filtering)
filteredMessages: [
  { role: 'user', content: 'What is 2+2?' },
  { role: 'assistant', content: '', tool_calls: [...] },
  { role: 'assistant', content: 'Previous answer' },
  { role: 'user', content: 'Search for AI news' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', ... }] },
  { role: 'tool', tool_call_id: 'call_1', content: 'Search results...' } // ✅ KEPT!
]

// Send to LLM → LLM has tool results and can generate final response
```

---

## Benefits

### 1. Tool Execution Works Correctly

- ✅ Tool calls from current cycle are passed to LLM
- ✅ Tool results are available for LLM to synthesize response
- ✅ Multi-turn tool calling works as designed

### 2. Token Optimization Preserved

- ✅ Old tool messages from previous queries still filtered on iteration 1
- ✅ Current cycle tool messages kept for proper execution
- ✅ Best of both worlds: efficiency + correctness

### 3. Clear Separation of Concerns

- **Iteration 1**: Clean up history from previous HTTP requests
- **Iteration 2+**: Keep all messages (fresh tool execution data)

---

## Testing

### Manual Test

1. **Send a search query**: "Find news about AI"
2. **Observe tool execution**: Should see search_web called
3. **Check final response**: Should include synthesized search results
4. **Verify it works**: Response should reference the search findings

**Expected logs**:
```
🔄 Chat iteration 1/20
🧹 Filtered 0 tool messages from previous cycles (token optimization)
[Tool execution logs...]
🔄 Chat iteration 2/20
[No filtering log - messages from current cycle kept]
```

### Scenario Testing

#### Scenario 1: Simple Tool Call

**Request**:
```json
{
  "messages": [
    { "role": "user", "content": "Search for climate news" }
  ],
  "model": "llama-3.3-70b-versatile",
  "tools": [...]
}
```

**Expected Flow**:
1. Iteration 1: Filter applies (no old messages to filter), LLM calls search_web
2. Iteration 2: No filter, LLM sees tool results, generates final answer
3. ✅ User gets response with search findings

#### Scenario 2: Multi-Turn with Old Tool Messages

**Request**:
```json
{
  "messages": [
    { "role": "user", "content": "Search for AI" },
    { "role": "assistant", "tool_calls": [...] },
    { "role": "tool", "content": "Old search results..." },
    { "role": "assistant", "content": "Here's what I found about AI..." },
    { "role": "user", "content": "Now search for quantum computing" }
  ],
  "model": "llama-3.3-70b-versatile",
  "tools": [...]
}
```

**Expected Flow**:
1. Iteration 1: Filter removes old tool result, keeps assistant summary, LLM calls search_web
2. Iteration 2: No filter, LLM sees NEW tool results, generates final answer
3. ✅ User gets response with quantum computing findings

#### Scenario 3: Multiple Tool Calls in Current Cycle

**Request**: User asks to search AND scrape

**Expected Flow**:
1. Iteration 1: LLM calls search_web
2. Iteration 2: LLM sees search results, calls scrape_url
3. Iteration 3: LLM sees both search AND scrape results, generates final answer
4. ✅ All tool results available for final synthesis

---

## Edge Cases

### Case 1: No Tool Calls

```javascript
// Iteration 1: LLM responds without tools
// Result: Exits loop, returns response
// ✅ Works correctly
```

### Case 2: Max Iterations Reached

```javascript
// Iterations 1-20: LLM keeps calling tools
// Iteration 20: Max reached, exit loop
// ✅ All tool results from iteration 1-20 preserved
```

### Case 3: Tool Execution Error

```javascript
// Iteration 1: LLM calls tool
// Tool execution fails, error message added as tool result
// Iteration 2: LLM sees error, handles gracefully
// ✅ Error message passed to LLM for proper handling
```

---

## Comparison: Before vs After

| Aspect | Before (Broken) | After (Fixed) |
|--------|----------------|---------------|
| **Iteration 1** | Filter applied | Filter applied ✅ |
| **Iteration 2+** | Filter applied ❌ | No filter ✅ |
| **Old tool messages** | Filtered ✅ | Filtered ✅ |
| **Current tool messages** | Filtered ❌ | Kept ✅ |
| **Tool execution** | Broken ❌ | Working ✅ |
| **Token optimization** | Broken (over-filtered) | Working ✅ |

---

## Related Issues

This fix addresses the unintended consequence of the token optimization work:

1. **TOOL_OUTPUT_WINDOWING.md**: Original optimization to filter old tool messages
2. **UI_TOOL_MESSAGE_FILTERING.md**: Client-side filtering (also needs this fix)
3. **This fix**: Ensures filtering only applies to OLD messages, not current cycle

---

## Deployment

**Date**: October 8, 2025 21:55:00 UTC  
**Method**: `make fast`  
**Package**: `llmproxy-20251008-215500.zip` (106K)  
**Status**: ✅ Deployed and Active

### Files Modified

- `src/endpoints/chat.js`
  - Added `isInitialRequest` parameter to `filterToolMessagesForCurrentCycle()`
  - Updated call site to only filter on iteration 1
  - Added comments explaining the logic

### Backward Compatibility

✅ **Fully backward compatible**

- Filter function signature has default parameter
- No breaking changes to API
- Existing behavior preserved where correct
- Bug fix does not affect correct cases

---

## Monitoring

### CloudWatch Logs

**Look for**:
```
🔄 Chat iteration 1/20
🧹 Filtered N tool messages from previous cycles (token optimization)
🔄 Chat iteration 2/20
[Should NOT see filtering log here - messages from current cycle]
```

**Query for issues**:
```
fields @timestamp, @message
| filter @message like /🔄 Chat iteration/
| sort @timestamp asc
```

If you see filtering logs on iteration 2+, something is wrong.

---

## Summary

**Problem**: Tool calls generated during request cycle were being filtered out  
**Root Cause**: Filter applied on every iteration, treating current cycle's messages as "old"  
**Solution**: Only apply filter on iteration 1 (initial messages from client)  
**Result**: Tool execution works correctly while preserving token optimization  
**Status**: ✅ Fixed and deployed

### Key Improvements

- ✅ Tool execution works end-to-end
- ✅ Tool results passed to LLM for synthesis
- ✅ Multi-turn tool calling functional
- ✅ Token optimization still active (for old messages)
- ✅ Clear iteration-based filtering logic
- ✅ Proper comments explaining behavior

The fix ensures that tool windowing optimization only affects historical messages from previous HTTP requests, not messages generated during the current request cycle's tool execution loop.

---

**Last Updated**: October 8, 2025  
**Deployed**: October 8, 2025 21:55:00 UTC  
**Author**: GitHub Copilot
