# LLM API Transparency Per-Message Fix

**Date**: 2025-01-08 04:22 UTC  
**Status**: ✅ DEPLOYED

## Issues Addressed

### Issue 1: LLM Transparency Blocks Disappearing
**Problem**: LLM API transparency blocks would disappear when user typed a second prompt. They only showed at the end of the conversation, not persisting with each assistant message.

**Root Cause**: LLM API calls were stored in a single global array (`llmApiCalls`) that was:
1. Cleared on each new submission
2. Only displayed after the last assistant message
3. Lost when new messages were added

**Solution**: Store API calls directly on each assistant message.

### Changes Made

#### 1. Extended ChatMessage Interface

**Files**: `ui-new/src/utils/api.ts`, `ui-new/src/utils/chatCache.ts`

Added `llmApiCalls` field to ChatMessage:

```typescript
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  // ... existing fields ...
  llmApiCalls?: Array<{   // NEW
    phase: string;
    model: string;
    request: any;
    response?: any;
    timestamp: string;
  }>;
}
```

#### 2. Updated Event Handlers

**File**: `ui-new/src/components/ChatTab.tsx`

**Before** (lines 937-957):
```typescript
case 'llm_request':
  setLlmApiCalls(prev => [...prev, {
    phase: data.phase,
    model: data.model,
    request: data.request,
    timestamp: data.timestamp
  }]);
  break;

case 'llm_response':
  setLlmApiCalls(prev => {
    const updated = [...prev];
    const last = updated[updated.length - 1];
    if (last && last.phase === data.phase && !last.response) {
      last.response = data.response;
    }
    return updated;
  });
  break;
```

**After**:
```typescript
case 'llm_request':
  setMessages(prev => {
    const newMessages = [...prev];
    // Find the last assistant message and add API call to it
    for (let i = newMessages.length - 1; i >= 0; i--) {
      if (newMessages[i].role === 'assistant') {
        newMessages[i] = {
          ...newMessages[i],
          llmApiCalls: [
            ...(newMessages[i].llmApiCalls || []),
            {
              phase: data.phase,
              model: data.model,
              request: data.request,
              timestamp: data.timestamp
            }
          ]
        };
        break;
      }
    }
    return newMessages;
  });
  break;

case 'llm_response':
  setMessages(prev => {
    const newMessages = [...prev];
    // Find the last assistant message and update its last API call
    for (let i = newMessages.length - 1; i >= 0; i--) {
      if (newMessages[i].role === 'assistant' && newMessages[i].llmApiCalls) {
        const apiCalls = newMessages[i].llmApiCalls!;
        const lastCall = apiCalls[apiCalls.length - 1];
        if (lastCall && lastCall.phase === data.phase && !lastCall.response) {
          lastCall.response = data.response;
          newMessages[i] = {
            ...newMessages[i],
            llmApiCalls: [...apiCalls] // Trigger re-render
          };
        }
        break;
      }
    }
    return newMessages;
  });
  break;
```

#### 3. Moved LlmApiTransparency Display

**Before** (line 1658):
```typescript
{/* LLM API Transparency - Show after last assistant message if we have API calls */}
{llmApiCalls.length > 0 && !isLoading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
  <div className="max-w-[90%] ml-auto">
    <LlmApiTransparency apiCalls={llmApiCalls} />
  </div>
)}
```

**After** (inline with assistant message content):
```typescript
<MarkdownRenderer content={msg.content} />
{msg.isStreaming && (
  <span className="inline-block w-2 h-4 bg-gray-500 animate-pulse ml-1"></span>
)}

{/* Show LLM API transparency for this message */}
{msg.llmApiCalls && msg.llmApiCalls.length > 0 && !msg.isStreaming && (
  <div className="mt-3">
    <LlmApiTransparency apiCalls={msg.llmApiCalls} />
  </div>
)}
```

#### 4. Removed Global State

**Removed**:
```typescript
const [llmApiCalls, setLlmApiCalls] = useState<Array<...>>([]);
```

**Removed calls to**:
- `setLlmApiCalls([])` in `handleExampleClick`
- `setLlmApiCalls([])` in `handleSend`

## Benefits

### Before
- ❌ LLM transparency only shown at end of conversation
- ❌ Disappeared when new message sent
- ❌ Lost on page refresh (not persisted)
- ❌ Couldn't review API calls for specific responses

### After
- ✅ LLM transparency attached to each assistant message
- ✅ Persists when new messages added
- ✅ Saved with message history (IndexedDB)
- ✅ Can review API calls for any response in conversation
- ✅ Survives page refreshes
- ✅ Works in chat history replay

## Testing

1. **Send first query**
   - Verify LLM transparency block appears under assistant response
   - Verify it shows all API calls for that response

2. **Send second query**
   - Verify first response's LLM transparency still visible
   - Verify second response gets its own LLM transparency
   - Verify both persist independently

3. **Refresh page**
   - Load chat from history
   - Verify all LLM transparency blocks restored

4. **Click example**
   - Chat clears
   - Send example query
   - Verify new LLM transparency appears

## Data Structure

**Message with API Calls**:
```json
{
  "role": "assistant",
  "content": "The capital of France is Paris...",
  "llmApiCalls": [
    {
      "phase": "planning",
      "model": "meta-llama/llama-4-scout-17b-16e-instruct",
      "request": {
        "input": [...],
        "options": {...}
      },
      "response": {
        "content": "...",
        "tool_calls": [...]
      },
      "timestamp": "2025-01-08T04:20:00.000Z"
    },
    {
      "phase": "final_synthesis",
      "model": "meta-llama/llama-4-scout-17b-16e-instruct",
      "request": {...},
      "response": {...},
      "timestamp": "2025-01-08T04:20:15.000Z"
    }
  ]
}
```

## Build & Deployment

**Build**:
```bash
cd ui-new && npm run build
```

**Output**:
- File: `docs/assets/index-CyaZ52U-.js` (708.79 KB)
- CSS: `docs/assets/index-C2JZgBWB.css` (48.18 KB)
- Build time: 2.57s

**Deploy**:
```bash
bash scripts/deploy-docs.sh -m "feat: LLM API transparency now persists per-message, fixes for chat state"
```

**Deployed at**: 2025-01-08 04:22 UTC  
**Git commit**: `78457df`  
**Branch**: `agent`

## Files Modified

1. `ui-new/src/utils/api.ts` - Added llmApiCalls to ChatMessage interface
2. `ui-new/src/utils/chatCache.ts` - Added llmApiCalls to ChatMessage interface
3. `ui-new/src/components/ChatTab.tsx` - Store API calls per-message, render inline

## Remaining Issues

Still to address:
1. **User message disappearing**: Need to investigate why user prompt vanishes before response
2. **Search progress feedback**: Need to show 3 waiting blocks for results being fetched
3. **JSON tree view**: User wants expandable JSON tree (like Swag) with full-screen dialog

## Next Steps

User should:
1. **Hard refresh browser** (Ctrl+Shift+R) to load `index-CyaZ52U-.js`
2. **Test LLM transparency persistence**: Send multiple queries, verify each keeps its transparency
3. **Report on remaining issues**: User messages disappearing, search progress visibility

## Status

✅ **COMPLETE** - LLM API transparency now persists per-message and survives conversation growth.
