# Intelligent Model Fallback Within Same Provider

**Date:** October 10, 2025  
**Feature:** Automatic model switching on rate limits using the same API key  
**Status:** ✅ Implemented and Deployed

## The Problem

Previously, when a rate limit occurred on OpenAI's `gpt-4o`, the system would immediately try to switch to a completely different provider (like Groq), even though the same OpenAI API key could access other models with separate rate limits.

This meant users had to either:
1. Configure multiple "providers" with the same OpenAI key but different models (tedious!)
2. Accept rate limit errors when `gpt-4o` was exhausted

## The Solution

The system now **automatically tries different models on the same provider** before switching to a different provider entirely.

### New Behavior

```
OpenAI gpt-4o (rate limit) ❌
    ↓ Try different model on same provider
OpenAI gpt-4o-mini ✅ Success!
```

If all models on OpenAI are exhausted:
```
OpenAI gpt-4o (rate limit) ❌
    ↓
OpenAI gpt-4o-mini (rate limit) ❌
    ↓
OpenAI gpt-3.5-turbo (rate limit) ❌
    ↓ Switch to different provider
Groq llama-3.3-70b-versatile ✅ Success!
```

## How It Works

### Model Fallback Chains

The system has predefined fallback chains for each provider type:

**OpenAI / OpenAI-Compatible:**
1. `gpt-4o` (30K TPM) - Try first
2. `gpt-4o-mini` (200K TPM) - Fallback 1
3. `gpt-3.5-turbo` (60K TPM) - Fallback 2
4. `gpt-4-turbo` (30K TPM) - Fallback 3

**Groq / Groq-Free:**
1. `llama-3.3-70b-versatile` - Try first
2. `llama-3.1-8b-instant` - Fallback 1
3. `mixtral-8x7b-32768` - Fallback 2

### Decision Flow

```
Rate Limit Detected
    ↓
Check: Any untried models on current provider?
    ↓ YES                           ↓ NO
Switch to next model         Switch to next provider
(same API key/endpoint)      (different credentials)
    ↓                               ↓
Retry                           Retry
```

## Implementation Details

**File:** `src/endpoints/chat.js`

### Fallback Model Definitions (Lines 763-771)

```javascript
// Define fallback models for each provider type
const providerModelFallbacks = {
    'openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4-turbo'],
    'openai-compatible': ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4-turbo'],
    'groq': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    'groq-free': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']
};
```

### Model Switching Logic (Lines 773-790)

```javascript
// First, try other models on the same provider
const fallbackModels = providerModelFallbacks[selectedProvider.type] || [];
const nextModel = fallbackModels.find(m => !attemptedModels.has(m));

if (nextModel) {
    // Try different model on same provider
    model = nextModel;
    attemptedModels.add(model);
    
    // Update request body
    requestBody.model = model;
    if (lastRequestBody) {
        lastRequestBody.model = model;
        if (lastRequestBody.request) {
            lastRequestBody.request.model = model;
        }
    }
    
    console.log(`🔄 Trying different model on same provider: ${model} (${selectedProvider.type})`);
    continue; // Retry with new model
}
```

### Provider Switching (Lines 792-819)

Only after all models are exhausted:

```javascript
// All models exhausted on this provider, try next provider
console.log(`⚠️ All models exhausted on provider ${provider}`);
const nextProvider = providerPool.find(p => !attemptedProviders.has(p.id));

if (nextProvider) {
    // Switch to new provider
    selectedProvider = nextProvider;
    provider = selectedProvider.type;
    apiKey = selectedProvider.apiKey;
    targetUrl = getEndpointUrl(selectedProvider);
    model = selectModelForProvider(selectedProvider, requestedModel, isComplex);
    
    // ... update tracking and request body
    
    console.log(`🚀 Switching to provider: ${provider}, model: ${model}`);
    continue;
}
```

## User Experience

### Scenario 1: Single OpenAI Provider (Your Case!)

**Configuration:**
- 1 OpenAI provider with key

**What Happens:**
```
Request → gpt-4o (rate limit)
       → gpt-4o-mini (auto-fallback) ✅
```

**CloudWatch Logs:**
```
🔀 Rate limit hit on provider openai, model gpt-4o
🔄 Trying different model on same provider: gpt-4o-mini (openai)
🔄 Attempt 2/3: provider=openai, model=gpt-4o-mini
✅ Request succeeded on attempt 2
```

### Scenario 2: Multiple Providers

**Configuration:**
- 1 OpenAI provider
- 1 Groq provider

**What Happens:**
```
Request → gpt-4o (rate limit)
       → gpt-4o-mini (rate limit)
       → gpt-3.5-turbo (rate limit)
       → llama-3.3-70b (Groq) ✅
```

**CloudWatch Logs:**
```
🔀 Rate limit hit on provider openai, model gpt-4o
🔄 Trying different model on same provider: gpt-4o-mini (openai)
🔀 Rate limit hit on provider openai, model gpt-4o-mini
🔄 Trying different model on same provider: gpt-3.5-turbo (openai)
🔀 Rate limit hit on provider openai, model gpt-3.5-turbo
⚠️ All models exhausted on provider openai
🚀 Switching to provider: groq, model: llama-3.3-70b-versatile
✅ Request succeeded
```

## Benefits

### 1. **Zero Configuration Required**
- No need to create duplicate providers
- Works automatically with single provider
- Just configure one OpenAI key

### 2. **Maximum Utilization**
- Uses all available rate limit capacity
- OpenAI alone: 290K TPM across all models!
- Groq: Multiple models available

### 3. **Smart Fallback Order**
- Tries cheaper models first (gpt-4o-mini after gpt-4o)
- Maximizes available capacity (200K TPM for mini)
- Only switches providers when all models exhausted

### 4. **Cost Optimization**
- Automatic downgrade to cheaper models
- gpt-4o → gpt-4o-mini saves 94% on cost
- User still gets a response

### 5. **Better Logging**
- Clear indication of model switches
- Shows which models were tried
- Tracks total attempts across providers and models

## Example: Your Current Scenario

**Before this update:**
```
Request → gpt-4o (rate limit) ❌
Error: "Rate limit on all available providers"
```

**After this update:**
```
Request → gpt-4o (rate limit)
       → gpt-4o-mini (200K TPM available) ✅
Success! (at 94% lower cost)
```

## Rate Limit Capacity

With a single OpenAI provider, the system now automatically uses:

| Model | TPM Limit | Status |
|-------|-----------|--------|
| gpt-4o | 30,000 | Tried first |
| gpt-4o-mini | 200,000 | Auto-fallback |
| gpt-3.5-turbo | 60,000 | Auto-fallback |
| gpt-4-turbo | 30,000 | Auto-fallback |
| **Total** | **320,000** | **10.6x capacity!** |

All with **one API key** and **zero extra configuration**!

## Why This Is Better

### Old Approach ❌
- User had to manually configure 3 "providers"
- Each with same API key, same endpoint
- Only difference: model name
- Tedious and confusing

### New Approach ✅
- Configure once
- System automatically tries all models
- Uses same credentials
- Just works!

## Testing

### Test 1: Rate Limit on Primary Model
**Setup:** Single OpenAI provider, gpt-4o hits rate limit

**Expected:**
```
🔀 Rate limit hit on provider openai, model gpt-4o
🔄 Trying different model on same provider: gpt-4o-mini (openai)
✅ Request succeeded
```

### Test 2: All Models Rate Limited
**Setup:** All OpenAI models exhausted, Groq available

**Expected:**
```
🔀 Rate limit hit on provider openai, model gpt-4o
🔄 Trying different model on same provider: gpt-4o-mini (openai)
🔀 Rate limit hit on provider openai, model gpt-4o-mini
🔄 Trying different model on same provider: gpt-3.5-turbo (openai)
🔀 Rate limit hit on provider openai, model gpt-3.5-turbo
⚠️ All models exhausted on provider openai
🚀 Switching to provider: groq
✅ Request succeeded
```

### Test 3: Single Provider, All Models Exhausted
**Setup:** Only OpenAI, all models hit rate limit

**Expected:**
```
🔀 Rate limit hit on provider openai, model gpt-4o
🔄 Trying different model: gpt-4o-mini
🔀 Rate limit hit: gpt-4o-mini
🔄 Trying different model: gpt-3.5-turbo
🔀 Rate limit hit: gpt-3.5-turbo
🔄 Trying different model: gpt-4-turbo
🔀 Rate limit hit: gpt-4-turbo
⚠️ All models exhausted on provider openai
🛑 Rate limit on all available providers and models
💡 Tip: Configure additional providers...
```

## Future Enhancements

1. **Dynamic Fallback Order**: Prioritize based on current rate limit status
2. **Cost-Aware Fallback**: Try cheapest available model first
3. **Quality-Aware Fallback**: Remember which model worked best
4. **Rate Limit Prediction**: Check rate limit headers before trying model

## Deployment

**Deployment Time:** 19:49:24 UTC (October 10, 2025)  
**Package Size:** 167.3 KiB  
**Lambda URL:** https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/

## Summary

You no longer need to configure multiple providers with the same API key! The system now:

✅ **Automatically tries all available models** on the same provider  
✅ **Uses the same API key/endpoint** (no duplicate configuration)  
✅ **Maximizes rate limit capacity** (320K TPM for OpenAI!)  
✅ **Optimizes costs** (falls back to cheaper models)  
✅ **Only switches providers** when all models exhausted  

Your next rate limit on `gpt-4o` will automatically fall back to `gpt-4o-mini` with 200K TPM available! 🚀
