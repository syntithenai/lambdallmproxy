# Chat Message Display and Reset Improvements

**Date**: 2025-10-05  
**Status**: ✅ Complete  
**Build**: 247.62 kB bundle (index-PXGTYtI7.js)

## Overview

Implemented two major improvements to the chat interface:
1. **Tool Message Display**: Show tool execution results in chat with expandable details
2. **Smart Reset Buttons**: Improved reset functionality with confirmation and message restoration

## Implementation Details

### 1. Tool Message Display

**File Modified**: `ui-new/src/components/ChatTab.tsx`

**New Feature**: Tool messages (role: 'tool') are now displayed in the chat alongside user and assistant messages.

**Visual Design**:
```tsx
// Purple background for tool messages
className="bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700"
```

**Collapsed State** (Default):
```
┌─────────────────────────────┐
│ 🔧 search_web    ▼ Expand   │
└─────────────────────────────┘
```

**Expanded State** (Click to expand):
```
┌─────────────────────────────────────────┐
│ 🔧 search_web              ▲ Collapse   │
├─────────────────────────────────────────┤
│ Call ID:                                │
│ call_abc123xyz...                       │
│                                         │
│ Result:                                 │
│ ┌─────────────────────────────────────┐│
│ │ {                                   ││
│ │   "query": "AI news",               ││
│ │   "results": [...]                  ││
│ │ }                                   ││
│ └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

**Implementation**:
```tsx
{msg.role === 'tool' && (
  <div>
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="text-xs font-semibold text-purple-700 dark:text-purple-300">
        🔧 {msg.name || 'Tool Result'}
      </div>
      <button
        onClick={() => {
          const newExpanded = new Set(expandedToolMessages);
          if (isExpanded) {
            newExpanded.delete(idx);
          } else {
            newExpanded.add(idx);
          }
          setExpandedToolMessages(newExpanded);
        }}
        className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
      >
        {isExpanded ? '▲ Collapse' : '▼ Expand'}
      </button>
    </div>
    {isExpanded && (
      <div className="text-xs space-y-2">
        {msg.tool_call_id && (
          <div>
            <span className="font-semibold">Call ID:</span>
            <div className="font-mono bg-purple-50 p-1 rounded mt-1 break-all">
              {msg.tool_call_id}
            </div>
          </div>
        )}
        <div>
          <span className="font-semibold">Result:</span>
          <div className="bg-purple-50 p-2 rounded mt-1 max-h-96 overflow-y-auto">
            <pre className="whitespace-pre-wrap text-xs">
              {msg.content}
            </pre>
          </div>
        </div>
      </div>
    )}
  </div>
)}
```

**Features**:
- ✅ **Collapsed by default**: Shows only tool name and expand button
- ✅ **Expandable**: Click to see full details (Call ID + Result)
- ✅ **Purple theme**: Distinct color coding for tool messages
- ✅ **Scrollable results**: Max height of 96 (24rem) with scroll
- ✅ **Formatted output**: Uses `<pre>` tag to preserve formatting
- ✅ **Dark mode**: Proper contrast in both light and dark themes

**Message Structure**:
```typescript
{
  role: 'tool',
  content: '{"query": "AI news", "results": [...]}',
  tool_call_id: 'call_abc123xyz',
  name: 'search_web'
}
```

### 2. Smart Reset Buttons

**File Modified**: `ui-new/src/components/ChatTab.tsx`

**Previous Behavior**:
- ❌ Reset button appeared on ALL messages (user + assistant + tool)
- ❌ Clicking kept the message in chat
- ❌ No confirmation dialog
- ❌ Just sliced the messages array

**New Behavior**:
- ✅ Reset button ONLY appears on user messages
- ✅ Clicking restores message content to input textarea
- ✅ Confirmation dialog before action
- ✅ Clears all messages after the selected one
- ✅ Clears tool status and streaming content

**Implementation**:
```tsx
{/* Reset button - only for user messages */}
{msg.role === 'user' && (
  <button
    onClick={() => {
      if (window.confirm('Reset chat to this message? This will clear all messages after this point and restore this message to the input field.')) {
        // Restore message content to input
        setInput(msg.content);
        // Clear all messages from this point onward
        setMessages(messages.slice(0, idx));
        // Clear tool status and streaming
        setToolStatus([]);
        setStreamingContent('');
      }
    }}
    className="btn-secondary text-xs px-2 py-1 self-start opacity-50 hover:opacity-100 transition-opacity"
    title="Reset chat to this message"
  >
    🔄
  </button>
)}
```

**User Flow**:
1. User sees 🔄 button next to their own messages only
2. Hover shows tooltip: "Reset chat to this message"
3. Click button → Confirmation dialog appears:
   ```
   Reset chat to this message? 
   This will clear all messages after this point 
   and restore this message to the input field.
   
   [Cancel] [OK]
   ```
4. If OK:
   - Message content → copied to input textarea
   - All messages after this → deleted
   - Tool status → cleared
   - Streaming content → cleared
5. If Cancel:
   - No action taken

**Use Cases**:
- **Try different approach**: Want to ask the same question differently
- **Fix typo**: Had a typo in the original message
- **Branch conversation**: Want to explore different path
- **Recover from error**: Tool call failed, want to retry
- **Simplify context**: Remove unnecessary conversation history

### 3. Message Type Indicators

**Color Coding**:
- **User messages**: Blue background (`bg-blue-500`)
- **Assistant messages**: Gray background (`bg-gray-200 dark:bg-gray-700`)
- **Tool messages**: Purple background (`bg-purple-100 dark:bg-purple-900/30`)

**Position**:
- **User messages**: Right-aligned (`justify-end`)
- **Assistant messages**: Left-aligned (`justify-start`)
- **Tool messages**: Left-aligned (`justify-start`)

**Visual Hierarchy**:
```
[User Question]                          🔄
                [Assistant Response]
                [🔧 Tool Result ▼]
                [Assistant Final Answer]
[Follow-up Question]                     🔄
                [Assistant Response]
```

## Build Results

**Command**: `npm run build` (from ui-new/)  
**Output Directory**: `docs/`  
**Bundle Size**: 247.62 kB (gzip: 75.00 kB)  
**Build Time**: 1.19s  

**Generated Files**:
- `docs/index.html` (0.58 kB)
- `docs/assets/index-DNZIj4Y7.css` (31.26 kB)
- `docs/assets/index-PXGTYtI7.js` (247.62 kB)
- `docs/assets/streaming-DpY1-JdV.js` (1.16 kB)

## Testing Guide

### Test 1: Tool Message Display
1. Navigate to Chat tab
2. Enable Web Search checkbox
3. Ask: "What's the latest news about AI?"
4. Wait for tool execution
5. **Expected**:
   - Purple box appears with "🔧 search_web ▼ Expand"
   - Click "▼ Expand" → shows Call ID and full result JSON
   - Click "▲ Collapse" → returns to compact view
6. **Verify**:
   - Tool message is clearly visible
   - Result is properly formatted (JSON or text)
   - Scrollbar appears if result is long
   - Dark mode works correctly

### Test 2: Reset Button (User Messages Only)
1. Send 3 messages in chat
2. **Expected**:
   - 🔄 button appears ONLY next to user messages (blue boxes)
   - No button on assistant messages (gray boxes)
   - No button on tool messages (purple boxes)
3. Hover over 🔄 button
4. **Expected**: Tooltip shows "Reset chat to this message"

### Test 3: Reset Functionality
1. Create a conversation:
   - User: "Hello"
   - Assistant: "Hi there!"
   - User: "What is AI?"
   - Assistant: "AI stands for..."
2. Click 🔄 on the first user message ("Hello")
3. **Expected**: Confirmation dialog appears
4. Click "Cancel" → Nothing happens
5. Click 🔄 again → Click "OK"
6. **Expected**:
   - Input textarea now contains "Hello"
   - All messages after "Hello" are deleted
   - Only the first user message remains (which is now removed)
   - Chat is empty or shows just system messages

### Test 4: Reset with Tool Messages
1. Ask question that triggers web search
2. Wait for complete response (including tool execution)
3. Send follow-up question
4. Click 🔄 on the first question
5. Click "OK" in confirmation
6. **Expected**:
   - Original question restored to input
   - All subsequent messages deleted (including tool results and follow-up)
   - Tool status cleared

### Test 5: Expandable Tool Details
1. Trigger a tool call with web search
2. Tool message appears collapsed
3. Click "▼ Expand"
4. **Verify**:
   - Call ID displays correctly
   - Full result shows in scrollable box
   - JSON/text is properly formatted
5. Click "▲ Collapse"
6. **Verify**: Returns to compact one-line view

## Edge Cases Handled

### Tool Message Edge Cases
- ✅ **No tool_call_id**: Shows only result, no Call ID section
- ✅ **No name**: Displays as "Tool Result" instead
- ✅ **Long results**: Scrollable container with max-height
- ✅ **JSON content**: Preserves formatting with `<pre>` tag
- ✅ **Multiple tool calls**: Each gets own message with expand/collapse

### Reset Button Edge Cases
- ✅ **First message**: Clicking resets entire chat
- ✅ **Last message**: Clicking just restores to input (no messages to delete)
- ✅ **During streaming**: Button not affected by streaming state
- ✅ **After error**: Can reset to recover from errors
- ✅ **Empty message**: Won't happen (send button disabled for empty input)

## Related Files

- `ui-new/src/components/ChatTab.tsx` (606 lines, modified)
- `docs/assets/index-PXGTYtI7.js` (generated bundle)

## User Benefits

### Tool Message Display
1. **Transparency**: Users see exactly what tools were called
2. **Debugging**: Can inspect tool parameters and results
3. **Learning**: Understand how LLM uses tools
4. **Verification**: Confirm search results, scraped data, etc.
5. **Compact**: Doesn't clutter chat when collapsed

### Smart Reset Buttons
1. **Easy retry**: Quickly retry with modified input
2. **Branch exploration**: Explore different conversation paths
3. **Context cleanup**: Remove unnecessary history
4. **Error recovery**: Reset after failed tool calls
5. **Safety**: Confirmation prevents accidental resets

## API Compatibility

No API changes required. The chat endpoint already returns tool messages in the response stream. The UI now properly displays them.

**Message Flow**:
```
User: "Search for AI news"
  ↓
Assistant: [with tool_calls]
  ↓
Tool: search_web → {results...}
  ↓
Assistant: "Based on the search results..."
```

**All message types now visible in UI!**

## Next Steps

Recommended follow-up improvements:
1. Add "Copy Result" button for tool messages
2. Add syntax highlighting for JSON tool results
3. Add "Re-run Tool" button to execute tool again
4. Add tool execution time/duration display
5. Add filtering to show/hide tool messages
6. Add export chat feature with tool messages
7. Add keyboard shortcut for reset (e.g., Ctrl+R on message)
8. Add "Reset to here without restoring input" option

---

**Summary**: Successfully implemented tool message display with expandable details and improved reset button functionality. Users can now see all tool executions in the chat, inspect their results, and easily reset conversations with confirmation dialogs. The reset feature properly restores messages to the input field for editing and retrying.

**Local Testing**: http://localhost:8081
