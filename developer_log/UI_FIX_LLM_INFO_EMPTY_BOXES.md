# UI Fix - LLM Info Button and Empty Grey Boxes - October 9, 2025

## Summary

Fixed two UI issues reported by user:
1. LLM Info button not showing inside tool calls blocks
2. Extra empty grey boxes appearing in chat

## Root Causes

### Issue 1: Missing Info Button
**Problem**: The Info button only appeared when `msg.content` existed:
```typescript
{msg.role === 'assistant' && msg.content && (
  // Buttons including Info button
```

**Impact**: Assistant messages with `llmApiCalls` but no content (like tool planning phases) didn't show the Info button, hiding LLM transparency data.

### Issue 2: Empty Grey Boxes
**Problem**: Empty assistant messages were being rendered:
```typescript
<MarkdownRenderer content={msg.content || ''} />
```

**Impact**: Messages with no content but with `llmApiCalls` showed as empty grey boxes, creating visual clutter.

## Solution

**File**: `ui-new/src/components/ChatTab.tsx` (lines 1698-1711)

### Change 1: Only Render Content When It Exists
```typescript
// BEFORE
<MarkdownRenderer content={msg.content || ''} />

// AFTER
{msg.content && <MarkdownRenderer content={msg.content} />}
```

### Change 2: Show Buttons When Content OR llmApiCalls Exist
```typescript
// BEFORE
{msg.role === 'assistant' && msg.content && (

// AFTER  
{msg.role === 'assistant' && (msg.content || msg.llmApiCalls) && (
```

## Expected Behavior After Fix

✅ **Info button appears** on assistant messages even without content, as long as llmApiCalls exists
✅ **No empty grey boxes** - messages without content don't render empty markdown
✅ **LLM transparency works** - token counts visible for tool planning phases
✅ **Cleaner UI** - no visual clutter from empty message boxes

## Deployment

**Frontend**: 
- Built: ui-new → docs/
- Asset: index-Dc15lwk8.js (722.97 KB)
- Commit: 6d988f1
- Pushed to: origin/agent
- Status: ✅ Deployed successfully

**Backend**:
- Previously deployed: llmproxy-20251009-114537.zip
- Status: ✅ Active (strips UI properties)

## Testing Checklist

User should verify:
- [ ] LLM Info button appears on messages with llmApiCalls
- [ ] Token counts show in Info button label
- [ ] No empty grey boxes in chat
- [ ] Info button works for tool planning phases
- [ ] Regular assistant messages with content still work
- [ ] Tool messages display correctly

## Related Issues

This fix addresses **Phase 37** investigation:
- User reported: "i am not seeing the llm info blocks at all any more"
- User reported: "i still see empty grey boxes"
- Root cause: Conditional rendering logic was too restrictive

## Files Modified

1. `ui-new/src/components/ChatTab.tsx` - Fixed button visibility and content rendering
2. `docs/assets/index-Dc15lwk8.js` - Generated build artifact

## Implementation Notes

The fix ensures:
1. **Buttons visible**: When either content or llmApiCalls exist
2. **Content conditional**: Only renders when non-empty
3. **Info button available**: For all phases (planning, tool_iteration, final_response)
4. **Clean rendering**: No empty boxes cluttering the UI

This maintains the LLM transparency feature while improving the user experience.
