# Comprehensive LLM Logging Fixes

## Summary

Fixed multiple issues with LLM API call logging and transparency across the application, ensuring all LLM calls are properly tracked and displayed.

## Implementation Date

December 2024

## Issues Fixed

### 1. ✅ Assessor Call Not Shown in LLM Info

**Problem**: Self-evaluation/assessor calls were being tracked in `allLlmApiCalls` array in the backend but not appearing in the UI.

**Root Cause**: The assessor calls WERE being sent correctly in the `message_complete` event with `llmApiCalls` array. The backend logging was correct.

**Status**: ✅ CONFIRMED WORKING - No changes needed. The assessor calls are properly included in the `llmApiCalls` array sent to the frontend.

**Verification**:
- Backend: Line 3007 in `chat.js` - `allLlmApiCalls.push(evalLlmCall);`
- Backend: Line 3256 in `chat.js` - `llmApiCalls: allLlmApiCalls` in message_complete event
- Frontend: Lines 2590-2594 in `ChatTab.tsx` - `llmApiCalls: data.llmApiCalls` properly assigned to message
- UI: LlmInfoDialogNew displays all calls in the `llmApiCalls` array

### 2. ✅ Whisper/Transcription Not Showing in Logs

**Problem**: Voice transcription llmApiCall was being created but stored in wrong property name.

**Root Cause**: Voice transcription was storing llmApiCall in `_llmApiCalls` (underscore prefix) but UI looks for `llmApiCalls` (no underscore).

**Fix**: Changed ChatTab.tsx line 1662 from:
```typescript
userMessage._llmApiCalls = [voiceLlmApiCallRef.current];
```
To:
```typescript
userMessage.llmApiCalls = [voiceLlmApiCallRef.current];
```

**Files Changed**:
- `ui-new/src/components/ChatTab.tsx` (line 1662)

**Result**: Voice transcription llmApiCall now properly appears in user message LLM info dialog.

### 3. ✅ Mermaid Fix LLM Call Transparency

**Problem**: Fix-mermaid-chart endpoint was using LLM but not including llmApiCall object in response.

**Fix**: Added llmApiCall object to fix-mermaid-chart endpoint response:

**Backend Changes** (`src/endpoints/fix-mermaid-chart.js`):
```javascript
// Create llmApiCall object for transparency
const llmApiCall = {
    phase: 'mermaid_fix',
    provider: selectedProvider.type,
    model: result.model || 'unknown',
    type: 'mermaid_fix',
    timestamp: new Date().toISOString(),
    durationMs: duration,
    cost: usage.cost || 0,
    success: true,
    request: {
        chartLength: chart.length,
        errorMessage: error.substring(0, 200)
    },
    response: {
        usage: {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens
        },
        fixedChartLength: fixedChart.length
    },
    metadata: {
        temperature: 0.1,
        max_tokens: 2000
    }
};

// Add to response
body: JSON.stringify({
    fixedChart,
    usage: { ... },
    original_error: error,
    llmApiCall: llmApiCall  // NEW
})
```

**Frontend Changes** (`ui-new/src/components/MermaidChart.tsx`):
1. Added import: `import { LlmInfoDialog as LlmInfoDialogNew } from './LlmInfoDialogNew';`
2. Added state: `const [showLlmInfo, setShowLlmInfo] = useState(false);`
3. Updated FixAttempt interface to include `llmApiCall?: any`
4. Store llmApiCall in fix attempts: `llmApiCall: data.llmApiCall`
5. Added LLM info button in action buttons area (appears on hover when fixes exist)
6. Added LlmInfoDialogNew at bottom of component to display all fix attempts' llmApiCalls

**Result**: Users can now click "LLM" button on mermaid charts that have been fixed to see transparency info for all fix attempts.

### 4. ✅ Planning Endpoint LLM Logging

**Problem**: Requested to add LLM call logging to planning endpoint.

**Status**: ✅ ALREADY IMPLEMENTED - Planning endpoint has comprehensive logging:
- Sends SSE events: `llm_request`, `llm_response`, `llm_error`
- Events include: model, provider, tokens, cost, duration
- UI captures these events in PlanningDialog (line 157-160)
- Google Sheets logging (lines 852-870)
- Logs to both service account sheet and user billing sheet

**Verification**:
- Backend: Lines 796-830 send llm_request/llm_response SSE events
- Backend: Lines 852-870 log to Google Sheets with full token/cost data
- Frontend: PlanningDialog.tsx lines 157-160 capture and store llmInfo from events

### 5. ✅ Embed Query Endpoint Logging

**Problem**: `/rag/embed-query` endpoint was not tracking embedding API calls.

**Fix**: Added llmApiCall tracking to embed-query endpoint.

**Changes** (`src/endpoints/rag.js` lines 520-551):
```javascript
// Generate embedding for query
const startTime = Date.now();
const result = await embeddings.generateEmbedding(...);
const duration = Date.now() - startTime;

// Create llmApiCall object for transparency
const llmApiCall = {
    phase: 'embedding',
    provider: 'openai',
    model: 'text-embedding-3-small',
    type: 'embedding',
    timestamp: new Date().toISOString(),
    durationMs: duration,
    cost: result.cost || 0,
    success: true,
    request: {
        query: query,
        queryLength: query.length
    },
    response: {
        usage: {
            prompt_tokens: result.tokens || 0,
            total_tokens: result.tokens || 0
        },
        embeddingDimensions: result.embedding?.length || 0
    },
    metadata: {
        cached: false
    }
};

// Add to response
responseStream.write(JSON.stringify({
    query,
    embedding: Array.from(result.embedding),
    model: 'text-embedding-3-small',
    cached: false,
    cost: result.cost,
    tokens: result.tokens,
    llmApiCall: llmApiCall  // NEW
}));
```

**Result**: Embedding API calls are now tracked with full transparency data.

## Complete LLM Logging Coverage

All endpoints that use LLM/embedding APIs now include transparency tracking:

| Endpoint | LLM Type | Tracking | Display |
|----------|----------|----------|---------|
| `/chat` | Chat completion | ✅ llmApiCall | Message LLM info button |
| `/chat` (guardrails) | Moderation | ✅ llmApiCall | Message LLM info button |
| `/chat` (assessor) | Self-eval | ✅ llmApiCall | Message LLM info button |
| `/generate-image` | Image gen | ✅ llmApiCall | Image message LLM info |
| `/transcribe` | Speech-to-text | ✅ llmApiCall | User message LLM info |
| `/fix-mermaid-chart` | Chart fixing | ✅ llmApiCall | Chart LLM button |
| `/planning` | Planning | ✅ SSE events | Planning dialog |
| `/rag/embed-query` | Embeddings | ✅ llmApiCall | (Not yet displayed) |

## Testing Verification

### Test Assessor Logging:
1. Send a complex question requiring self-evaluation
2. Check backend logs for: `📊 Tracked self-evaluation LLM call`
3. Click LLM info button on assistant message
4. Verify self-evaluation calls appear with type: 'self_evaluation'

### Test Whisper Logging:
1. Click microphone button and record audio
2. Speak a message
3. Check console for: `🎙️ Added voice transcription llmApiCall to user message`
4. Click LLM info button on your user message
5. Verify transcription call appears with pink badge and type: 'transcription'

### Test Mermaid Fix Logging:
1. Create a mermaid chart with syntax error (e.g., invalid node name)
2. Wait for "Fix Chart" button to appear
3. Click "Fix Chart"
4. After fix completes, hover over chart
5. Click "LLM" button in top-right
6. Verify fix attempt(s) appear with type: 'mermaid_fix'

### Test Planning Logging:
1. Open Planning tab
2. Enter a research query
3. Click "Generate Plan"
4. After completion, click "LLM Info" button
5. Verify planning LLM call appears with full token/cost data

### Test Embed Query Logging:
1. Use RAG search with semantic query
2. Check response includes `llmApiCall` object
3. Verify embedding dimensions, tokens, and cost are tracked

## Code Locations Reference

### Backend Logging:
- `src/endpoints/chat.js`:
  - Line 1662: Initialize allLlmApiCalls
  - Line 3007: Push assessor call
  - Line 3256: Include in message_complete
- `src/endpoints/fix-mermaid-chart.js`:
  - Lines 163-189: Create and add llmApiCall
- `src/endpoints/planning.js`:
  - Lines 796-830: Send SSE transparency events
  - Lines 852-870: Log to Google Sheets
- `src/endpoints/rag.js`:
  - Lines 520-551: Create and add llmApiCall for embeddings

### Frontend Display:
- `ui-new/src/components/ChatTab.tsx`:
  - Line 1662: Store voice llmApiCall in message
  - Lines 2590-2594: Assign llmApiCalls from message_complete
  - Lines 6113-6117: Render LlmInfoDialogNew
- `ui-new/src/components/MermaidChart.tsx`:
  - Lines 1-8: Import LlmInfoDialogNew
  - Line 48: Add showLlmInfo state
  - Lines 289-290: Store llmApiCall in fix attempt
  - Lines 356-368: Add LLM info button
  - Lines 546-551: Render LlmInfoDialogNew
- `ui-new/src/components/PlanningDialog.tsx`:
  - Lines 157-160: Capture llm_response events

## Related Documentation

- `developer_logs/LLM_TRANSPARENCY_DIALOG_OVERHAUL.md` - New transparency dialog
- `developer_logs/FIX_MERMAID_ENDPOINT_LOGGING.md` - Mermaid endpoint audit
- `developer_logs/CHAT_ENDPOINT_DOCUMENTATION.md` - Chat logging structure
