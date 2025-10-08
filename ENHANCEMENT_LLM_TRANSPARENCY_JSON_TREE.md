# Enhancement: LLM API Transparency with JSON Tree Viewer

**Date**: 2025-01-08 05:22 UTC  
**Status**: ✅ DEPLOYED

## User Request

"add provider and model information to the llm transparency block, show the full body of the request rather than tools and messages and render the json using an expandable tree view."

## Changes Implemented

### 1. Added Provider Information

**Problem**: Only showed model name, not which provider (OpenAI, Groq, Anthropic).

**Solution**: Added `getProviderFromModel()` function that detects provider from model name:

```typescript
const getProviderFromModel = (model: string): string => {
  if (model.startsWith('gpt-') || model.startsWith('o1-')) {
    return 'OpenAI';
  }
  if (model.includes('claude')) {
    return 'Anthropic';
  }
  if (model.includes('llama') || model.includes('mixtral') || model.includes('gemma')) {
    return 'Groq';
  }
  return 'Unknown';
};
```

Now displays:
```
Provider: Groq
Model: llama-3.3-70b-versatile
```

### 2. Show Full Request Body

**Before**: Displayed messages, tools, and options as separate sections.

**After**: Display the complete request body as sent to the API:

```typescript
<JsonTree data={call.request} expanded={false} />
```

This shows the ENTIRE request including:
- `messages` array
- `tools` array (if any)
- `temperature`, `max_tokens`
- `tool_choice`, `presence_penalty`, `frequency_penalty`
- Any other options

### 3. JSON Tree Viewer

**Imported JsonTree component**:
```typescript
import { JsonTree } from './JsonTree';
```

**Features**:
- ▶/▼ Expandable/collapsible nodes
- Color-coded by type (strings, numbers, objects, arrays)
- Nested indentation for readability
- Click to expand/collapse any level

**Applied to**:
- Request body
- Response body

### 4. Full-Screen Dialog

**Added state**:
```typescript
const [fullScreenCall, setFullScreenCall] = useState<number | null>(null);
```

**Trigger button** on each API call:
```typescript
<button onClick={() => setFullScreenCall(index)}>
  🔍 View Full Screen
</button>
```

**Dialog features**:
- Full-screen overlay with dark backdrop
- Max-width 6xl (1280px)
- 90vh max height with scroll
- Request and response both expanded by default
- Provider and model info in header
- Close button (X and footer button)

### 5. Enhanced Phase Formatting

**Added `final_response` phase**:
```typescript
case 'final_synthesis':
case 'final_response':
  return '✨ Final Answer';
```

## File Changes

**ui-new/src/components/LlmApiTransparency.tsx**:
- Added `JsonTree` import
- Added `fullScreenCall` state for dialog
- Added `getProviderFromModel()` function
- Updated `formatPhase()` to handle `final_response`
- Replaced separate message/tools/options sections with single full request body
- Applied `JsonTree` to request and response
- Added provider/model info display
- Added full-screen dialog with overlay

## Visual Improvements

### Before
```
📤 Request
Model: groq:llama-3.3-70b-versatile
Messages: [JSON blob]
Tools: [JSON blob]
Options: {temperature, max_tokens}

📥 Response
[JSON blob]
```

### After
```
Provider: Groq
Model: llama-3.3-70b-versatile

📤 Request Body                    🔍 View Full Screen
▶ Object{5}                        [click to expand tree]

📥 Response
▶ Object{3}                        [click to expand tree]
```

## Benefits

✅ **Provider visibility** - Know which LLM provider was used  
✅ **Complete transparency** - See exact request sent to API  
✅ **Better navigation** - Expand only what you need to see  
✅ **Full-screen inspection** - Detailed view for debugging  
✅ **Consistent UI** - Uses same JsonTree as Swag page  

## Known Issue: Last Response Missing Transparency

**Status**: 🔍 INVESTIGATING

**Observation**: The last response in a conversation sometimes doesn't show LLM transparency block.

**Possible Causes**:

1. **Event Timing**: `llm_request`/`llm_response` events arrive AFTER `message_complete`
   - Solution: Check event ordering in backend

2. **Phase Filtering**: Backend emits `chat_iteration` phase but frontend might filter it
   - Check: `if (data.phase !== 'page_summary' && data.phase !== 'synthesis_summary')`
   - `chat_iteration` should pass through

3. **Tool Execution Logic**: When last message is after tools, might be creating new message without llmApiCalls
   - Check delta handler tool detection logic

4. **Streaming State**: Message might still be `isStreaming: true` when transparency should show
   - Check: Condition is `!msg.isStreaming`

**Next Steps**:
1. Test with a simple query (no tools) - does it show transparency?
2. Check browser console for llm_request events
3. Check if events are being attached to correct message
4. Verify message_complete sets isStreaming=false

## Testing Instructions

1. **Hard refresh** (Ctrl+Shift+R) to load `index-FYU5KVE3.js`

2. **Test Provider Display**:
   ```
   Send any message
   ✅ Should show "Provider: Groq" (or OpenAI/Anthropic)
   ```

3. **Test JSON Tree**:
   ```
   Expand LLM transparency block
   Click ▶ next to Request Body
   ✅ Should see expandable tree structure
   ```

4. **Test Full Request Body**:
   ```
   Expand a request
   ✅ Should show complete request (messages, tools, temperature, etc.)
   Not just messages separately
   ```

5. **Test Full-Screen Dialog**:
   ```
   Click "🔍 View Full Screen" button
   ✅ Should open modal dialog
   ✅ Request and response both expanded
   ✅ Can scroll through content
   ✅ Close with X or Close button
   ```

6. **Test Last Response** (investigating):
   ```
   Send: "What is 2+2?"
   ❓ Does final response have LLM transparency?
   ```

## Build & Deployment

**Build**:
```bash
cd ui-new && npm run build
```

**Output**:
- File: `docs/assets/index-FYU5KVE3.js` (710.67 KB)
- CSS: `docs/assets/index-BckRmDbI.css` (48.20 KB)
- Build time: 2.42s

**Deploy**:
```bash
bash scripts/deploy-docs.sh -m "feat: Enhanced LLM transparency with provider info, full request body, and JSON tree viewer with full-screen dialog"
```

**Deployed at**: 2025-01-08 05:22 UTC  
**Git commit**: `461d10e`  
**Branch**: `agent`

## CSS Styling

JsonTree styles already exist in `ui-new/src/index.css`:
- `.json-tree` - Container
- `.json-toggle` - Expand/collapse buttons
- `.json-bracket` - { } [ ]
- `.json-key` - Object keys
- `.json-value` - Primitive values
- `.json-string`, `.json-number`, etc. - Type-specific colors

## Status

✅ **DEPLOYED** - Enhanced LLM transparency with provider info, full request body display, JSON tree viewer, and full-screen dialog for detailed inspection.

🔍 **INVESTIGATING** - Last response sometimes missing LLM transparency block. User reports this is still an issue. Need to debug event timing and message attachment logic.
