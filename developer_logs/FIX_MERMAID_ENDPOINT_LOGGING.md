# Fix Mermaid Chart Endpoint - LLM API Call Logging

## Summary

Added llmApiCall tracking to the fix-mermaid-chart endpoint to ensure transparency about LLM usage when fixing chart syntax errors.

## Implementation Date

December 2024

## Changes

### File: `src/endpoints/fix-mermaid-chart.js`

**Added llmApiCall object creation** (after line 163):

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
```

**Added to response body**:

```javascript
body: JSON.stringify({
    fixedChart,
    usage: { ... },
    original_error: error,
    llmApiCall: llmApiCall  // NEW: Added transparency data
})
```

## Endpoint Audit Results

Checked all endpoints for LLM usage logging:

### ✅ Endpoints with Proper LLM Logging

1. **chat.js** - Comprehensive llmApiCall tracking for:
   - Guardrail input/output checks
   - Main chat requests
   - Self-evaluation/assessment calls
   - Retry/continuation requests

2. **generate-image.js** - Includes llmApiCall in response with full metadata

3. **transcribe.js** - Added llmApiCall tracking for Whisper transcriptions

4. **fix-mermaid-chart.js** - NOW INCLUDES llmApiCall tracking ✅

5. **planning.js** - Uses SSE streaming with llm_request/llm_response events
   - Events include model, provider, token usage, cost
   - UI captures these events and displays in LLM info dialog

### ℹ️ Endpoints Without LLM Calls (No Logging Needed)

- **billing.js** - Queries Google Sheets, no LLM calls
- **convert.js** - File conversion (ffmpeg), no LLM calls
- **file.js** - File upload/storage, no LLM calls
- **oauth.js** - Google OAuth authentication, no LLM calls
- **proxy.js** - OpenAI proxy passthrough (user's own API key, not tracked)
- **proxy-image.js** - Image proxying, no LLM calls
- **rag.js** - Embedding generation (uses embeddings API, not chat LLM)
- **rag-sync.js** - Batch embedding operations
- **search.js** - DuckDuckGo search (no LLM)
- **static.js** - Static file serving, no LLM calls
- **stop-transcription.js** - Abort signal, no LLM calls
- **usage.js** - Usage statistics, no LLM calls

## LLM Transparency Coverage

All endpoints that make LLM API calls now properly log them:

| Endpoint | LLM Used | Logging Method | Display Location |
|----------|----------|----------------|------------------|
| `/chat` | ✅ | llmApiCall objects | Message LLM info button |
| `/generate-image` | ✅ | llmApiCall object | Image message LLM info |
| `/transcribe` | ✅ | llmApiCall object | User message (voice input) |
| `/fix-mermaid-chart` | ✅ | llmApiCall object | (Currently not displayed in UI) |
| `/planning` | ✅ | SSE events | Planning dialog LLM info button |

## UI Integration Status

### Fully Integrated
- ✅ Chat messages show all LLM calls in LlmInfoDialogNew
- ✅ Planning dialog captures llm_response events
- ✅ Voice transcription llmApiCall added to user message

### Not Yet Integrated
- ⏳ **Fix Mermaid Chart**: llmApiCall returned but not displayed in UI
  - Need to add UI display when mermaid chart is fixed
  - Could show in a similar LLM info dialog or inline badge

## Recommendations

1. **Add UI Display for Mermaid Fix**:
   - When a mermaid chart is fixed, show a small badge/icon
   - Click to show llmApiCall details in transparency dialog
   - Similar to how chat messages show LLM info button

2. **Consistent Event Naming**:
   - All endpoints use consistent llmApiCall structure
   - Planning uses SSE events (different pattern but equivalent data)

3. **Cost Tracking**:
   - All LLM calls include cost calculation
   - Token usage properly tracked
   - Enables accurate billing and transparency

## Testing

To verify the fix-mermaid-chart logging:

1. Create a mermaid chart with syntax error in chat
2. Click "Fix Chart" button
3. Check browser DevTools Network tab
4. Inspect response - should include `llmApiCall` object
5. Verify llmApiCall contains:
   - provider, model, type: 'mermaid_fix'
   - timestamp, durationMs, cost
   - request data (chartLength, errorMessage)
   - response usage (tokens)

## Related Documentation

- See `developer_logs/LLM_TRANSPARENCY_DIALOG_OVERHAUL.md` for LLM info dialog details
- See `developer_logs/CHAT_ENDPOINT_DOCUMENTATION.md` for chat logging structure
- See `developer_logs/VOICE_INPUT_MULTIPART_FIX.md` for transcription logging
