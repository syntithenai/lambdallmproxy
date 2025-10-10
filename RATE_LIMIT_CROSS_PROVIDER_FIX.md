# Rate Limit Cross-Provider Model Switching Bug Fix

**Date:** October 10, 2025  
**Issue:** Model incompatibility when rate limits trigger model switching  
**Status:** ✅ Fixed and Deployed

## Problem Description

When OpenAI hit a rate limit, the retry logic was switching to Groq models (`llama-3.1-8b-instant`) while **keeping the provider as OpenAI**. This caused 404 errors because OpenAI doesn't have Groq models.

### Error Sequence

1. User configures **only OpenAI provider** in settings
2. Lambda selects OpenAI provider with `gpt-4o` model
3. OpenAI returns 429 rate limit error
4. Retry logic switches model to `llama-3.1-8b-instant` (Groq model)
5. Provider remains `openai`, endpoint remains `https://api.openai.com/v1/chat/completions`
6. OpenAI API returns: `404 - The model 'llama-3.1-8b-instant' does not exist`

### CloudWatch Log Evidence

```
🔄 Attempt 1/3: provider=openai, model=gpt-4o
❌ Attempt 1 failed: Rate limit reached...
🚀 Switching to alternate Groq model: llama-3.1-8b-instant
🔄 Attempt 2/3: provider=openai, model=llama-3.1-8b-instant  <-- BUG!
❌ Attempt 2 failed: The model `llama-3.1-8b-instant` does not exist...
```

## Root Cause

The rate limit handling code (lines 755-810 in `src/endpoints/chat.js`) was **legacy code from when only Groq was supported**. It had hardcoded logic to switch between Groq models using the `GROQ_RATE_LIMIT_FALLBACK_MODELS` constant.

```javascript
// OLD BUGGY CODE (lines 768-807)
if (isRateLimitError) {
    const manualFallback = GROQ_RATE_LIMIT_FALLBACK_MODELS.find(...);
    let selectedModel = manualFallback;
    
    // Changes model to Groq model
    requestBody.model = selectedModel;
    model = selectedModel;
    
    // But doesn't change provider or endpoint!
    console.log(`🚀 Switching to alternate Groq model: ${selectedModel}`);
    continue;  // Retries with wrong provider+model combo
}
```

The code never updated the `provider` variable or `targetUrl`, so it kept using the original provider (OpenAI) with an incompatible model (Groq's llama-3.1-8b-instant).

## Solution

Removed the cross-provider model switching logic entirely. When a rate limit occurs, the request now **fails immediately** with a clear error message.

### Code Changes

**File:** `src/endpoints/chat.js`

#### Change 1: Rate Limit Handling (Lines 758-764)

**Before:**
```javascript
if (isRateLimitError) {
    if (isLastAttempt) {
        console.error(`🛑 Rate limit on all ${maxRetries} models`);
        throw error;
    }
    
    console.log(`🔀 Rate limit detected, switching to different model...`);
    const attemptedList = Array.from(attemptedModels);
    const manualFallback = GROQ_RATE_LIMIT_FALLBACK_MODELS.find(candidate => !attemptedModels.has(candidate));
    // ... 40 more lines of model switching logic
    console.log(`🚀 Switching to alternate Groq model: ${selectedModel}`);
    continue;
}
```

**After:**
```javascript
if (isRateLimitError) {
    console.error(`🛑 Rate limit hit on provider ${provider}, model ${model}`);
    console.log(`💡 Tip: Configure multiple providers in your settings to enable automatic fallback`);
    throw error;
}
```

#### Change 2: Network Error Handling (Lines 765-820)

Simplified network error handling to retry the same model 3 times with exponential backoff, then fail. Removed the model switching logic.

**Before:**
```javascript
if (sameModelRetries >= 3 || isLastAttempt) {
    if (!isLastAttempt) {
        console.log(`⚠️ Network error after 3 retries, trying different model...`);
        // ... 40+ lines of Groq model switching
        console.log(`🔀 Model switch: ${selectedModel}`);
        continue;
    }
    throw error;
}
```

**After:**
```javascript
if (sameModelRetries >= 3 || isLastAttempt) {
    console.error(`🛑 Network error persists after ${sameModelRetries} retries`);
    throw error;
}
```

## Why This Approach?

1. **Simplicity**: Removing complex cross-provider switching eliminates an entire class of bugs
2. **Correctness**: Provider and model must always match - no exceptions
3. **User Control**: Users configure their providers; the system shouldn't override their choices arbitrarily
4. **Clear Errors**: Users get immediate feedback about rate limits rather than confusing 404 errors

## Future Improvements

In the future, we could implement **true provider fallback** that switches to a completely different provider (with its compatible models) when rate limits occur:

```javascript
if (isRateLimitError) {
    // Try next provider in pool
    const nextProvider = providerPool.find(p => 
        p.id !== selectedProvider.id && 
        !attemptedProviders.has(p.id)
    );
    
    if (nextProvider) {
        // Switch provider + model + endpoint together
        selectedProvider = nextProvider;
        model = getDefaultModelForProvider(nextProvider);
        targetUrl = getEndpointForProvider(nextProvider);
        console.log(`🔀 Switching to provider: ${nextProvider.type}`);
        continue;
    }
    
    throw error;
}
```

This would require:
- Tracking attempted providers (not just models)
- Selecting appropriate models for each provider
- Updating endpoint URLs when switching providers
- Handling provider-specific request format differences

## Testing Checklist

- [x] ~~OpenAI with Groq model name~~ - Now correctly uses OpenAI models only
- [x] Rate limits fail cleanly with helpful error message
- [x] Network errors retry same model with backoff (no model switching)
- [x] Model validation logic still works (previous fix)
- [x] No more 404 errors from model mismatches

## Deployment

**Deployment Time:** 19:29:40 UTC (October 10, 2025)  
**Package Size:** 152.4 KiB  
**Lambda URL:** https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/

## Related Fixes

1. **Model Validation Fix** (earlier today) - Added model override logic to ensure model matches provider
2. **Provider Pool Fix** (earlier today) - Made provider selection use user-configured providers
3. **Endpoint URL Fix** (earlier today) - Added smart URL construction for `/chat/completions`

All three fixes work together to ensure provider, model, and endpoint are always consistent.

## Files Modified

- `src/endpoints/chat.js` - Removed lines 758-807 (rate limit model switching)
- `src/endpoints/chat.js` - Simplified lines 765-820 (network error handling)

## Summary

The bug was caused by legacy Groq-specific code that survived the migration to a multi-provider system. The fix removes cross-provider model switching and ensures requests fail cleanly when rate limits occur, giving users clear feedback about what went wrong.
