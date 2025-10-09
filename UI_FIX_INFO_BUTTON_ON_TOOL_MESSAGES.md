# UI Fix - Info Button on Tool Messages - October 9, 2025

## Problem Statement

User reported that the Info button was showing in empty grey blocks (assistant messages) instead of in the tool result blocks where it should be. The grey blocks should not be shown at all.

### Expected Behavior
- User prompt → Tool result block (with Info button) → Final response
- No empty grey boxes between messages
- LLM transparency info attached to tool messages, not empty assistant placeholders

### Actual Behavior
- User prompt → Empty grey box (with Info button) → Tool result block (no Info button) → Final response
- Info button on wrong message
- Empty grey boxes creating visual clutter

## Root Cause Analysis

The issue was in the architecture of how llmApiCalls were being attached:

1. **llmApiCalls attached to assistant messages** - When a tool was about to be executed, llmApiCalls were attached to the assistant message (which had tool_calls but no content)
2. **Empty assistants rendered** - These empty assistant messages were being rendered as grey boxes
3. **Tool messages didn't get llmApiCalls** - The tool result messages didn't receive the llmApiCalls data
4. **Info button on wrong message** - Button appeared on empty assistant instead of tool result

## Solution

### Change 1: Don't Show Empty Assistant Messages
**File**: `ui-new/src/components/ChatTab.tsx` (lines 1360-1368)

```typescript
// BEFORE: Showed empty assistants if they had llmApiCalls
if (msg.role === 'assistant' && !msg.content && !hasTranscriptionInProgress && !msg.llmApiCalls && !msg.tool_calls) {
  return null;
}

// AFTER: Don't show empty assistants (llmApiCalls go to tool messages instead)
if (msg.role === 'assistant' && !msg.content && !hasTranscriptionInProgress && !msg.tool_calls && !msg.isStreaming) {
  return null;
}
```

**Impact**: Empty grey boxes no longer appear

### Change 2: Copy llmApiCalls to Tool Messages
**File**: `ui-new/src/components/ChatTab.tsx` (lines 802-838)

```typescript
// NEW: Find the assistant message with llmApiCalls and copy to tool message
setMessages(prev => {
  // Find the assistant message with llmApiCalls for this tool
  let llmApiCalls: any[] | undefined;
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].role === 'assistant' && prev[i].llmApiCalls && prev[i].tool_calls) {
      const hasMatchingToolCall = prev[i].tool_calls?.some((tc: any) => tc.id === data.id);
      if (hasMatchingToolCall) {
        llmApiCalls = prev[i].llmApiCalls;
        break;
      }
    }
  }
  
  const toolMessage: ChatMessage = {
    role: 'tool',
    content: data.content,
    tool_call_id: data.id,
    name: data.name,
    ...(llmApiCalls && { llmApiCalls })  // Copy llmApiCalls to tool message
  };
  
  return [...prev, toolMessage];
});
```

**Impact**: Tool messages now have LLM transparency data

### Change 3: Add Info Button to Tool Messages
**File**: `ui-new/src/components/ChatTab.tsx` (lines 1638-1680)

```typescript
// BEFORE: Only Grab button
{msg.content && (
  <button>Grab</button>
)}

// AFTER: Both Grab and Info buttons
{(msg.content || msg.llmApiCalls) && (
  <div className="flex gap-2">
    {msg.content && <button>Grab</button>}
    {msg.llmApiCalls && msg.llmApiCalls.length > 0 && (
      <button onClick={() => setShowLlmInfo(idx)}>
        Info (tokens...)
      </button>
    )}
  </div>
)}
```

**Impact**: Info button appears on tool messages with token counts

## Message Flow

### Before Fix
```
User: "search for cats"
  ↓
Assistant (empty) [llmApiCalls] ← Info button here (grey box)
  ↓
Tool: search_web ← Should be here but wasn't
  ↓
Assistant: "Here's what I found..."
```

### After Fix
```
User: "search for cats"
  ↓
Tool: search_web [llmApiCalls] ← Info button here (correct!)
  ↓
Assistant: "Here's what I found..."
```

## Benefits

✅ **No empty grey boxes** - Clean, uncluttered chat interface
✅ **Info button in right place** - On tool messages where users expect it
✅ **Better UX** - Transparency data attached to the relevant operation
✅ **Consistent pattern** - Tool messages show what the LLM called to execute them
✅ **Token visibility** - Users can see token usage per tool execution

## Deployment

**Frontend**:
- Built: ui-new → docs/
- Asset: index-CsbgfW-G.js (724.13 KB)
- Commit: 0ef9fb6
- Pushed to: origin/agent
- Status: ✅ Deployed successfully

**Backend**:
- No changes needed
- Previously deployed: llmproxy-20251009-114537.zip
- Status: ✅ Active

## Testing Checklist

User should verify:
- [ ] No empty grey boxes appear
- [ ] Info button shows on tool result blocks (purple boxes)
- [ ] Token counts appear in Info button label
- [ ] Clicking Info button shows LLM transparency data
- [ ] Message flow is: User → Tool Result (with Info) → Assistant Response
- [ ] Works for all tool types (search_web, scrape_web_content, etc.)

## Technical Notes

**Key Architecture Decision**: 
Instead of trying to show Info buttons on empty assistant messages, we now attach llmApiCalls to the tool messages that result from those calls. This makes semantic sense because the LLM transparency data is specifically about "which LLM call decided to use this tool."

**Message Roles**:
- `assistant` - LLM's text responses and tool call decisions
- `tool` - Results from tool executions
- Now tool messages can carry llmApiCalls showing which LLM call triggered them

**Backward Compatibility**:
The LlmInfoDialog component works with both assistant and tool messages since it just checks for the llmApiCalls property.

## Files Modified

1. `ui-new/src/components/ChatTab.tsx` - Three key changes:
   - Skip empty assistants (don't render grey boxes)
   - Copy llmApiCalls to tool messages
   - Add Info button to tool message rendering
2. `docs/assets/index-CsbgfW-G.js` - Generated build artifact

This completes the fix for Phase 37 - LLM Info is now visible in the correct location!
