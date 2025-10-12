# Fix: Gemini Provider Parameter Compatibility

**Date**: 2025-10-12  
**Status**: ✅ Completed  
**Deployed**: Yes (Lambda fast deploy)

## Problem

User reported continued "API request failed (400)" errors even after malformed function call cleaning was deployed.

### Root Cause Analysis

CloudWatch logs revealed the actual error from Gemini API:
```json
{
  "error": {
    "code": 400,
    "message": "Invalid JSON payload received. Unknown name \"frequency_penalty\": Cannot find field.",
    "status": "INVALID_ARGUMENT"
  }
}
```

**The Issue**: 
1. Initial request uses Groq provider (supports `frequency_penalty` and `presence_penalty`)
2. Groq hits rate limit after some iterations
3. System fails over to Gemini provider
4. **BUG**: When switching providers, the code updates `requestBody.model` but doesn't remove Gemini-incompatible parameters
5. Gemini API rejects request with 400 error because it doesn't support `frequency_penalty` and `presence_penalty`

### Why This Happened

The parameter filtering logic (lines 1165-1168) only runs **once** before the retry loop:

```javascript
// Build base request body - Gemini has stricter parameter requirements
const isGeminiProvider = selectedProvider.type === 'gemini-free' || selectedProvider.type === 'gemini';

if (!isGeminiProvider) {
    requestBody.frequency_penalty = frequency_penalty;
    requestBody.presence_penalty = presence_penalty;
}
```

During provider failover (line 1319), the code switches `selectedProvider` but never re-checks parameter compatibility:

```javascript
// Switch to new provider
selectedProvider = nextProvider;
provider = selectedProvider.type;
// ... update model ...
requestBody.model = model; // ❌ Only updates model, not parameters!
```

## Solution

### Enhanced Provider Failover Parameter Management

**File**: `src/endpoints/chat.js` (lines 1328-1361)

Added provider-specific parameter compatibility handling during failover:

```javascript
// Update request body for new provider
requestBody.model = model;

// Handle provider-specific parameter compatibility
const isSwitchingToGemini = selectedProvider.type === 'gemini-free' || selectedProvider.type === 'gemini';
if (isSwitchingToGemini) {
    // Gemini doesn't support frequency_penalty and presence_penalty
    delete requestBody.frequency_penalty;
    delete requestBody.presence_penalty;
    console.log('🧹 Removed unsupported parameters for Gemini provider');
} else if (!requestBody.frequency_penalty && !requestBody.presence_penalty) {
    // Switching back to a provider that supports penalties, add them back
    requestBody.frequency_penalty = frequency_penalty;
    requestBody.presence_penalty = presence_penalty;
    console.log('✅ Restored penalty parameters for non-Gemini provider');
}

if (lastRequestBody) {
    lastRequestBody.provider = provider;
    lastRequestBody.model = model;
    if (lastRequestBody.request) {
        lastRequestBody.request.model = model;
        // Sync penalty parameters
        if (isSwitchingToGemini) {
            delete lastRequestBody.request.frequency_penalty;
            delete lastRequestBody.request.presence_penalty;
        } else {
            lastRequestBody.request.frequency_penalty = frequency_penalty;
            lastRequestBody.request.presence_penalty = presence_penalty;
        }
    }
}
```

**What It Does**:
1. **Detects Gemini Failover**: Checks if switching to `gemini-free` or `gemini` provider
2. **Removes Incompatible Parameters**: Deletes `frequency_penalty` and `presence_penalty` from request
3. **Restores for Compatible Providers**: Adds parameters back when switching from Gemini to OpenAI/Groq
4. **Syncs lastRequestBody**: Ensures continuation context has correct parameters
5. **Provides Visibility**: Logs when parameters are removed/restored

## Technical Details

### Provider API Compatibility

| Provider | frequency_penalty | presence_penalty | Notes |
|----------|-------------------|------------------|-------|
| OpenAI | ✅ Supported | ✅ Supported | Full compatibility |
| Groq | ✅ Supported | ✅ Supported | Full compatibility |
| Gemini | ❌ Not Supported | ❌ Not Supported | Uses OpenAI-compatible API but limited parameters |
| Together AI | ✅ Supported | ✅ Supported | Full compatibility |
| Anthropic | ❌ Not Supported | ❌ Not Supported | Different parameter names |

### Failover Scenario Example

**Initial Request**:
```javascript
// Provider: groq-free (supports penalties)
{
  model: "llama-3.3-70b-versatile",
  temperature: 0.7,
  frequency_penalty: 0.3,  // ✅ Supported
  presence_penalty: 0.4     // ✅ Supported
}
```

**After Rate Limit** (Iteration 3):
```javascript
// Provider switches to: gemini-free
// Before fix: ❌ Request fails with 400
// After fix: ✅ Parameters removed automatically
{
  model: "gemini-2.0-flash",
  temperature: 0.7
  // frequency_penalty: REMOVED
  // presence_penalty: REMOVED
}
```

### Why Check Both RequestBody and LastRequestBody

1. **requestBody**: Used for current API call to LLM provider
2. **lastRequestBody**: Stored in continuation context, sent back to UI
3. **Both must match**: Ensures consistent state across iterations

If only `requestBody` is updated, the next continuation will have mismatched parameters.

## Testing

### Verification Steps

1. **Trigger Groq Rate Limit**:
   - Make multiple requests to exhaust Groq daily token limit
   - System should automatically fail over to Gemini

2. **Check Logs**:
   ```bash
   make logs
   ```
   Look for:
   ```
   🔀 Rate limit hit on provider groq-free
   🚀 Switching to different provider type: gemini-free, model: gemini-2.0-flash
   🧹 Removed unsupported parameters for Gemini provider
   ```

3. **Verify Success**:
   - Request should complete successfully with Gemini
   - No more 400 errors about `frequency_penalty`
   - LLM response should be returned normally

4. **Test Reverse Failover**:
   - If Gemini rate limits, system should fail back to Groq/OpenAI
   - Log should show: `✅ Restored penalty parameters for non-Gemini provider`

### Expected Behavior

**Before Fix**:
```
Attempt 1: groq-free ✅ Success
Attempt 2: groq-free ❌ Rate limit (429)
Attempt 3: gemini-free ❌ Invalid parameter (400)
Result: ❌ API request failed (400)
```

**After Fix**:
```
Attempt 1: groq-free ✅ Success  
Attempt 2: groq-free ❌ Rate limit (429)
Attempt 3: gemini-free ✅ Success (parameters removed)
Result: ✅ Response returned successfully
```

## Impact

### User Experience

**Before**:
- Requests fail with cryptic "API request failed (400)" error
- No indication that provider failover caused the issue
- Users think the entire system is broken
- Must manually change provider selection

**After**:
- Seamless failover from Groq to Gemini
- No user-visible errors
- System automatically adjusts parameters per provider
- Transparent multi-provider resilience

### System Reliability

- ✅ Automatic recovery from rate limits
- ✅ True multi-provider redundancy
- ✅ No manual intervention required
- ✅ Graceful degradation across providers

## Related Context

### Provider Failover Strategy

The system uses intelligent provider selection:

1. **Normal Context** (<100K tokens):
   - Primary: `groq-free` (fast, free)
   - Fallback: `openai`, `together`, `atlascloud` (paid)
   - Last Resort: `gemini-free` (large context but slower)

2. **Large Context** (>100K tokens):
   - Primary: `gemini-free` (2M token window)
   - Fallback: `groq-free`, then others

3. **Rate Limit Handling**:
   - Tries all models on current provider
   - Switches to different provider type
   - Tries all providers in pool
   - Only fails if all exhausted

### Why Gemini Has Different Parameters

Gemini uses Google's proprietary API but provides an OpenAI-compatible endpoint. However, it only supports a subset of OpenAI parameters:

**Supported**: `model`, `messages`, `temperature`, `max_tokens`, `top_p`, `tools`, `tool_choice`  
**Not Supported**: `frequency_penalty`, `presence_penalty`, `logit_bias`, `n`, `stream` (some models)

This is documented in Google AI Studio but not prominently advertised.

## Lessons Learned

1. **Dynamic Parameter Compatibility**: Provider switching requires dynamic parameter adjustment
2. **Test All Failover Paths**: Initial code worked for first provider, broke on failover
3. **Log State Changes**: Visibility into parameter changes helps debugging
4. **Sync All State**: Must update both active request and continuation context
5. **Read Provider Docs**: Each provider has subtle compatibility differences

## Future Improvements

### Short Term
- Add parameter compatibility check function
- Create provider capability matrix
- Warn when unsupported parameters requested

### Long Term
- Build provider abstraction layer
- Auto-detect supported parameters per provider
- Implement parameter translation (e.g., map frequency_penalty to Gemini equivalent)
- Add provider-specific optimizations

### Monitoring
- Track failover success rates
- Alert on repeated parameter compatibility errors
- Dashboard showing provider usage distribution

## References

- **File**: `src/endpoints/chat.js`
- **Lines Changed**: 1328-1361 (provider failover parameter management)
- **Related Docs**: 
  - `developer_log/FIX_API_ERROR_HANDLING_AND_MALFORMED_FUNCTION_CALLS.md` (previous error fix)
  - `developer_log/FIX_PROVIDER_FAILOVER_RATE_LIMITS.md` (if exists - failover strategy)
- **External Docs**:
  - [Google AI Gemini API - OpenAI Compatibility](https://ai.google.dev/gemini-api/docs/openai)
  - [OpenAI Chat Completions Parameters](https://platform.openai.com/docs/api-reference/chat/create)

## Deployment

### Commands Used

```bash
# Fast Lambda deployment (code only, ~10 seconds)
bash scripts/deploy-fast.sh
```

### Deployment Verification

```bash
# Check function status
aws lambda get-function --function-name llmproxy \
  --query 'Configuration.[LastModified,State,LastUpdateStatus]' \
  --output text

# Check logs for parameter removal
make logs | grep "Removed unsupported parameters"
```

### Post-Deployment Testing

1. Trigger Groq rate limit (make many requests)
2. Verify failover to Gemini succeeds
3. Check logs show parameter removal
4. Confirm no 400 errors

## Commit

```bash
git add src/endpoints/chat.js developer_log/FIX_GEMINI_PARAMETER_COMPATIBILITY.md
git commit -m "fix: handle Gemini parameter compatibility during provider failover

- Remove frequency_penalty and presence_penalty when switching to Gemini
- Restore parameters when switching back to compatible providers
- Sync parameters in both requestBody and lastRequestBody
- Add logging for parameter changes during failover
- Resolves 400 error: 'Invalid JSON payload received. Unknown name frequency_penalty'

Problem: Provider failover from Groq to Gemini caused 400 errors because
Gemini doesn't support frequency_penalty/presence_penalty parameters.
The initial parameter filtering only ran once; failover code didn't
re-check parameter compatibility.

Solution: Added dynamic parameter management during provider switching.
Removes incompatible parameters when switching to Gemini, restores them
when switching back to OpenAI/Groq/Together AI.

Files changed:
- src/endpoints/chat.js: Enhanced provider failover (lines 1328-1361)
- developer_log/FIX_GEMINI_PARAMETER_COMPATIBILITY.md: Documentation"
```
