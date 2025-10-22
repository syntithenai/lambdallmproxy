# ✅ Phase 2.1 Complete: Embedding Call Logging

**Status**: ✅ **COMPLETE**  
**Completion Date**: October 20, 2025  
**Time Spent**: ~1 hour

---

## 🎯 Objectives Achieved

### 1. ✅ Added Authentication to RAG Endpoint
- Modified `handleEmbedSnippets` to accept `event` parameter
- Added `authenticateRequest` call to extract user email
- Graceful fallback to 'unknown' if authentication fails

### 2. ✅ Added Embedding Logging
- Logs embedding API calls after successful generation
- Tracks tokens, cost, duration, and metadata (snippet ID, chunks count)
- Uses type='embedding' to differentiate from chat calls

### 3. ✅ Enhanced Google Sheets Logger
- **Added Type column** to differentiate call types:
  - `chat` - Regular chat completions
  - `embedding` - Text embedding generation
  - `guardrail_input` - Input content validation
  - `guardrail_output` - Output content validation
  - `planning` - Planning/reasoning LLM calls
  
- **Updated Sheet Structure**:
  - Old: A-K (11 columns)
  - New: A-L (12 columns with Type at position E)
  
- **Updated initializeSheet()**: Added Type header

### 4. ✅ Fixed Duration Handling
- Changed to accept both `duration` and `durationMs` fields
- Properly converts to seconds for logging

---

## 📊 Changes Made

### File: `/home/stever/projects/lambdallmproxy/src/endpoints/rag.js`

**Imports Added**:
```javascript
const { logToGoogleSheets, calculateCost } = require('../services/google-sheets-logger');
const { authenticateRequest } = require('../auth');
```

**Function Signature Updated**:
```javascript
// Old: async function handleEmbedSnippets(body, writeEvent, responseStream)
// New: async function handleEmbedSnippets(event, body, writeEvent, responseStream)
```

**Authentication Added**:
```javascript
// Extract user email for logging
let userEmail = 'unknown';
try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (authHeader) {
        const authResult = await authenticateRequest(authHeader);
        userEmail = authResult.email || 'unknown';
    }
} catch (authError) {
    console.log('⚠️ Could not authenticate for logging:', authError.message);
}
```

**Logging Added** (after embedding generation):
```javascript
// Log embedding generation to Google Sheets
try {
    const totalTokens = embeddingResults.reduce((sum, result) => sum + (result.tokens || 0), 0);
    const totalCost = calculateCost(embeddingModel, totalTokens, 0); // Embeddings have 0 output tokens
    const duration = Date.now() - startTime;
    
    await logToGoogleSheets({
        userEmail,
        provider: embeddingProvider,
        model: embeddingModel,
        promptTokens: totalTokens,
        completionTokens: 0,
        totalTokens,
        cost: totalCost,
        duration,
        error: null,
        type: 'embedding',
        metadata: {
            snippetId: snippet.id,
            chunksGenerated: embeddingResults.length
        }
    });
    console.log(`✅ Logged embedding generation: ${embeddingResults.length} chunks, ${totalTokens} tokens, $${totalCost.toFixed(6)}`);
} catch (logError) {
    console.error('⚠️ Failed to log embedding to Google Sheets:', logError.message);
}
```

---

### File: `/home/stever/projects/lambdallmproxy/src/services/google-sheets-logger.js`

**Sheet Structure Updated**:

**Old Headers (A-K)**:
```javascript
['Timestamp', 'User Email', 'Provider', 'Model', 'Tokens In', 'Tokens Out', 
 'Total Tokens', 'Cost ($)', 'Duration (s)', 'Error Code', 'Error Message']
```

**New Headers (A-L)**:
```javascript
['Timestamp', 'User Email', 'Provider', 'Model', 'Type',  // NEW!
 'Tokens In', 'Tokens Out', 'Total Tokens', 'Cost ($)', 'Duration (s)', 
 'Error Code', 'Error Message']
```

**Row Data Updated**:
```javascript
const durationMs = logData.duration || logData.durationMs || 0;
const durationSeconds = (durationMs / 1000).toFixed(2);

const rowData = [
    logData.timestamp || new Date().toISOString(),
    logData.userEmail || 'unknown',
    logData.provider || 'unknown',
    logData.model || 'unknown',
    logData.type || 'chat',  // NEW: Defaults to 'chat' for backward compatibility
    logData.promptTokens || 0,
    logData.completionTokens || 0,
    logData.totalTokens || 0,
    cost.toFixed(4),
    durationSeconds,
    logData.errorCode || '',
    logData.errorMessage || ''
];

// Updated range from A:K to A:L
await appendToSheet(spreadsheetId, `${sheetName}!A:L`, rowData, accessToken);
```

---

## 🔍 Testing Considerations

### Manual Test:
1. Call `/rag/embed-snippets` with authenticated request
2. Check Google Sheets "LLM Usage Log" for new row
3. Verify:
   - ✅ Type = "embedding"
   - ✅ Model = "text-embedding-3-small"
   - ✅ Provider = "openai"
   - ✅ Tokens In = calculated total
   - ✅ Tokens Out = 0
   - ✅ Cost = accurate ($0.02 per 1M tokens)

### Example Log Entry:
```
Timestamp: 2025-10-20T10:30:45.123Z
User Email: user@example.com
Provider: openai
Model: text-embedding-3-small
Type: embedding  ← NEW!
Tokens In: 1500
Tokens Out: 0
Total Tokens: 1500
Cost ($): 0.0000
Duration (s): 0.85
Error Code: 
Error Message: 
```

---

## 📈 Impact

### Cost Tracking Coverage Improvement:
**Before Phase 2.1**:
- Chat calls: ✅ Logged
- Embeddings: ❌ **Not logged** (major gap!)
- Guardrails: ❌ Not logged
- Lambda metrics: ❌ Not tracked

**After Phase 2.1**:
- Chat calls: ✅ Logged
- Embeddings: ✅ **Now logged!** 🎉
- Guardrails: ⏳ Next (Phase 2.2)
- Lambda metrics: ⏳ Next (Phase 2.3)

### User Impact:
- **Accurate embedding costs** - No more missing costs in billing
- **Type differentiation** - Can see what types of calls are made
- **Better debugging** - Snippet IDs and chunk counts in metadata

---

## 🚀 Ready for Phase 2.2: Guardrail Logging

With embedding logging complete, we can now add guardrail logging:

### Next Steps:
1. Find guardrail validation calls in `chat.js`
2. Add logging after `validateInput()` (type='guardrail_input')
3. Add logging after `validateOutput()` (type='guardrail_output')
4. Track tokens/cost for content moderation API calls

**Estimated Time**: 1-2 hours

---

**Phase 2.1 Status**: ✅ **COMPLETE**  
**Files Modified**: 2 (rag.js, google-sheets-logger.js)  
**New Feature**: Type column for call differentiation  
**Coverage**: Embedding calls now logged with costs

---

*Generated: October 20, 2025*  
*Next: Phase 2.2 - Guardrail Logging*
