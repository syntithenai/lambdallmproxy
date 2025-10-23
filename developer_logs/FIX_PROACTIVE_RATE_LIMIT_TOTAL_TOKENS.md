# Fix: Proactive Rate Limit Check - Total Tokens Estimation

**Date**: October 23, 2025  
**Issue**: Proactive rate limit check was only checking INPUT tokens, causing "Request too large" errors  
**Status**: ✅ Fixed

## Problem

User encountered this error:
```
❌ Error: Rate limit reached for model meta-llama/llama-4-maverick-17b-128e-instruct
TPM: Limit 6000, Used 4597, Requested 4424
Total: 9,021 tokens (exceeds limit by 3,021)
```

The proactive rate limit check said the model was "available" but the request failed at the provider level.

### Root Cause

**Groq's rate limits apply to TOTAL tokens (input + output), not just input tokens.**

The proactive check was only validating input tokens:
```javascript
const estimatedInputTokens = selection?.analysis?.estimatedTokens || 1000;
rateLimitTracker.isAvailable(provider, model, estimatedInputTokens);
```

This meant:
- ✅ Check passed: 4,597 + 1,000 = 5,597 < 6,000
- ❌ Actual request: 4,597 + 4,424 = 9,021 > 6,000

## Solution

Updated the proactive rate limit check to estimate TOTAL tokens by adding `max_tokens`:

```javascript
// CRITICAL: Groq's rate limits apply to TOTAL tokens (input + output), not just input
const estimatedInputTokens = selection?.analysis?.estimatedTokens || 1000;
const maxOutputTokens = requestBody.max_tokens || 2048;
const estimatedTotalTokens = estimatedInputTokens + maxOutputTokens;

rateLimitTracker.isAvailable(provider, model, estimatedTotalTokens);
```

### Behavior After Fix

With accumulated usage of 4,597 tokens:
- **Before**: Checking 1,000 input tokens → 5,597 total → ✅ passes
- **After**: Checking 1,000 + 2,048 = 3,048 total → 7,645 total → ❌ catches proactively
- **Result**: Automatically switches to fallback model, preventing API error

## Files Changed

- `src/endpoints/chat.js` (lines 1848-1853)

## Testing

1. **Scenario**: Request with high accumulated usage
2. **Expected**: Proactive check catches rate limit, switches to fallback
3. **Verified**: No more "Request too large" errors

## Related Fixes

- **Single-request size check**: Added in previous session to catch oversized requests
- **TPM limits update**: Verified against official Groq documentation
- **Guardrail model filtering**: Excluded llama-guard from chat pool

## Notes

- This fix is conservative (uses `max_tokens` as worst-case output)
- Better than failing at provider level with user-visible error
- Fallback mechanism automatically selects alternative model
