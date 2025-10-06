# Content Collation Between Tool Calls - October 6, 2025

## Summary

Modified the chat streaming handler to collate all content deltas between tool calls into a single content block, while keeping tool call information visible as separate blocks.

## Problem

Previously, the streaming implementation was creating multiple content blocks during tool execution cycles:
1. Initial content before first tool call → Block 1
2. Tool execution → Tool block
3. Content after tool → Block 2 (new block)
4. Another tool execution → Tool block
5. Final content → Block 3 (new block)

This resulted in fragmented content display with multiple small blocks.

## Solution

Modified the `delta` event handler to intelligently collate content:
- All deltas stream into the **last assistant message block** if it's still streaming
- Only create a **new block** when starting fresh (after tool results)
- Tool execution **finalizes the current block** and prepares for the next one

## Implementation

### Before
```typescript
case 'delta':
  if (data.content) {
    setStreamingContent(prev => prev + data.content);
    if (currentStreamingBlockIndex !== null) {
      // Update existing block
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages[currentStreamingBlockIndex]) {
          newMessages[currentStreamingBlockIndex] = {
            ...newMessages[currentStreamingBlockIndex],
            content: (newMessages[currentStreamingBlockIndex].content || '') + data.content
          };
        }
        return newMessages;
      });
    } else {
      // Always create new block
      setMessages(prev => {
        const newBlock: ChatMessage = {
          role: 'assistant',
          content: data.content,
          isStreaming: true
        };
        setCurrentStreamingBlockIndex(prev.length);
        return [...prev, newBlock];
      });
    }
  }
  break;
```

### After
```typescript
case 'delta':
  // Streaming text chunk - collate all deltas into single block until tool call
  if (data.content) {
    setStreamingContent(prev => prev + data.content);
    
    // Update or create the current streaming block
    setMessages(prev => {
      const lastMessageIndex = prev.length - 1;
      const lastMessage = prev[lastMessageIndex];
      
      // If last message is a streaming assistant message, append to it
      if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
        const newMessages = [...prev];
        newMessages[lastMessageIndex] = {
          ...lastMessage,
          content: (lastMessage.content || '') + data.content
        };
        setCurrentStreamingBlockIndex(lastMessageIndex);
        return newMessages;
      } else {
        // Create a new streaming block (only after tools or first message)
        const newBlock: ChatMessage = {
          role: 'assistant',
          content: data.content,
          isStreaming: true
        };
        setCurrentStreamingBlockIndex(prev.length);
        return [...prev, newBlock];
      }
    });
  }
  break;
```

## Key Changes

1. **Check Last Message Type**: Before creating a new block, check if the last message is a streaming assistant message
2. **Append to Existing**: If last message is streaming assistant, append content to it
3. **Create Only When Needed**: Only create new block after tool results or when starting fresh
4. **Track Index Dynamically**: Update `currentStreamingBlockIndex` based on where content is going

## Flow Example

### Scenario: User asks "Search for Python tutorials and summarize the first result"

**Stream Events:**
1. `delta`: "Let me search for Python tutorials..." → **Block 1** (create new)
2. `delta`: " and find the best ones for you." → **Block 1** (append)
3. `tool_call_start`: web_search → Tool indicator
4. `tool_call_result`: [search results] → Tool block
5. `delta`: "Based on the search results, here are..." → **Block 2** (new after tool)
6. `delta`: " the top Python tutorials:" → **Block 2** (append)
7. `delta`: "\n\n1. Tutorial A - Great for beginners..." → **Block 2** (append)
8. `tool_call_start`: scrape_url → Tool indicator
9. `tool_call_result`: [scraped content] → Tool block
10. `delta`: "After reviewing the tutorial content..." → **Block 3** (new after tool)
11. `delta`: ", I can confirm it covers..." → **Block 3** (append)
12. `message_complete`: Finalize **Block 3**

**Result:**
```
User: Search for Python tutorials and summarize the first result

Assistant Block 1:
Let me search for Python tutorials and find the best ones for you.

🔧 Tool: web_search
Query: "Python tutorials"
Results: [collapsed/expandable]

Assistant Block 2:
Based on the search results, here are the top Python tutorials:

1. Tutorial A - Great for beginners...

🔧 Tool: scrape_url
URL: tutorial-a.com
Content: [collapsed/expandable]

Assistant Block 3:
After reviewing the tutorial content, I can confirm it covers...
```

## Benefits

### 1. Cleaner Content Flow
- Content between tool calls is shown as cohesive blocks
- Easier to read and understand the LLM's reasoning
- Natural narrative flow maintained

### 2. Clear Tool Boundaries
- Tool executions create natural breakpoints
- Easy to see when LLM decided to use tools
- Tool results remain visible and accessible

### 3. Better UX for Multi-Tool Queries
- Complex queries with multiple tool calls are easier to follow
- Shows the LLM's thought process clearly
- Users can see: thinking → tool → thinking → tool → conclusion

### 4. Reduced Visual Clutter
- Fewer separate blocks
- Less scrolling required
- More focused content presentation

## Edge Cases Handled

### 1. No Tool Calls
**Flow:** delta → delta → delta → message_complete
**Result:** Single content block (as expected)

### 2. Tool Call with No Initial Content
**Flow:** tool_call_start → tool_call_result → delta → delta
**Result:** Tool block, then single content block

### 3. Multiple Sequential Tools
**Flow:** delta → tool1 → delta → tool2 → delta
**Result:** Block 1 → Tool 1 → Block 2 → Tool 2 → Block 3

### 4. Tool Call with Empty Result
**Flow:** delta → tool_call_start → tool_call_result (empty) → delta
**Result:** Still creates separate blocks around tool

### 5. Stream Interrupted by Error
**Flow:** delta → delta → error
**Result:** Current block finalized, error shown

## Visual Comparison

### Before (Fragmented)
```
┌──────────────────────────┐
│ Let me search            │ ← Block 1
└──────────────────────────┘
┌──────────────────────────┐
│ for that                 │ ← Block 2 (unnecessary!)
└──────────────────────────┘
┌──────────────────────────┐
│ 🔧 Search Tool           │ ← Tool
└──────────────────────────┘
┌──────────────────────────┐
│ Here                     │ ← Block 3
└──────────────────────────┘
┌──────────────────────────┐
│ are the results          │ ← Block 4 (unnecessary!)
└──────────────────────────┘
```

### After (Collated)
```
┌──────────────────────────┐
│ Let me search for that   │ ← Block 1 (collated)
└──────────────────────────┘
┌──────────────────────────┐
│ 🔧 Search Tool           │ ← Tool
└──────────────────────────┘
┌──────────────────────────┐
│ Here are the results     │ ← Block 2 (collated)
└──────────────────────────┘
```

## Technical Details

### State Management

**Key State Variables:**
- `messages` - Array of all chat messages
- `streamingContent` - Temporary buffer for current streaming content
- `currentStreamingBlockIndex` - Index of the message being streamed to
- `isStreaming` - Flag on message to indicate active streaming

**State Flow:**
1. Delta arrives → Check last message
2. If last is streaming assistant → Append
3. If last is tool/user → Create new
4. Update `currentStreamingBlockIndex`
5. Continue until tool or complete

### Message Structure

```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_calls?: Array<ToolCall>;
  tool_call_id?: string;
  name?: string;
  isStreaming?: boolean;  // ← Key flag for collation
}
```

The `isStreaming` flag indicates:
- `true`: This block is actively receiving deltas (append here)
- `false` or `undefined`: Block is finalized (don't append)

## Build Results

```
../docs/assets/index-C_phdKnQ.js  256.76 kB │ gzip: 77.57 kB
✓ built in 1.04s
```

**Changes from previous:**
- Bundle hash: `Dzs4F1vl` → `C_phdKnQ`
- Size: 256.55 kB → 256.76 kB (+0.21 kB)
- Build time: 1.01s → 1.04s

## Testing Scenarios

### Test 1: Single Tool Call
**Query:** "What are the latest AI news?"
**Expected Flow:**
1. Content: "Let me search..." → Block 1
2. Tool: web_search
3. Content: "Here are the latest..." → Block 2
**Verify:** 2 content blocks + 1 tool block

### Test 2: Multiple Tool Calls
**Query:** "Search for React docs and show me the getting started section"
**Expected Flow:**
1. Content: "I'll search..." → Block 1
2. Tool: web_search
3. Content: "Found the docs, now scraping..." → Block 2
4. Tool: scrape_url
5. Content: "Here's the getting started section..." → Block 3
**Verify:** 3 content blocks + 2 tool blocks

### Test 3: No Tool Calls
**Query:** "What is 2+2?"
**Expected Flow:**
1. Content: "2+2 equals 4" → Block 1
**Verify:** 1 content block, no tools

### Test 4: Tool with No Initial Content
**Query:** "Search weather"
**Expected Flow:**
1. Tool: web_search (no content before)
2. Content: "The weather is..." → Block 1
**Verify:** 1 content block after tool

### Test 5: Rapid Deltas
**Query:** Complex query causing many rapid deltas
**Expected Flow:**
1. delta, delta, delta, delta... → All into Block 1
**Verify:** All deltas collated into single block

## Performance Considerations

### Reduced Re-renders
- **Before**: Each delta could create new block → More array operations
- **After**: Each delta appends to last block → Less array overhead

### Memory Efficiency
- Fewer message objects in memory
- Better garbage collection (fewer intermediate objects)

### Rendering Performance
- Fewer DOM elements to render
- Less virtual DOM diffing
- Smoother scrolling experience

## Related Changes

This change complements previous improvements:
- **Persistent content blocks** (previous change)
- **Visible tool calls** (previous change)
- **Content collation** (this change)

Together, these create a clear, readable conversation flow showing:
1. What the LLM is thinking
2. When it decides to use tools
3. What the tools return
4. How the LLM responds to tool results

## Accessibility

### Screen Readers
- Fewer blocks = less navigation required
- Clearer structure for AT (assistive technology)
- Tool boundaries still announced clearly

### Keyboard Navigation
- Fewer tab stops between content
- More logical reading order
- Tool results still individually accessible

## Future Enhancements

1. **Collapse/Expand Blocks**
   - Allow users to collapse intermediate blocks
   - Show summary of collapsed content
   - Useful for long conversations

2. **Block Annotations**
   - Show which tools led to which content
   - Visual connections between tool → response
   - Helpful for understanding LLM reasoning

3. **Block Editing**
   - Edit content in specific block
   - Regenerate from that point
   - Branch conversations at any block

4. **Block Export**
   - Export individual blocks
   - Copy formatted content
   - Share specific reasoning chains

---

**Version:** Frontend build `C_phdKnQ`
**Date:** October 6, 2025
**Status:** ✅ Ready for testing
