# Debugging Fixes: LLM Transparency & Message Visibility

**Date**: 2025-01-08 04:32 UTC  
**Status**: ✅ DEPLOYED (with debugging)

## Issues Reported

1. **LLM transparency not showing for basic queries** (no tools)
2. **User messages disappearing** after submit
3. **Web search tool blocks not visible**

## Root Causes Identified

### Issue 1: LLM Transparency Missing

**Problem**: `llm_request` event arrives BEFORE the first `delta` event, so there's no assistant message to attach the API call to.

**Solution**: Create a placeholder assistant message when `llm_request` arrives and no assistant message exists.

**File**: `ui-new/src/components/ChatTab.tsx` (lines 930-974)

**Code**:
```typescript
case 'llm_request':
  setMessages(prev => {
    const newMessages = [...prev];
    let foundAssistant = false;
    
    // Find the last assistant message
    for (let i = newMessages.length - 1; i >= 0; i--) {
      if (newMessages[i].role === 'assistant') {
        // Attach API call to existing assistant message
        newMessages[i] = {
          ...newMessages[i],
          llmApiCalls: [
            ...(newMessages[i].llmApiCalls || []),
            { phase, model, request, timestamp }
          ]
        };
        foundAssistant = true;
        break;
      }
    }
    
    // If no assistant message exists, create placeholder
    if (!foundAssistant) {
      console.log('🔵 No assistant message found, creating placeholder');
      newMessages.push({
        role: 'assistant',
        content: '',
        isStreaming: true,
        llmApiCalls: [{ phase, model, request, timestamp }]
      });
    }
    
    return newMessages;
  });
  break;
```

### Issue 2: Placeholder Messages Being Hidden

**Problem**: Assistant messages with no content were being skipped in rendering (line 1238).

**Solution**: Also check for `llmApiCalls` when deciding whether to skip empty assistant messages.

**File**: `ui-new/src/components/ChatTab.tsx` (line 1238)

**Before**:
```typescript
if (msg.role === 'assistant' && !msg.content && msg.tool_calls && !hasTranscriptionInProgress) {
  return null;
}
```

**After**:
```typescript
if (msg.role === 'assistant' && !msg.content && msg.tool_calls && !hasTranscriptionInProgress && !msg.llmApiCalls) {
  return null;
}
```

Now empty assistant messages with `llmApiCalls` will be rendered.

### Issue 3: User Message Debugging

**Added enhanced logging** to track user message flow:

```typescript
const userMessage: ChatMessage = { role: 'user', content: textToSend };
console.log('🔵 Adding user message:', userMessage.content.substring(0, 50));
setMessages(prev => {
  console.log('🔵 Current messages count before adding user:', prev.length);
  const newMessages = [...prev, userMessage];
  console.log('🔵 Messages after adding user:', newMessages.length, 'User message at index:', newMessages.length - 1);
  return newMessages;
});
```

**This will help diagnose**:
- Is the user message actually being added?
- At what index is it being added?
- Is it being removed later?

## Event Flow Timeline

**Typical Flow**:
1. User submits query → `userMessage` added to messages array
2. Backend starts processing → `llm_request` event emitted
3. **BEFORE THIS FIX**: No assistant message exists yet, so API call is lost
4. **AFTER THIS FIX**: Placeholder assistant message created with API call
5. First `delta` arrives → Updates existing assistant message with content
6. More `delta` events → Content accumulates
7. `llm_response` → Updates the `llmApiCalls` with response
8. `done` → Message marked as not streaming
9. LLM transparency displays inline with assistant message

## Search Progress

**Search progress IS being rendered** (line 1527-1531):

```typescript
{msg.tool_calls && msg.tool_calls.some((tc: any) => tc.function.name === 'search_web') && (
  <div className="mb-3 space-y-2">
    {Array.from(searchProgress.values()).map((progress, idx) => (
      <SearchProgress key={idx} data={progress} />
    ))}
  </div>
)}
```

**SearchProgress component shows**:
- 🔵 Searching... (3 pulsing dots)
- ✅ Results found
- 🔵 Loading content
- 🔵 [1/3] Fetching result title
- ✅ [1/3] Loaded result (with size/time)
- ❌ [2/3] Failed (with error)

**If not visible**, likely issues:
1. `search_progress` events not arriving from backend
2. `searchProgress` Map getting cleared prematurely
3. Tool calls not being tracked properly

## Testing Instructions

1. **Hard refresh** (Ctrl+Shift+R) to load `index-B1YuRoCI.js`

2. **Test Basic Query (No Tools)**:
   - Send: "What is 2+2?"
   - Open Console (F12)
   - Look for: `🔵 Adding user message`
   - Look for: `🔵 LLM API Request`
   - Look for: `🔵 No assistant message found, creating placeholder`
   - Check if LLM transparency block appears

3. **Test Web Search**:
   - Send: "What's the latest news about AI?"
   - Watch console for `search_progress` events
   - Should see SearchProgress components with:
     - Searching animation
     - Result fetching [1/3], [2/3], [3/3]
     - Loaded confirmations

4. **Check User Message Visibility**:
   - Send any query
   - Console should show: `🔵 Messages after adding user: X`
   - User message should appear in blue bubble on right side
   - Should NOT disappear when assistant response streams in

## Build & Deployment

**Build**:
```bash
cd ui-new && npm run build
```

**Output**:
- File: `docs/assets/index-B1YuRoCI.js` (709.24 KB)
- Build time: 2.18s

**Deploy**:
```bash
bash scripts/deploy-docs.sh -m "fix: Create assistant placeholder for llm_request, add user message logging"
```

**Deployed at**: 2025-01-08 04:32 UTC  
**Git commit**: `87f9cd2`  
**Branch**: `agent`

## Next Steps

After user tests:

1. **If LLM transparency works**: Remove the `console.log` statements
2. **If user messages still disappear**: Check console logs to see where they're lost
3. **If search progress not visible**: Check backend logs for `search_progress` events
4. **JSON tree view**: Still needs implementation (Swag-style expandable tree + full-screen dialog)

## Files Modified

1. `ui-new/src/components/ChatTab.tsx`:
   - Lines 930-974: Create placeholder for llm_request
   - Line 1238: Don't skip messages with llmApiCalls
   - Lines 490-496: Enhanced user message logging

## Status

✅ **DEPLOYED** - Debugging version with:
- Placeholder assistant messages for llm_request
- Enhanced console logging
- Fixed rendering logic for empty messages

**Awaiting user feedback** on:
- Does LLM transparency now show for basic queries?
- Are user messages still disappearing?
- Is search progress visible?
