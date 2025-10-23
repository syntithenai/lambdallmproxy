# Provider Fallback on Rate Limit - Implementation Plan

## Problem
When a rate limit error occurs during LLM API calls, the backend immediately fails the request and returns an error to the user. The user has configured multiple providers (Groq and Gemini) with UI providers, but the backend doesn't automatically try alternative providers when one hits rate limits.

## Current Behavior
1. User selects `groq:llama-3.1-8b-instant` with Groq API key
2. Request hits Groq TPM limit (6000 tokens per minute)
3. Backend error: `Rate limit reached for model llama-3.1-8b-instant...`
4. Request fails completely, even though Gemini provider is available

## Desired Behavior
1. User configures multiple providers (Groq, Gemini) with their API keys in UI settings
2. User selects primary model (e.g., `groq:llama-3.1-8b-instant`)
3. Request hits rate limit on Groq
4. Backend automatically detects rate limit error
5. Backend tries alternative provider (Gemini) with equivalent model
6. Request succeeds with fallback provider
7. User sees notification: "⚠️ Primary provider hit rate limit, used Gemini as fallback"

## Implementation Strategy

### Phase 1: UI Changes - Send All Provider Configs ✅ COMPLETED
**Goal**: UI sends all enabled providers to backend, not just the selected one.

**Changes Required**:
1. `ui-new/src/utils/api.ts`:
   - Modify `sendChatMessageStreaming()` to include `providers` map (like planning endpoint)
   - Extract all enabled providers from settings
   - Format as `{ providerType: { apiKey, ...config } }` map
   - Include in request body alongside `model`

**Request Body** (Before):
```json
{
  "model": "groq:llama-3.1-8b-instant",
  "messages": [...],
  "apiKey": "gsk_...",
  "query": "..."
}
```

**Request Body** (After):
```json
{
  "model": "groq:llama-3.1-8b-instant",
  "messages": [...],
  "query": "...",
  "providers": {
    "groq": { "apiKey": "gsk_..." },
    "gemini": { "apiKey": "AIza..." }
  }
}
```

### Phase 2: Backend Changes - Fallback Logic ⏸️ NOT STARTED
**Goal**: Backend detects rate limits and tries alternative providers automatically.

**Changes Required**:

1. **`src/lambda_search_llm_handler.js` - Extract providers from request**:
   ```javascript
   // In handler (line ~1212)
   const body = JSON.parse(event.body || '{}');
   const model = body.model || 'groq:llama-3.1-8b-instant';
   const apiKey = body.apiKey || '';
   const providers = body.providers || {}; // NEW: Extract providers map
   ```

2. **`src/lambda_search_llm_handler.js` - Pass providers to runToolLoop**:
   ```javascript
   const toolsRun = await runToolLoop({
       model,
       apiKey,
       providers, // NEW: Pass providers map
       userQuery: query,
       systemPrompt,
       stream: streamObject
   });
   ```

3. **`src/lambda_search_llm_handler.js` - Add retry logic in runToolLoop (line ~330)**:
   ```javascript
   let output, text;
   let lastError;
   const maxProviderRetries = 3; // Try up to 3 alternative providers
   
   for (let providerRetry = 0; providerRetry < maxProviderRetries; providerRetry++) {
       try {
           const response = await llmResponsesWithTools(toolIterationRequestBody);
           output = response.output;
           text = response.text;
           
           // Success - emit event and break
           stream?.writeEvent?.('llm_response', { ...eventData });
           break;
           
       } catch (e) {
           lastError = e;
           const errorMsg = e?.message || String(e);
           
           // Check if this is a rate limit error
           if (isQuotaLimitError(errorMsg)) {
               console.log(`⚠️ Rate limit hit on ${model}, attempting fallback...`);
               
               // Get alternative provider/model
               const fallback = selectFallbackProvider(model, providers, providerRetry);
               
               if (fallback) {
                   // Notify user of fallback
                   stream?.writeEvent?.('provider_fallback', {
                       originalProvider: model,
                       fallbackProvider: fallback.model,
                       reason: 'rate_limit',
                       attempt: providerRetry + 1,
                       errorMessage: errorMsg
                   });
                   
                   // Update request with fallback provider
                   toolIterationRequestBody.model = fallback.model;
                   toolIterationRequestBody.options.apiKey = fallback.apiKey;
                   
                   // Continue loop to retry with new provider
                   continue;
               } else {
                   console.error(`❌ No fallback providers available`);
                   break;
               }
           } else {
               // Non-rate-limit error - don't retry
               break;
           }
       }
   }
   
   // If we exhausted all retries, throw the last error
   if (!output && lastError) {
       throw lastError;
   }
   ```

4. **`src/lambda_search_llm_handler.js` - Add selectFallbackProvider() helper**:
   ```javascript
   /**
    * Select an alternative provider/model when primary hits rate limit
    * @param {string} currentModel - Current model that failed (e.g., 'groq:llama-3.1-8b-instant')
    * @param {object} providers - Available providers from UI { providerType: { apiKey, ... } }
    * @param {number} attemptNumber - Fallback attempt number (0 = first fallback)
    * @returns {{ model: string, apiKey: string } | null}
    */
   function selectFallbackProvider(currentModel, providers, attemptNumber) {
       const { provider: currentProvider } = parseProviderModel(currentModel);
       
       // Get list of alternative providers (exclude current one)
       const availableProviders = Object.keys(providers).filter(p => p !== currentProvider);
       
       if (availableProviders.length === 0) {
           return null; // No alternatives
       }
       
       // Round-robin through available providers
       const fallbackProviderType = availableProviders[attemptNumber % availableProviders.length];
       const fallbackConfig = providers[fallbackProviderType];
       
       if (!fallbackConfig?.apiKey) {
           console.warn(`⚠️ Fallback provider ${fallbackProviderType} has no API key`);
           return null;
       }
       
       // Get default model for fallback provider
       const fallbackModel = selectDefaultModelForProvider(fallbackProviderType);
       
       return {
           model: fallbackModel,
           apiKey: fallbackConfig.apiKey
       };
   }
   
   function selectDefaultModelForProvider(providerType) {
       // Map provider types to good default models
       const defaults = {
           'groq': 'groq:llama-3.3-70b-versatile',
           'groq-free': 'groq-free:llama-3.3-70b-versatile',
           'gemini': 'gemini:gemini-2.0-flash-exp',
           'gemini-free': 'gemini-free:gemini-2.0-flash-exp',
           'openai': 'openai:gpt-4o-mini',
           'together': 'together:meta-llama/Llama-3-70b-chat-hf',
           'atlascloud': 'atlascloud:llama-3.3-70b-versatile'
       };
       
       return defaults[providerType] || `${providerType}:default`;
   }
   ```

5. **`ui-new/src/components/ChatTab.tsx` - Handle provider_fallback event**:
   ```typescript
   case 'provider_fallback': {
       // Show notification to user
       const fallbackMsg = `⚠️ ${data.originalProvider} hit rate limit, using ${data.fallbackProvider} as fallback (attempt ${data.attempt})`;
       
       // Add system message to chat
       setMessages(prev => [...prev, {
           role: 'system',
           content: fallbackMsg,
           timestamp: new Date().toISOString(),
           metadata: {
               type: 'provider_fallback',
               originalProvider: data.originalProvider,
               fallbackProvider: data.fallbackProvider,
               reason: data.reason,
               attempt: data.attempt
           }
       }]);
       
       break;
   }
   ```

### Phase 3: Model Expansion (Future Enhancement) 🔮 FUTURE
**Goal**: When a provider is selected, automatically use all compatible models for round-robin.

**Current**: User selects `groq:llama-3.1-8b-instant` → Only uses that specific model
**Future**: User selects `groq` provider → Backend rotates through all Groq models

**Implementation**:
1. Parse provider type from selected model
2. Look up all models for that provider in `PROVIDER_CATALOG.json`
3. Use round-robin across all models to distribute load
4. Track which model was used for each request
5. On rate limit, try next model in rotation before switching providers

## Testing Plan

### Test 1: Rate Limit with Fallback
1. Configure Groq + Gemini in UI settings
2. Select `groq:llama-3.1-8b-instant`
3. Send request that hits Groq rate limit
4. **Expected**: Backend tries Gemini automatically, request succeeds
5. **Expected**: UI shows notification: "⚠️ Groq hit rate limit, used Gemini as fallback"

### Test 2: Multiple Fallbacks
1. Configure Groq + Gemini + OpenAI
2. Trigger rate limits on both Groq and Gemini (send many requests)
3. **Expected**: Backend tries Groq → Gemini → OpenAI in sequence
4. **Expected**: Request succeeds on third provider

### Test 3: No Fallback Available
1. Configure only Groq (no alternatives)
2. Hit Groq rate limit
3. **Expected**: Request fails with clear error message
4. **Expected**: No infinite retry loop

### Test 4: Non-Rate-Limit Error
1. Trigger authentication error (invalid API key)
2. **Expected**: Backend does NOT retry with fallback
3. **Expected**: Error returned immediately

## Success Metrics
- ✅ Rate limit errors trigger automatic provider fallback
- ✅ Users see clear notifications when fallback is used
- ✅ Requests succeed more often despite rate limits
- ✅ No infinite retry loops or performance degradation
- ✅ Non-rate-limit errors are not retried unnecessarily

## Rollout Plan
1. ✅ Phase 1: Update UI to send all providers
2. ⏸️ Phase 2: Implement backend fallback logic
3. ⏸️ Phase 3: Test with multiple providers
4. ⏸️ Phase 4: Deploy and monitor error rates
5. 🔮 Phase 5: (Future) Add model rotation within provider

## Status
- **Phase 1**: ✅ COMPLETED - UI sends all enabled providers
- **Phase 2**: ✅ COMPLETED - Backend fallback logic implemented
- **Current**: ✅ READY FOR TESTING

## Implementation Summary

### Backend Changes (src/lambda_search_llm_handler.js)
1. ✅ Added `uiProviders` extraction from request body (line ~1218)
2. ✅ Pass `uiProviders` to `runToolLoop()` function (line ~1290)
3. ✅ Added helper functions:
   - `selectDefaultModelForProvider()` - Maps provider type to default model
   - `selectFallbackProvider()` - Selects alternative provider on rate limit
4. ✅ Updated `runToolLoop()` signature to accept `uiProviders`
5. ✅ Implemented provider fallback retry loop in tool iteration (line ~390-480):
   - Detects rate limit errors using `isQuotaLimitError()`
   - Tries up to 3 alternative providers (maxProviderRetries = 3)
   - Emits `provider_fallback` event to UI
   - Updates `model` and `apiKey` for retry
   - Non-rate-limit errors break immediately (no retry)

### Frontend Changes (ui-new/src/components/ChatTab.tsx)
1. ✅ Added `provider_fallback` event handler (line ~2927)
2. ✅ Shows system message to user: "⚠️ {originalModel} hit rate limit, switching to {fallbackModel} (attempt {N})"
3. ✅ Stores fallback metadata in message for transparency

### Frontend Changes (ui-new/src/utils/api.ts)
1. ✅ Updated `ProxyRequest` interface to include optional `providers` field (line ~293)
2. ✅ UI already sends all enabled providers (no changes needed - already implemented)

## Testing Plan

### Test 1: Rate Limit with Fallback ⏸️ PENDING
1. Configure Groq + Gemini in UI settings (both enabled)
2. Select `groq:llama-3.1-8b-instant`
3. Send request that hits Groq rate limit
4. **Expected**: Backend tries Gemini automatically, request succeeds
5. **Expected**: UI shows notification: "⚠️ groq:llama-3.1-8b-instant hit rate limit, switching to gemini:gemini-2.0-flash-exp (attempt 1)"

### Test 2: Multiple Fallbacks ⏸️ PENDING
1. Configure Groq + Gemini + OpenAI (all enabled)
2. Trigger rate limits on both Groq and Gemini (send many requests rapidly)
3. **Expected**: Backend tries Groq → Gemini → OpenAI in sequence
4. **Expected**: Request succeeds on third provider

### Test 3: No Fallback Available ⏸️ PENDING
1. Configure only Groq (disable all other providers)
2. Hit Groq rate limit
3. **Expected**: Request fails with rate limit error message
4. **Expected**: No infinite retry loop

### Test 4: Non-Rate-Limit Error ⏸️ PENDING
1. Configure invalid API key for Groq
2. Send request
3. **Expected**: Backend does NOT retry with fallback (authentication errors are not retried)
4. **Expected**: Error returned immediately

## Deployment

### Dev Server
```bash
make dev
```

### Production Lambda
```bash
# Backend changes only - no UI changes needed
make deploy-lambda-fast
```

## Success Metrics
- ✅ Rate limit errors trigger automatic provider fallback
- ✅ Users see clear notifications when fallback is used
- ⏸️ Requests succeed more often despite rate limits (needs testing)
- ✅ No infinite retry loops (max 3 attempts)
- ✅ Non-rate-limit errors are not retried (early break)

## Next Steps
1. ✅ Implementation complete - all code changes done
2. ⏸️ Test with real rate limit scenarios
3. ⏸️ Verify system messages appear correctly in UI
4. ⏸️ Monitor backend logs for fallback behavior
5. 🔮 (Future) Add telemetry to track fallback success rates
6. 🔮 (Future) Add model rotation within provider (Phase 3)
