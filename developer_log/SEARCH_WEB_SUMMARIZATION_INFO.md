# Search Web Summarization Info Button Fix

**Date**: October 9, 2025  
**Issue**: The Info button on search_web tool results should show LLM calls used for summarization, or indicate when no summarization was used.

## Problem Statement

The search_web tool can optionally use LLM calls to summarize search results (page summaries and synthesis). The Info button on the tool result block should:
1. Show token usage when summarization LLM calls were made
2. Display "No summarization" when no LLM calls were used
3. Make it clear whether the tool used additional LLM resources

Previously, the Info button logic was copying llmApiCalls from the assistant message that called the tool, but search_web's summarization calls happen INSIDE the tool execution, not before.

## Root Cause

1. **Backend**: The search_web tool emits `llm_request` and `llm_response` events during tool execution (for page_summary, synthesis_summary, description_summary phases)
2. **Frontend**: The code was looking for llmApiCalls on the assistant message that triggered the tool, missing the tool-internal LLM calls
3. **Data Flow**: Tool-internal LLM calls were being attached to the assistant message, not the tool result message

## Solution

### Backend Changes (src/tools.js)

Updated three places where `llm_response` events are emitted to include proper usage data:

#### 1. Page Summary Response (lines ~682-697)
```javascript
// Emit LLM response event with usage data
if (context?.writeEvent) {
  context.writeEvent('llm_response', {
    phase: 'page_summary',
    tool: 'search_web',
    page_index: i,
    url: result.url,
    model: summaryModel,
    summary: pageSummaryText,
    response: {
      content: pageSummaryText,
      usage: pageResp?.rawResponse?.usage || {}
    },
    timestamp: new Date().toISOString()
  });
}
```

#### 2. Synthesis Summary Response (lines ~767-779)
```javascript
// Emit LLM response event with usage data
if (context?.writeEvent) {
  context.writeEvent('llm_response', {
    phase: 'synthesis_summary',
    tool: 'search_web',
    model: synthesisModel,
    response: {
      content: synthesisResp?.text || synthesisResp?.finalText || '',
      usage: synthesisResp?.rawResponse?.usage || {}
    },
    timestamp: new Date().toISOString()
  });
}
```

#### 3. Description Summary Response (lines ~820-833)
```javascript
// Emit LLM response event with usage data
if (context?.writeEvent) {
  context.writeEvent('llm_response', {
    phase: 'description_summary',
    tool: 'search_web',
    model,
    response: {
      content: resp?.text || resp?.finalText || '',
      usage: resp?.rawResponse?.usage || {}
    },
    timestamp: new Date().toISOString()
  });
}
```

**Key Addition**: Each `llm_response` event now includes `response.usage` with token counts from `rawResponse.usage`.

### Frontend Changes (ui-new/src/components/ChatTab.tsx)

#### 1. Tool Result Message Creation (lines ~802-842)
```typescript
case 'tool_call_result':
  setMessages(prev => {
    let llmApiCalls: any[] = [];
    
    // Find the assistant message with llmApiCalls for this tool
    for (let i = prev.length - 1; i >= 0; i--) {
      if (prev[i].role === 'assistant' && prev[i].llmApiCalls && prev[i].tool_calls) {
        const hasMatchingToolCall = prev[i].tool_calls?.some((tc: any) => tc.id === data.id);
        if (hasMatchingToolCall) {
          // Extract ONLY tool-internal LLM calls (summarization, etc.)
          const toolInternalCalls = prev[i].llmApiCalls?.filter((call: any) => 
            call.phase && call.tool === 'search_web' && 
            (call.phase === 'page_summary' || call.phase === 'synthesis_summary' || call.phase === 'description_summary')
          ) || [];
          
          if (toolInternalCalls.length > 0) {
            llmApiCalls = toolInternalCalls;
          }
          break;
        }
      }
    }
    
    const toolMessage: ChatMessage = {
      role: 'tool',
      content: data.content,
      tool_call_id: data.id,
      name: data.name,
      ...(llmApiCalls.length > 0 && { llmApiCalls })
    };
    
    return [...prev, toolMessage];
  });
```

**Key Changes**:
- Filters llmApiCalls to only include tool-internal phases (page_summary, synthesis_summary, description_summary)
- Only attaches llmApiCalls if they exist (empty array means no summarization)
- Filters by `call.tool === 'search_web'` to ensure these are search-specific

#### 2. Info Button Rendering (lines ~1640-1710)
```typescript
{msg.content && (
  <div className="flex gap-2 mt-2 pt-2 border-t border-purple-200 dark:border-purple-700">
    <button onClick={() => handleCaptureContent(msg.content, 'tool', msg.name)}>
      Grab
    </button>
    
    {/* Info button - always show for search_web to indicate summarization status */}
    {msg.name === 'search_web' && (
      <button
        onClick={() => msg.llmApiCalls && msg.llmApiCalls.length > 0 ? setShowLlmInfo(idx) : null}
        className={`text-xs flex items-center gap-1 ${
          msg.llmApiCalls && msg.llmApiCalls.length > 0
            ? 'text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-100 cursor-pointer'
            : 'text-gray-500 dark:text-gray-500 cursor-default'
        }`}
        title={msg.llmApiCalls && msg.llmApiCalls.length > 0 ? "View LLM summarization info" : "No LLM summarization used"}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {msg.llmApiCalls && msg.llmApiCalls.length > 0 ? (
          <>
            Info
            {(() => {
              const tokensIn = msg.llmApiCalls.reduce((sum: number, call: any) => 
                sum + (call.response?.usage?.prompt_tokens || 0), 0);
              const tokensOut = msg.llmApiCalls.reduce((sum: number, call: any) => 
                sum + (call.response?.usage?.completion_tokens || 0), 0);
              if (tokensIn > 0 || tokensOut > 0) {
                return (
                  <span className="ml-1 text-[10px] opacity-75">
                    ({tokensIn > 0 ? `${tokensIn}↓` : ''}{tokensIn > 0 && tokensOut > 0 ? '/' : ''}{tokensOut > 0 ? `${tokensOut}↑` : ''})
                  </span>
                );
              }
              return null;
            })()}
          </>
        ) : (
          <span className="text-[10px]">No summarization</span>
        )}
      </button>
    )}
    
    {/* Info button for other tools - only show if llmApiCalls present */}
    {msg.name !== 'search_web' && msg.llmApiCalls && msg.llmApiCalls.length > 0 && (
      <button onClick={() => setShowLlmInfo(idx)}>
        Info {/* with token counts */}
      </button>
    )}
  </div>
)}
```

**Key Changes**:
- **Always show button for search_web**: Even when no LLM calls exist
- **Visual state differentiation**: 
  - Purple/clickable when llmApiCalls exist → shows token counts
  - Gray/disabled when no llmApiCalls → shows "No summarization"
- **Token calculation**: Sums `prompt_tokens` and `completion_tokens` from all summarization calls
- **Other tools**: Only show Info button if llmApiCalls exist

## User Experience

### With Summarization
```
🔧 search_web
├─ Search results...
└─ [Grab] [Info (1,234↓/567↑)]  ← Clickable, shows token totals
```

### Without Summarization
```
🔧 search_web
├─ Search results...
└─ [Grab] [No summarization]  ← Grayed out, indicates no LLM use
```

## Technical Details

### Data Flow
1. **Tool Execution**: search_web executes, may call LLM for summaries
2. **Events Emitted**: `llm_request` + `llm_response` for each summary call
3. **Assistant Collection**: Events attached to assistant message with `tool: 'search_web'` and phase markers
4. **Tool Result**: When `tool_call_result` arrives, filter and extract tool-internal LLM calls
5. **Tool Message**: Create tool message with only relevant llmApiCalls
6. **Button Rendering**: Info button checks for llmApiCalls and calculates totals

### LLM Call Phases
- `page_summary`: Individual page summarization (up to 5 pages)
- `synthesis_summary`: Combining page summaries into comprehensive answer
- `description_summary`: Summarizing from search result descriptions only (when content not loaded)

### Token Calculation
```typescript
const tokensIn = msg.llmApiCalls.reduce((sum: number, call: any) => 
  sum + (call.response?.usage?.prompt_tokens || 0), 0);
const tokensOut = msg.llmApiCalls.reduce((sum: number, call: any) => 
  sum + (call.response?.usage?.completion_tokens || 0), 0);
```

## Deployment

### Backend
```bash
make deploy-lambda-fast
```
- Package: `llmproxy-20251009-122141.zip` (109 KB)
- Status: ✅ Deployed successfully
- Endpoint: https://nrw7pperj jdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/

### Frontend
```bash
make deploy-ui
```
- Commit: `5e4499d`
- Bundle: `index-CvM_ibfg.js` (725.55 KB)
- Status: ✅ Deployed to GitHub Pages

## Testing Checklist

- [ ] Search with summarization enabled shows Info button with token counts
- [ ] Search without summarization shows "No summarization" in gray
- [ ] Clicking Info button (when enabled) shows LLM transparency dialog
- [ ] Token counts accurately reflect prompt_tokens + completion_tokens
- [ ] Multiple summary calls (page + synthesis) are aggregated correctly
- [ ] Other tools (not search_web) only show Info when llmApiCalls exist
- [ ] No console errors related to llmApiCalls or undefined properties

## Benefits

1. **Transparency**: Users can see when and how much LLM was used for summarization
2. **Cost Awareness**: Token counts help users understand resource consumption
3. **Clear Indication**: "No summarization" makes it clear when search used no extra LLM calls
4. **Consistency**: All tool-internal LLM calls are properly tracked and displayed
5. **Debugging**: Developers can verify summarization behavior and token usage

## Related Files

- `src/tools.js` - Backend search_web implementation with LLM summarization
- `ui-new/src/components/ChatTab.tsx` - Frontend message rendering and event handling
- `src/llm_tools_adapter.js` - LLM API wrapper that captures usage data
- `.github/copilot-instructions.md` - AI assistant deployment instructions

## Notes

- The backend already had the infrastructure (`tool` field in events) in place
- The frontend needed to distinguish between main chat LLM calls and tool-internal calls
- Usage data comes from `rawResponse.usage` which includes `prompt_tokens`, `completion_tokens`, and `total_tokens`
- The fix maintains backward compatibility - tools without llmApiCalls work as before
- The "No summarization" message is search_web-specific; other tools just hide the button
