# Preserve Intermediate Content and Tool Calls - October 6, 2025

## Summary

Modified the chat UI to keep all intermediate content blocks and tool call information visible throughout the streaming process, rather than hiding them when the final message arrives. Each tool call triggers creation of a new content block, and all blocks remain visible to show the full workflow.

---

## Problem Statement

### Previous Behavior (Hidden Intermediate Content)
1. User sends query requiring tools
2. LLM starts streaming response → Shown in temporary block
3. LLM calls tool → Tool status shown temporarily
4. Tool executes → Result stored but hidden
5. LLM continues streaming → New temporary block
6. Final message arrives → **All intermediate content disappears**
7. Only final response visible

**Issues:**
- ❌ User can't see the tool execution workflow
- ❌ Lost context about what data was searched/scraped
- ❌ Can't review intermediate reasoning
- ❌ Debugging tool calls is difficult
- ❌ No transparency in multi-step processes

### New Behavior (Preserve All Content)
1. User sends query requiring tools
2. LLM starts streaming → **Block 1 created and visible**
3. LLM calls tool → **Block 1 finalized with tool_calls**
4. Tool executes → **Tool message added and stays visible**
5. LLM continues streaming → **Block 2 created**
6. Final message arrives → **Block 2 finalized, all blocks remain**
7. **Full workflow visible**: Block 1 → Tool → Block 2

**Benefits:**
- ✅ Complete transparency of tool execution
- ✅ User sees what data was retrieved
- ✅ Can review LLM's intermediate reasoning
- ✅ Easy to debug tool call issues
- ✅ Better understanding of multi-step processes

---

## Implementation Details

### Changes Made

#### 1. Added Streaming Block Tracking

**New State:**
```typescript
const [currentStreamingBlockIndex, setCurrentStreamingBlockIndex] = useState<number | null>(null);
```

Tracks which message in the array is currently being streamed to.

#### 2. Enhanced ChatMessage Type

**File:** `ui-new/src/utils/api.ts`

```typescript
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<...>;
  tool_call_id?: string;
  name?: string;
  isStreaming?: boolean;  // NEW: Flag for active streaming
}
```

#### 3. Modified Delta Handler (Streaming Chunks)

**Before:**
```typescript
case 'delta':
  setStreamingContent(prev => prev + data.content);
  break;
```

**After:**
```typescript
case 'delta':
  if (data.content) {
    setStreamingContent(prev => prev + data.content);
    
    if (currentStreamingBlockIndex !== null) {
      // Update existing block
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[currentStreamingBlockIndex].content += data.content;
        return newMessages;
      });
    } else {
      // Create new block
      setMessages(prev => {
        const newBlock = {
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

**Key Changes:**
- Streaming content is immediately added to messages array
- Creates new assistant block on first delta
- Updates existing block on subsequent deltas
- Marks block as `isStreaming: true` for visual indicator

#### 4. Modified Tool Call Result Handler

**Before:**
```typescript
case 'tool_call_result':
  // Add tool message
  setMessages(prev => [...prev, toolMessage]);
  break;
```

**After:**
```typescript
case 'tool_call_result':
  // Add tool message
  setMessages(prev => [...prev, toolMessage]);
  
  // Prepare for next streaming block
  setCurrentStreamingBlockIndex(null);
  setStreamingContent('');
  break;
```

**Key Changes:**
- Resets streaming state after tool execution
- Next delta will create a new block
- Tool message stays visible

#### 5. Modified Message Complete Handler

**Before:**
```typescript
case 'message_complete':
  const finalContent = streamingContent || data.content || '';
  const assistantMessage = {
    role: 'assistant',
    content: finalContent,
    tool_calls: data.tool_calls
  };
  setMessages(prev => [...prev, assistantMessage]);
  setStreamingContent('');
  break;
```

**After:**
```typescript
case 'message_complete':
  if (currentStreamingBlockIndex !== null) {
    // Finalize existing streaming block
    setMessages(prev => {
      const newMessages = [...prev];
      newMessages[currentStreamingBlockIndex] = {
        ...newMessages[currentStreamingBlockIndex],
        content: data.content || newMessages[currentStreamingBlockIndex].content || '',
        tool_calls: data.tool_calls,
        isStreaming: false
      };
      return newMessages;
    });
  } else if (data.content || data.tool_calls) {
    // No streaming block, add new message
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: data.content || '',
      tool_calls: data.tool_calls
    }]);
  }
  
  // Reset for next iteration
  setStreamingContent('');
  setCurrentStreamingBlockIndex(null);
  break;
```

**Key Changes:**
- Finalizes existing block if present
- Updates content from final message (ensures match)
- Marks `isStreaming: false`
- Falls back to creating new message if needed

#### 6. Updated Visual Display

**Before:**
```tsx
{/* Temporary streaming content */}
{isLoading && streamingContent && (
  <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-3">
    {streamingContent}
    <span className="animate-pulse">|</span>
  </div>
)}
```

**After:**
```tsx
{/* Streaming indicator */}
{isLoading && currentStreamingBlockIndex !== null && (
  <div className="text-xs text-gray-500">
    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
    streaming...
  </div>
)}

{/* In message rendering */}
<div className="whitespace-pre-wrap">
  {msg.content}
  {msg.isStreaming && (
    <span className="inline-block w-2 h-4 bg-gray-500 animate-pulse ml-1"></span>
  )}
</div>
```

**Key Changes:**
- Removed temporary streaming content div
- Content now always in messages array
- Added inline streaming cursor to active block
- Small status indicator shows streaming is active

---

## Example Workflow

### User Query: "Search for Python tutorials and analyze the first result"

**Step 1: Initial LLM Response**
```
┌─────────────────────────────────────┐
│ 🤖 Assistant (streaming...)         │
│                                     │
│ I'll search for Python tutorials    │
│ for you.█                           │
└─────────────────────────────────────┘
```

**Step 2: LLM Makes Tool Call**
```
┌─────────────────────────────────────┐
│ 🤖 Assistant                        │
│                                     │
│ I'll search for Python tutorials    │
│ for you.                            │
│                                     │
│ 🔧 search_web                       │
└─────────────────────────────────────┘
```

**Step 3: Tool Executes**
```
┌─────────────────────────────────────┐
│ 🤖 Assistant                        │
│ I'll search for Python tutorials... │
│ 🔧 search_web                       │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ 🔧 search_web Result               │
│                                     │
│ ▼ Expand                           │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ 🔧 Tool Execution                  │
│ ⚡ search_web running...           │
└─────────────────────────────────────┘
```

**Step 4: Tool Complete, New LLM Response**
```
┌─────────────────────────────────────┐
│ 🤖 Assistant                        │
│ I'll search for Python tutorials... │
│ 🔧 search_web                       │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ 🔧 search_web Result               │
│ Arguments: query="Python tutorials" │
│ Result: [10 search results]         │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ 🤖 Assistant (streaming...)         │
│                                     │
│ Based on the search results, I     │
│ found several excellent Python█    │
└─────────────────────────────────────┘
```

**Step 5: Final Message**
```
┌─────────────────────────────────────┐
│ 🤖 Assistant                        │
│ I'll search for Python tutorials... │
│ 🔧 search_web                       │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ 🔧 search_web Result               │
│ Arguments: query="Python tutorials" │
│ Result: [10 search results]         │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ 🤖 Assistant                        │
│                                     │
│ Based on the search results, I     │
│ found several excellent Python      │
│ tutorials. The top result is...    │
│                                     │
│ [Full analysis of first result]    │
└─────────────────────────────────────┘
```

**All blocks remain visible!**

---

## Visual Indicators

### Streaming States

1. **Active Streaming**
   - Pulsing cursor after text: `█`
   - Small status indicator below: `● streaming...`

2. **Completed Block**
   - No cursor
   - Content fully visible
   - Can have tool_calls section

3. **Tool Messages**
   - Purple badge: `🔧 Tool Name`
   - Collapsed by default
   - Expand to see arguments and results

4. **Tool Execution Status**
   - Amber box with status icons:
     - ⏳ Starting
     - ⚡ Executing (pulsing)
     - ✓ Complete
     - ✗ Error

---

## Message Flow Diagram

```
User Query
    ↓
[Assistant Block 1] ← Delta events create/update
    ↓ (isStreaming: true)
Message Complete
    ↓ (isStreaming: false, tool_calls added)
[Tool Message 1]
    ↓
[Assistant Block 2] ← New block created
    ↓ (isStreaming: true)
Message Complete
    ↓ (isStreaming: false)
Complete Event
    ↓
All blocks visible ✅
```

---

## Edge Cases Handled

### 1. Multiple Tool Calls in Sequence
**Behavior:**
- Block 1 → Tool 1 → Tool 2 → Tool 3 → Block 2
- All tool messages visible
- Each tool creates opportunity for new block

### 2. Tool Call Without Previous Content
**Behavior:**
- LLM directly calls tool without explanation
- Block created with tool_calls but no content
- Tool result added
- Next block has full response

### 3. No Tool Calls
**Behavior:**
- Single streaming block
- Content accumulates normally
- Finalized on message_complete
- Same as before, but now in messages array immediately

### 4. Empty Content with Tool Calls
**Behavior:**
- Block created even if content is empty
- tool_calls still attached
- Tool messages follow
- Next block has response

### 5. Rapid Tool Iterations
**Behavior:**
- Each iteration creates new blocks
- User sees full workflow
- Can hit max iterations (5)
- All blocks remain visible for debugging

---

## Build Results

```
../docs/assets/index-CY-DJYMP.js  256.70 kB │ gzip: 77.51 kB
✓ built in 1.17s
```

**Changes:**
- Bundle: `Dzs4F1vl` → `CY-DJYMP`
- Size: 256.55 kB → 256.70 kB (+0.15 kB for new logic)
- CSS: 31.78 kB → 31.87 kB (+0.09 kB for new indicators)
- Build time: 1.01s → 1.17s

---

## Testing Checklist

### Basic Streaming
- [ ] Send simple query (no tools)
- [ ] Verify content streams correctly
- [ ] Verify cursor animates during streaming
- [ ] Verify cursor disappears when complete

### Single Tool Call
- [ ] Send query requiring web search
- [ ] Verify Block 1 created with initial response
- [ ] Verify Block 1 shows tool_calls section
- [ ] Verify tool message appears and stays visible
- [ ] Verify Block 2 created for final response
- [ ] Verify Block 1 and tool message remain visible

### Multiple Tool Calls
- [ ] Send complex query ("search X, then analyze Y")
- [ ] Verify multiple blocks created
- [ ] Verify all tool messages visible
- [ ] Verify blocks stay in correct order
- [ ] Verify final response matches last message_complete

### Tool Execution Status
- [ ] Verify amber status box appears during execution
- [ ] Verify status icons change (⏳ → ⚡ → ✓)
- [ ] Verify status box disappears after completion

### Edge Cases
- [ ] Send query with no tool calls → Single block
- [ ] Send query with immediate tool call → Block created
- [ ] Test max iterations (5 tool calls) → All visible
- [ ] Test error in tool → Error message visible

### Visual Polish
- [ ] Check dark mode for all new elements
- [ ] Verify streaming cursor is visible
- [ ] Verify status indicator is subtle
- [ ] Check responsive layout with multiple blocks
- [ ] Verify scroll works with many blocks

---

## Benefits

### For Users
1. **Transparency**: See exactly what the LLM is doing
2. **Trust**: Verify data sources and tool results
3. **Learning**: Understand multi-step reasoning
4. **Debugging**: Identify where things went wrong

### For Developers
1. **Debugging**: Easier to diagnose tool issues
2. **Monitoring**: See full workflow in production
3. **Optimization**: Identify slow tools
4. **Testing**: Verify tool execution order

### For Complex Queries
1. **Research Tasks**: See all searches and analyses
2. **Data Processing**: Track transformations
3. **Multi-step**: Follow reasoning chain
4. **Verification**: Check intermediate results

---

## Potential Issues & Mitigations

### Issue 1: Too Many Blocks
**Problem**: Queries with many tool calls create many blocks
**Mitigation**: 
- Already limited to 5 iterations
- Tool messages are collapsible
- Scroll works naturally

### Issue 2: Duplicate Content
**Problem**: Final message might duplicate streaming content
**Mitigation**:
- Final message updates existing block
- Uses `data.content` if different from streamed content
- Ensures blocks match final state

### Issue 3: Streaming Performance
**Problem**: Many rapid updates to messages array
**Mitigation**:
- Updates are batched by React
- Only one block updated at a time
- Minimal re-renders

### Issue 4: Mobile Layout
**Problem**: Many blocks on small screens
**Mitigation**:
- Tool messages collapse by default
- Blocks are responsive (max-w-[80%])
- Scroll is natural on mobile

---

## Future Enhancements

### 1. Block Collapsing
- Collapse completed blocks
- Show summary line
- Expand on click

### 2. Block Navigation
- Jump to specific block
- Highlight current streaming block
- Scroll to active block

### 3. Export Workflow
- Copy all blocks
- Export as markdown
- Share full workflow

### 4. Timeline View
- Visual timeline of execution
- Tool call graph
- Performance metrics

### 5. Block Diffing
- Compare intermediate vs final
- Show what changed
- Highlight differences

---

## Related Files

- `ui-new/src/components/ChatTab.tsx` - Main chat component
- `ui-new/src/utils/api.ts` - ChatMessage interface
- `src/endpoints/chat.js` - Backend streaming handler

---

## Migration Notes

### For Existing Users
- Behavior change is automatic on refresh
- No localStorage clearing needed
- Previous conversations work the same
- New conversations show new behavior

### For Development
- Test with various tool combinations
- Monitor message array size
- Check performance with many blocks
- Verify memory usage

---

**Status:** ✅ Build successful, ready for testing!
**Version:** Frontend build `CY-DJYMP`
**Date:** October 6, 2025
