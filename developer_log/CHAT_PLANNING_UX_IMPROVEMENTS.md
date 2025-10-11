# Chat and Planning UX Improvements

**Date**: 2025-10-05  
**Status**: ✅ Complete  
**Build**: 246.09 kB bundle (index-BzgXp7gP.js)

## Overview

Implemented multiple UX improvements to the Chat and Planning tabs:
1. Dynamic send button label based on input state
2. Planning API model parameter support
3. Default system prompt with clear placeholder
4. Tool-aware system prompts based on checkbox selections
5. Auto-resizing text inputs (1-10 rows based on content)

## Implementation Details

### 1. Dynamic Send Button Label

**File Modified**: `ui-new/src/components/ChatTab.tsx`

**Change**: Button now shows different text based on state:
```tsx
{isLoading ? '⏹ Stop' : (!input.trim() ? '✏️ Type a message' : '📤 Send')}
```

**States**:
- **Loading**: "⏹ Stop" (red stop icon)
- **Empty Input**: "✏️ Type a message" (disabled, with pen icon)
- **Has Input**: "📤 Send" (enabled, with send icon)

**Benefits**:
- ✅ Clear visual feedback about input state
- ✅ Users immediately know why button is disabled
- ✅ More intuitive than just having a grayed-out button

### 2. Planning API Model Parameter

**Files Modified**:
- `ui-new/src/utils/api.ts`
- `ui-new/src/components/PlanningTab.tsx`

**API Changes**:
```typescript
export const generatePlan = async (
  query: string,
  token: string,
  model: string | undefined,  // NEW: Model parameter
  onEvent: (event: string, data: any) => void,
  onComplete?: () => void,
  onError?: (error: Error) => void
): Promise<void> => {
  const requestBody: any = { query };
  
  // Only add model if provided (server will use default if not)
  if (model) {
    requestBody.model = model;
  }
  
  // ... rest of implementation
}
```

**PlanningTab Usage**:
```typescript
const [settings] = useLocalStorage('app_settings', {
  provider: 'groq',
  reasoningModel: 'llama-3.3-70b-specdec'
});

await generatePlan(
  query,
  token,
  settings.reasoningModel,  // Pass reasoning model from settings
  (event, data) => { /* ... */ }
);
```

**Behavior**:
- If `reasoningModel` is set in settings → sends it to API
- If not set → server chooses default based on provider
- Allows per-provider reasoning model configuration
- Falls back gracefully to server defaults

### 3. Default System Prompt

**File Modified**: `ui-new/src/components/ChatTab.tsx`

**Placeholder Text**:
```tsx
<textarea
  value={systemPrompt}
  onChange={(e) => setSystemPrompt(e.target.value)}
  placeholder="You are a helpful assistant"  // Clear default shown
  className="input-field w-full resize-none"
  rows={calculateRows(systemPrompt, 1, 10)}
/>
```

**Default Usage**:
```typescript
// If user doesn't provide system prompt, use default
let finalSystemPrompt = systemPrompt.trim() || 'You are a helpful assistant';
```

**Benefits**:
- ✅ Users see the default value without typing
- ✅ Clear what happens if field is left empty
- ✅ Standard OpenAI-compatible default prompt
- ✅ Can still be overridden by typing in the field

### 4. Tool-Aware System Prompts

**File Modified**: `ui-new/src/components/ChatTab.tsx`

**Implementation**:
```typescript
// Build system prompt with default and tool suggestions
let finalSystemPrompt = systemPrompt.trim() || 'You are a helpful assistant';

// Add tool suggestions if tools are enabled
if (tools.length > 0) {
  const toolNames = tools.map(t => t.function.name).join(', ');
  finalSystemPrompt += `\n\nYou have access to the following tools: ${toolNames}. Use them when appropriate to provide better answers. For web searches, scraping, or code execution, use the relevant tools.`;
}

const messagesWithSystem = [
  { role: 'system' as const, content: finalSystemPrompt },
  ...newMessages
];
```

**Tool Checkbox Mapping**:
- ☑️ **Web Search** → Adds `search_web` to tools array
- ☑️ **Execute JS** → Adds `execute_javascript` to tools array
- ☑️ **Scrape URL** → Adds `scrape_web_content` to tools array
- ☐ **MCP** → UI present, backend integration pending

**Example System Prompts**:

**No tools enabled:**
```
You are a helpful assistant
```

**Web search enabled:**
```
You are a helpful assistant

You have access to the following tools: search_web. Use them when appropriate to provide better answers. For web searches, scraping, or code execution, use the relevant tools.
```

**All tools enabled:**
```
You are a helpful assistant

You have access to the following tools: search_web, execute_javascript, scrape_web_content. Use them when appropriate to provide better answers. For web searches, scraping, or code execution, use the relevant tools.
```

**Benefits**:
- ✅ LLM knows which tools are available
- ✅ Encourages tool usage when appropriate
- ✅ Dynamically updates based on checkbox selections
- ✅ User can still add custom instructions in system prompt field

### 5. Auto-Resizing Text Inputs

**File Modified**: `ui-new/src/components/ChatTab.tsx`

**Helper Function**:
```typescript
const calculateRows = (text: string, minRows = 1, maxRows = 10): number => {
  if (!text || text.trim() === '') return minRows;
  const lines = text.split('\n').length;
  return Math.min(Math.max(lines, minRows), maxRows);
};
```

**Applied to Both Inputs**:

**System Prompt**:
```tsx
<textarea
  value={systemPrompt}
  onChange={(e) => setSystemPrompt(e.target.value)}
  placeholder="You are a helpful assistant"
  className="input-field w-full resize-none"
  rows={calculateRows(systemPrompt, 1, 10)}  // Auto-resize 1-10 rows
/>
```

**User Message Input**:
```tsx
<textarea
  value={input}
  onChange={(e) => setInput(e.target.value)}
  placeholder="Type your message... (Shift+Enter for new line)"
  className="input-field flex-1 resize-none"
  rows={calculateRows(input, 1, 10)}  // Auto-resize 1-10 rows
/>
```

**Behavior**:
- **Empty**: Shows 1 row (minimal height)
- **1-10 lines**: Shows exact number of lines needed
- **10+ lines**: Capped at 10 rows, scrollbar appears
- **Automatic**: Resizes as user types or when planning updates prompts
- **Responsive**: Updates on every keystroke via onChange

**Benefits**:
- ✅ Minimal vertical space when empty
- ✅ Expands to show all content (up to 10 lines)
- ✅ No manual resizing needed
- ✅ Works with planning tab auto-fill
- ✅ Consistent UX between system prompt and message input

## Build Results

**Command**: `npm run build` (from ui-new/)  
**Output Directory**: `docs/`  
**Bundle Size**: 246.09 kB (gzip: 74.69 kB)  
**Build Time**: 1.14s  

**Generated Files**:
- `docs/index.html` (0.58 kB)
- `docs/assets/index-B2x8i5tA.css` (30.34 kB)
- `docs/assets/index-BzgXp7gP.js` (246.09 kB)
- `docs/assets/streaming-DpY1-JdV.js` (1.16 kB)

## Testing Guide

### Test 1: Send Button States
1. Navigate to Chat tab
2. Verify button shows "✏️ Type a message" when empty
3. Type text → button changes to "📤 Send"
4. Clear text → button reverts to "✏️ Type a message"
5. Click send → button changes to "⏹ Stop" during loading

### Test 2: Default System Prompt
1. Navigate to Chat tab
2. Observe system prompt field shows placeholder "You are a helpful assistant"
3. Leave it empty and send a message
4. Verify system message uses default prompt
5. Type custom prompt → verify it overrides default

### Test 3: Tool Checkboxes
1. Enable Web Search checkbox
2. Send a message asking a question
3. Verify tools array includes `search_web`
4. Verify system prompt includes tool suggestion
5. Enable Execute JS → verify tools array updates
6. Disable all → verify no tools in request

### Test 4: Auto-Resize Inputs
1. System prompt field should show 1 row when empty
2. Type multi-line text → field expands up to 10 rows
3. Message input should show 1 row when empty
4. Type multi-line message → field expands
5. Use Planning tab → fields resize with auto-filled content

### Test 5: Planning API Model
1. Go to Settings
2. Set reasoning model (e.g., "llama-3.3-70b-specdec")
3. Navigate to Planning tab
4. Submit a query
5. Check browser console → verify model parameter sent
6. Leave model empty → verify server uses default

## API Compatibility

### Planning Endpoint Request
**Before**:
```json
{
  "query": "Plan a vacation"
}
```

**After**:
```json
{
  "query": "Plan a vacation",
  "model": "llama-3.3-70b-specdec"  // Optional
}
```

### Chat Endpoint Request
**Before**:
```json
{
  "model": "llama-3.3-70b-versatile",
  "messages": [
    {"role": "user", "content": "Hello"}
  ]
}
```

**After**:
```json
{
  "model": "llama-3.3-70b-versatile",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant\n\nYou have access to the following tools: search_web. Use them when appropriate..."
    },
    {"role": "user", "content": "Hello"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search_web",
        "description": "...",
        "parameters": {...}
      }
    }
  ]
}
```

## Related Files

- `ui-new/src/components/ChatTab.tsx` (755 lines, modified)
- `ui-new/src/components/PlanningTab.tsx` (380 lines, modified)
- `ui-new/src/utils/api.ts` (150 lines, modified)
- `docs/assets/index-BzgXp7gP.js` (generated bundle)

## Next Steps

Recommended follow-up improvements:
1. Add MCP server backend integration
2. Add tool usage statistics/tracking
3. Add "quick tool" buttons for common operations
4. Add tool execution history viewer
5. Add configurable max rows for text inputs
6. Add text input keyboard shortcuts (e.g., Ctrl+Enter to send)
7. Add visual indicator when system prompt has tool suggestions added

---

**Summary**: Successfully implemented five UX improvements making the chat more intuitive, responsive, and tool-aware. The send button provides clear feedback, system prompts guide LLM behavior based on available tools, text inputs resize automatically, and the planning API now supports custom model selection.

**Local Testing**: http://localhost:8081
