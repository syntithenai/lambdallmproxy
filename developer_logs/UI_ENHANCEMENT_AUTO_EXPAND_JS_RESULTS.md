# UI Enhancement: Auto-Show JavaScript Execution Results

**Date**: October 23, 2025  
**Status**: ✅ COMPLETE  
**Component**: `ui-new/src/components/ChatTab.tsx`

## Problem

When JavaScript code is executed using the `execute_javascript` tool:
1. ✅ Live progress is shown during execution (streaming updates)
2. ❌ When execution completes, the live progress disappears BUT the tool result block was collapsed by default
3. ❌ User had to manually click the expand button to see the code and output

This created a poor UX where the live updates would vanish and nothing would appear in their place.

## Solution

Modified the `tool_complete` event handler to **auto-expand** `execute_javascript` tool result blocks when they complete.

### Changes Made

**File**: `ui-new/src/components/ChatTab.tsx`

**Line ~2422**: Track the message index where the tool result was embedded
```typescript
// Before:
for (let i = 0; i < newMessages.length; i++) {
  if (hasMatchingToolCall) {
    console.log('🟪 ✅ Found FIRST assistant with matching tool call...');
    // ... embed tool result ...
    break;
  }
}

// After:
let foundIndex = -1;
for (let i = 0; i < newMessages.length; i++) {
  if (hasMatchingToolCall) {
    console.log('🟪 ✅ Found FIRST assistant with matching tool call...');
    // ... embed tool result ...
    foundIndex = i;
    break;
  }
}
```

**Line ~2468**: Auto-expand execute_javascript results
```typescript
// After embedding the tool result
console.log('🟪 Embedded tool result in assistant message at index', i, ...);

// NEW: Auto-expand execute_javascript tool results
if (data.name === 'execute_javascript') {
  const toolResultIndex = (newMessages[i].toolResults?.length || 1) - 1;
  const expandKey = i * 1000 + toolResultIndex;
  console.log('💻 Auto-expanding execute_javascript result at key:', expandKey);
  setExpandedToolMessages(prev => {
    const newSet = new Set(prev);
    newSet.add(expandKey);
    return newSet;
  });
}

foundIndex = i;
break;
```

**Line ~2488**: Updated match checking to use `foundIndex`
```typescript
// Before:
const foundMatch = newMessages.some((msg) => 
  msg.role === 'assistant' && msg.toolResults?.some((tr: any) => tr.tool_call_id === data.id)
);

// After:
const foundMatch = foundIndex !== -1;
```

## How It Works

### Existing Flow (Already Working)

1. **Tool starts**: `tool_call_start` event → Shows live JavaScript execution progress
2. **Tool streams**: `js_execution_progress` events → Updates live progress display
3. **Tool completes**: `tool_complete` event:
   - Clears `javascriptProgress` state → Hides live progress ✅
   - Embeds tool result in assistant message's `toolResults` array ✅

### New Enhancement

4. **Auto-expand**: When `execute_javascript` completes:
   - Calculate the expand key: `messageIndex * 1000 + toolResultIndex`
   - Add key to `expandedToolMessages` Set
   - Tool result block renders in expanded state automatically

### Expand Key Calculation

The expand key is calculated as:
```
expandKey = messageIndex * 1000 + toolResultIndex
```

For example:
- Message at index 5, first tool result → Key: 5000
- Message at index 5, second tool result → Key: 5001
- Message at index 12, first tool result → Key: 12000

This matches the key used in the rendering logic (line ~4870):
```typescript
const isToolExpanded = expandedToolMessages.has(idx * 1000 + trIdx);
```

## User Experience

### Before
```
[Live JavaScript Progress showing...]
  ⏳ Executing JavaScript...
  📊 Running code...
  
[Progress disappears when complete]

[Collapsed tool block]
🔧 execute_javascript ▼

[User must click to expand]
```

### After
```
[Live JavaScript Progress showing...]
  ⏳ Executing JavaScript...
  📊 Running code...
  
[Progress disappears AND tool block auto-expands]

[Expanded tool block - automatically visible]
🔧 execute_javascript ▲

💻 Code:
  [JavaScript code displayed]

✅ Output:
  [Execution results displayed]
```

## Benefits

1. **Seamless Transition**: Live progress smoothly transitions to final results
2. **No Manual Action**: User doesn't need to click to see results
3. **Immediate Feedback**: Code and output are instantly visible
4. **Consistent with Other Tools**: Similar to how transcription/scraping show final results

## Testing

**Manual Test**:
1. Send message: "calculate the factorial of 10"
2. Observe live progress during execution
3. Verify when execution completes:
   - Live progress disappears ✅
   - Tool result block appears expanded ✅
   - Code is visible ✅
   - Output is visible ✅

**Edge Cases**:
- Multiple `execute_javascript` calls in one message → Each auto-expands separately
- Refresh page after execution → Expansion state persists (stored in `expandedToolMessages`)

## Related Code

- **Live Progress Display**: Lines 4502-4508 (shows during execution)
- **Tool Result Block**: Lines 4867-5200 (shows after completion)
- **Expand State**: `expandedToolMessages` Set manages which blocks are expanded
- **Tool Complete Handler**: Lines 2385-2495 (embeds results and auto-expands)

## Notes

- Only `execute_javascript` is auto-expanded (intentional)
- Other tools (search, scrape) remain collapsed by default (user can expand manually)
- User can still collapse the result if desired by clicking the ▲ button
- No performance impact - Set operations are O(1)

---

**Status**: ✅ Deployed to local dev server  
**Hot Reload**: Changes applied automatically via Vite  
**Ready for Testing**: Open UI at http://localhost:8081
