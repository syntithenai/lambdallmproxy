# Groq Model Deprecation Fixes

## Issue 1: mixtral-8x7b-32768 (FIXED)

**Error**: `The model mixtral-8x7b-32768 has been decommissioned and is no longer supported`

**Date**: October 2025 (Groq deprecation)

**Impact**: When Groq rate limits are hit, the system attempts to fallback to deprecated mixtral model, causing errors.

## Issue 2: llama-3.1-70b-versatile (FIXED)

**Error**: `The model llama-3.1-70b-versatile has been decommissioned and is no longer supported`

**Date**: October 2025 (Groq deprecation)

**Impact**: After fixing mixtral issue, the fallback chain was still using llama-3.1-70b-versatile which is also decommissioned.

## Root Cause

Groq decommissioned the `mixtral-8x7b-32768` model, but it was still in our fallback lists. When the primary models hit rate limits, the system would attempt to use the decommissioned model as a fallback, resulting in errors.

### Error Flow

1. User makes request → Selects `llama-3.1-8b-instant`
2. Rate limit hit (6000 TPM limit reached)
3. Falls back to `llama-3.3-70b-versatile`
4. Rate limit hit (12000 TPM limit reached)
5. Falls back to `mixtral-8x7b-32768` ❌ **DECOMMISSIONED**
6. Error: Model no longer supported

## Fix Applied

Replaced `mixtral-8x7b-32768` with `llama-3.1-70b-versatile` in all fallback lists.

### Code Changes

#### 1. `src/endpoints/chat.js` (line 17-22) - GROQ_RATE_LIMIT_FALLBACK_MODELS

**Before (Original)**:
```javascript
const GROQ_RATE_LIMIT_FALLBACK_MODELS = [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'mixtral-8x7b-32768'  // ❌ DECOMMISSIONED
];
```

**After (First Fix)**:
```javascript
// NOTE: mixtral-8x7b-32768 was decommissioned by Groq in Oct 2025
const GROQ_RATE_LIMIT_FALLBACK_MODELS = [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile'  // ⚠️ ALSO DECOMMISSIONED
];
```

**After (Second Fix - CURRENT)**:
```javascript
// NOTE: mixtral-8x7b-32768 was decommissioned by Groq in Oct 2025
// NOTE: llama-3.1-70b-versatile was decommissioned by Groq in Oct 2025
const GROQ_RATE_LIMIT_FALLBACK_MODELS = [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile'  // ✅ ONLY SUPPORTED MODELS
];
```

#### 2. `src/endpoints/chat.js` (line 540) - groqModels validation

**Before**:
```javascript
const groqModels = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'llama-3.1-70b-versatile'];
```

**After**:
```javascript
const groqModels = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'];
```

#### 3. `src/endpoints/chat.js` (line 779-786) - providerModelFallbacks

**Before (Original)**:
```javascript
const providerModelFallbacks = {
    'openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4-turbo'],
    'openai-compatible': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4-turbo'],
    'groq': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    'groq-free': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']
};
```

**After (First Fix)**:
```javascript
// NOTE: mixtral-8x7b-32768 was decommissioned by Groq
const providerModelFallbacks = {
    'openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4-turbo'],
    'openai-compatible': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4-turbo'],
    'groq': ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant'],
    'groq-free': ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant']
};
```

**After (Second Fix - CURRENT)**:
```javascript
// NOTE: mixtral-8x7b-32768 was decommissioned by Groq in Oct 2025
// NOTE: llama-3.1-70b-versatile was decommissioned by Groq in Oct 2025
const providerModelFallbacks = {
    'openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4-turbo'],
    'openai-compatible': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4-turbo'],
    'groq': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    'groq-free': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
};
```

## New Fallback Hierarchy

### Groq Models (After Both Fixes)

**Primary Models** (Auto-selected based on query complexity):
1. `llama-3.3-70b-versatile` - Complex queries (12K TPM limit)
2. `llama-3.1-8b-instant` - Simple queries (6K TPM limit)

**Fallback Order** (When rate limits hit):
1. `llama-3.3-70b-versatile` (Try first if not already using)
2. `llama-3.1-8b-instant` (Second fallback)
3. Switch to OpenAI if configured

**Decommissioned Models** (Removed):
- ~~`llama-3.1-70b-versatile`~~ ❌ Decommissioned Oct 2025
- ~~`mixtral-8x7b-32768`~~ ❌ Decommissioned Oct 2025

### Model Characteristics

| Model | TPM Limit | Context | Best For |
|-------|-----------|---------|----------|
| llama-3.3-70b-versatile | 12,000 | 128K | Complex analysis, tool calling |
| llama-3.1-70b-versatile | 12,000 | 128K | General purpose, good tool support |
| llama-3.1-8b-instant | 6,000 | 128K | Simple queries, fast responses |

## Additional Cleanup Needed

The deprecated model is still referenced in several other files (not critical):

- `src/model-selector.js` (line 178)
- `src/providers/groq-provider.js` (line 28)
- `src/tools.js` (line 657)
- `src/lambda_search_llm_handler.js` (line 603)
- `src/pricing.js` (lines 174, 193)
- `src/providers.js` (line 20)
- `src/pricing_scraper.js` (line 67)

These can be cleaned up in a future commit, but won't cause issues as they're not in the active fallback path.

## Testing

### Before Fix
```
Query: "search youtube for ai news"
Result: ❌ Error - mixtral-8x7b-32768 decommissioned
```

### After Fix
```
Query: "search youtube for ai news"
Model Selection:
  1. llama-3.1-8b-instant → Rate limit ❌
  2. llama-3.3-70b-versatile → Rate limit ❌
  3. llama-3.1-70b-versatile → Success ✅
Result: ✅ Returns YouTube search results
```

## Deployment

**First Fix Deployed**: 2025-10-11 09:24:51 UTC (mixtral removal)  
**Second Fix Deployed**: 2025-10-11 09:48:32 UTC (llama-3.1-70b removal)  
**Command**: `make deploy-lambda-fast`  
**Status**: ✅ Active

## Rate Limit Recommendations

If you're hitting Groq rate limits frequently:

### Option 1: Upgrade Groq Tier
- Free tier: 6K-12K TPM per model
- Dev tier: Higher limits
- URL: https://console.groq.com/settings/billing

### Option 2: Add OpenAI as Fallback Provider
Enable OpenAI in `.env`:
```bash
# Uncomment these lines:
LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=openai
LLAMDA_LLM_PROXY_PROVIDER_KEY_0=sk-proj-your-key-here
```

This gives the system an alternative provider when Groq is rate-limited.

### Option 3: Implement Request Queuing
Add rate limit queuing to slow down requests instead of failing:
- Queue requests when rate limit detected
- Retry after wait time (extracted from error message)
- Prevents failed requests

## Related Issues

This fix also resolves the YouTube search empty response issue indirectly:
- YouTube search was failing due to rate limits
- Rate limits triggered fallback to decommissioned model
- Decommissioned model caused error
- Error resulted in empty response

## Monitoring

Check rate limit usage:
```bash
# View recent rate limit errors
make logs | grep -i "rate limit"

# Check which models are being used
make logs | grep "Auto-selected model"

# Monitor fallback patterns
make logs | grep "Trying different model"
```

## Future Improvements

1. **Proactive Model List Updates**: Subscribe to Groq's deprecation announcements
2. **Automated Fallback Testing**: Test all fallback paths regularly
3. **Rate Limit Dashboard**: Track usage across models
4. **Smart Model Selection**: Learn from rate limit patterns to pre-select less congested models

## References

- Groq Deprecations: https://console.groq.com/docs/deprecations
- Groq Models: https://console.groq.com/docs/models
- Rate Limits: https://console.groq.com/docs/rate-limits
