# Feature: Show LLM Transparency for All Phases

**Date**: 2025-01-08 05:33 UTC  
**Status**: ✅ DEPLOYED

## User Request

"i also want to see llm transparency for the planning phase and any other llm call regardless of whether it returns a text response"

## Problem

After the previous fix, we were hiding empty planning phase messages (messages with tool_calls but no content) to clean up the UI. However, this also hid the LLM transparency information for those planning phases, which the user wants to see for full transparency.

## Solution

### 1. Revert Skip Logic

**Changed** the message skip condition to KEEP messages that have llmApiCalls or tool_calls:

**File**: `ui-new/src/components/ChatTab.tsx` (lines 1279-1283)

**Before**:
```typescript
// Skip empty assistant messages with tool_calls even if they have llmApiCalls
if (msg.role === 'assistant' && !msg.content && msg.tool_calls && !hasTranscriptionInProgress) {
  return null;
}

// Skip empty messages with only llmApiCalls
if (msg.role === 'assistant' && !msg.content && !msg.tool_calls && msg.llmApiCalls && !msg.isStreaming) {
  return null;
}
```

**After**:
```typescript
// Skip assistant messages with no content UNLESS they have:
// - transcription in progress
// - llmApiCalls (want to show ALL LLM transparency)
// - tool_calls (planning/tool selection phases)
if (msg.role === 'assistant' && !msg.content && !hasTranscriptionInProgress && !msg.llmApiCalls && !msg.tool_calls) {
  return null;
}
```

**Effect**: Empty messages with llmApiCalls or tool_calls are now rendered.

### 2. Add Planning Phase Header

**File**: `ui-new/src/components/ChatTab.tsx` (lines 1618-1641)

Added visual headers to explain what empty assistant messages represent:

**Planning & Tool Selection Phase**:
```typescript
{!msg.content && msg.tool_calls && msg.tool_calls.length > 0 && (
  <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
    <div className="flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-200">
      <span>🧠</span>
      <span>Planning & Tool Selection Phase</span>
    </div>
    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
      The AI analyzed your request and decided to use {msg.tool_calls.length} tool{msg.tool_calls.length !== 1 ? 's' : ''} to gather information.
    </p>
  </div>
)}
```

**Internal Processing** (edge case):
```typescript
{!msg.content && !msg.tool_calls && msg.llmApiCalls && msg.llmApiCalls.length > 0 && !msg.isStreaming && (
  <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
      <span>🤔</span>
      <span>Internal Processing</span>
    </div>
    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
      LLM API call made but no visible output produced.
    </p>
  </div>
)}
```

### 3. Conditional Content Rendering

**Changed** to only render MarkdownRenderer if content exists:

```typescript
{/* Message content */}
{msg.content && <MarkdownRenderer content={msg.content} />}
```

### 4. Always Show Transparency

**Removed** the conditional top margin - now always shows transparency if llmApiCalls exist:

```typescript
{msg.llmApiCalls && msg.llmApiCalls.length > 0 && !msg.isStreaming && (
  <div className="mt-3">  {/* Always mt-3, no conditional */}
    <LlmApiTransparency apiCalls={msg.llmApiCalls} />
  </div>
)}
```

## Benefits

✅ **Complete transparency** - See ALL LLM API calls, including planning  
✅ **Clear labeling** - Blue header explains what planning phases are  
✅ **Better understanding** - Users can see how the AI decided to use tools  
✅ **Debug-friendly** - Full visibility into LLM decision-making process  
✅ **Consistent UX** - All phases have transparency, not just final responses  

## Visual Design

### Planning & Tool Selection Phase

**Appearance**:
- 🧠 icon
- Blue background (`bg-blue-50 dark:bg-blue-900/20`)
- Blue border (`border-blue-200 dark:border-blue-800`)
- Explains: "The AI analyzed your request and decided to use X tools"
- Followed by LLM transparency block showing the planning API call

### Internal Processing Phase (Rare)

**Appearance**:
- 🤔 icon
- Gray background (`bg-gray-50 dark:bg-gray-800`)
- Gray border (`border-gray-200 dark:border-gray-700`)
- Explains: "LLM API call made but no visible output produced"
- Followed by LLM transparency block

## Example Flow

**Query**: "What are the latest AI developments?"

**Messages Displayed**:

1. **User Message**: "What are the latest AI developments?"

2. **Planning Phase** (NEW - now visible):
   ```
   ┌─────────────────────────────────────────┐
   │ 🧠 Planning & Tool Selection Phase      │
   │ The AI analyzed your request and        │
   │ decided to use 1 tool to gather         │
   │ information.                            │
   └─────────────────────────────────────────┘
   
   🔍 LLM API Transparency (1 API call)
   [Click to expand]
   - 🧠 Planning
   - Provider: Groq
   - Model: llama-3.3-70b-versatile
   - [Full request body with JsonTree]
   ```

3. **Tool Execution**:
   ```
   ┌─────────────────────────────────────────┐
   │ 🔧 search_web                           │
   │ [Search results displayed]              │
   └─────────────────────────────────────────┘
   ```

4. **Final Response**:
   ```
   Based on the search results, here are the
   latest AI developments:
   ...
   
   🔍 LLM API Transparency (1 API call)
   [Click to expand]
   - ✨ Final Answer
   - Provider: Groq
   - Model: llama-3.3-70b-versatile
   - [Full request body with JsonTree]
   ```

## Testing Instructions

1. **Hard refresh** (Ctrl+Shift+R) to load `index-DF07RVvB.js`

2. **Test with tool-using query**:
   ```
   Send: "What are the latest AI developments?"
   ```
   
   **Expected**:
   - ✅ See blue "Planning & Tool Selection Phase" box
   - ✅ LLM transparency shows planning API call
   - ✅ Tool execution box appears
   - ✅ Final response has its own LLM transparency
   - ✅ Can see BOTH planning and final API calls

3. **Test with simple query**:
   ```
   Send: "What is 2+2?"
   ```
   
   **Expected**:
   - ✅ Direct response (no planning phase)
   - ✅ LLM transparency shows the API call

4. **Expand LLM transparency blocks**:
   - ✅ Click to expand both planning and final
   - ✅ See Provider, Model for each
   - ✅ See full request body in JsonTree
   - ✅ Click "View Full Screen" for detailed inspection

## Edge Cases Handled

### Case 1: Planning Phase
```
- Has: tool_calls, llmApiCalls
- No content
- Shows: Blue planning header + transparency
```

### Case 2: Direct Answer (No Planning)
```
- Has: content, llmApiCalls
- No tool_calls
- Shows: Content + transparency
```

### Case 3: Multi-Iteration
```
- Planning 1 → Tools → Response 1
- Planning 2 → Tools → Response 2
- Each planning phase visible with transparency
```

### Case 4: Empty with llmApiCalls Only (Rare)
```
- Has: llmApiCalls
- No content, no tool_calls
- Shows: Gray "Internal Processing" header + transparency
```

## Implementation Details

**Skip Condition Logic**:
```typescript
// Only skip if message has NOTHING interesting:
// - No content
// - No transcription in progress
// - No llmApiCalls
// - No tool_calls
// = Basically an empty placeholder that shouldn't exist
```

**Header Display Logic**:
```typescript
// Show planning header if:
!msg.content && msg.tool_calls && msg.tool_calls.length > 0

// Show internal processing header if:
!msg.content && !msg.tool_calls && msg.llmApiCalls && !msg.isStreaming
```

## Build & Deployment

**Build**:
```bash
cd ui-new && npm run build
```

**Output**:
- File: `docs/assets/index-DF07RVvB.js` (711.96 KB)
- CSS: `docs/assets/index-CQYEFJGz.css` (48.24 KB)
- Build time: 2.39s

**Deploy**:
```bash
bash scripts/deploy-docs.sh -m "feat: Show LLM transparency for all phases including planning and tool selection"
```

**Deployed at**: 2025-01-08 05:33 UTC  
**Git commit**: `779e6fa`  
**Branch**: `agent`

## Files Modified

1. `ui-new/src/components/ChatTab.tsx`:
   - Lines 1279-1283: Updated skip logic to keep messages with llmApiCalls or tool_calls
   - Lines 1618-1641: Added planning phase and internal processing headers
   - Line 1646: Made content rendering conditional
   - Lines 1651-1655: Removed conditional margin on transparency block

## User Value

**Before**: Users only saw final responses with transparency, planning was hidden

**After**: Users see complete picture:
- How AI analyzed their request
- What tools it decided to use
- Full API transparency for planning phase
- Full API transparency for final response
- Complete decision-making process visible

This provides **educational value** (learn how AI thinks) and **debugging capability** (see exactly what prompts/tools were used at each stage).

## Related Changes

This builds on:
- `a912b3b`: Fixed llmApiCalls attaching to correct message
- `461d10e`: Added JSON tree viewer and provider info
- `b6bd3e0`: Restored chat persistence

This completes the LLM transparency feature by ensuring ALL API calls are visible, not just those that produce visible text.

## Status

✅ **DEPLOYED** - LLM transparency now shows for ALL phases including planning and tool selection. Users can see the complete decision-making process of the AI, including how it analyzes requests and decides which tools to use.
