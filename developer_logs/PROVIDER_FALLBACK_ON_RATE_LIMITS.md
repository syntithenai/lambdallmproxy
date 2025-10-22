# Provider Fallback on Rate Limits - Implementation

**Date:** October 10, 2025  
**Feature:** Intelligent provider fallback when rate limits occur  
**Status:** ✅ Implemented and Deployed

## Overview

The system now automatically switches to alternative providers when a rate limit error occurs, providing seamless failover and improved availability. When one provider hits its rate limit, the system tries the next available provider in the pool before giving up.

## How It Works

### 1. Provider Pool System

When a user makes a request, the system:
1. Builds a **provider pool** from user-configured providers (and environment providers if authorized)
2. Prioritizes free-tier providers first (groq-free, gemini-free), then paid providers
3. Selects the first available provider
4. Tracks all attempted providers to avoid infinite loops

### 2. Rate Limit Detection

The system detects rate limits by checking for:
- Error messages containing "Rate limit" or "rate limit"
- Error code `rate_limit_exceeded`
- Error messages mentioning "tokens per day" (TPD)
- HTTP status code 429
- Error messages containing "429"

### 3. Automatic Fallback Logic

When a rate limit is detected:

```
┌─────────────────────────────────────┐
│   Request with Provider A           │
│   (e.g., OpenAI)                    │
└───────────┬─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│   Rate Limit Error (429)            │
└───────────┬─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│   Check: Other providers available? │
└───────┬───────────────┬─────────────┘
        │ YES           │ NO
        ▼               ▼
┌───────────────┐  ┌─────────────────┐
│ Switch to     │  │ Return error    │
│ Provider B    │  │ to user         │
│ (e.g., Groq)  │  └─────────────────┘
└───────┬───────┘
        │
        ▼
┌─────────────────────────────────────┐
│   Retry with new provider           │
│   - Update API key                  │
│   - Update endpoint URL             │
│   - Select compatible model         │
└─────────────────────────────────────┘
```

### 4. Provider Switching Process

When switching providers, the system updates:

| Component | What Changes | Example |
|-----------|-------------|---------|
| **Provider Type** | `selectedProvider.type` | `openai` → `groq` |
| **API Key** | `apiKey` | OpenAI key → Groq key |
| **Endpoint URL** | `targetUrl` | `api.openai.com/v1/chat/completions` → `api.groq.com/openai/v1/chat/completions` |
| **Model** | `model` | `gpt-4o` → `llama-3.3-70b-versatile` |
| **Request Body** | `requestBody.model` | Updated to match new provider |

## Implementation Details

### Code Structure

**File:** `src/endpoints/chat.js`

#### Helper Functions (Lines 507-549)

```javascript
// Get endpoint URL for a provider
const getEndpointUrl = (provider) => {
    if (provider.apiEndpoint) {
        const baseUrl = provider.apiEndpoint.replace(/\/$/, '');
        return baseUrl.endsWith('/chat/completions') 
            ? baseUrl 
            : `${baseUrl}/chat/completions`;
    }
    // ... provider-specific defaults
};

// Select appropriate model for a provider
const selectModelForProvider = (provider, requestedModel, isComplex) => {
    if (provider.modelName) return provider.modelName;
    
    if (provider.type === 'groq' || provider.type === 'groq-free') {
        const groqModels = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'];
        return requestedModel && groqModels.includes(requestedModel)
            ? requestedModel
            : isComplex ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
    }
    
    if (provider.type === 'openai') {
        const openaiModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-4-turbo'];
        return requestedModel && openaiModels.includes(requestedModel)
            ? requestedModel
            : isComplex ? 'gpt-4o' : 'gpt-4o-mini';
    }
    
    // ... other providers
};
```

#### Provider Tracking (Lines 714-716)

```javascript
const attemptedModels = new Set([model]);
const attemptedProviders = new Set([selectedProvider.id]);
let sameModelRetries = 0;
```

#### Rate Limit Fallback Logic (Lines 761-796)

```javascript
if (isRateLimitError) {
    console.log(`🔀 Rate limit hit on provider ${provider}, model ${model}`);
    
    // Find next available provider
    const nextProvider = providerPool.find(p => !attemptedProviders.has(p.id));
    
    if (nextProvider) {
        // Switch to new provider
        selectedProvider = nextProvider;
        provider = selectedProvider.type;
        apiKey = selectedProvider.apiKey;
        targetUrl = getEndpointUrl(selectedProvider);
        model = selectModelForProvider(selectedProvider, requestedModel, isComplex);
        
        attemptedProviders.add(selectedProvider.id);
        attemptedModels.add(model);
        
        // Update request body
        requestBody.model = model;
        if (lastRequestBody) {
            lastRequestBody.provider = provider;
            lastRequestBody.model = model;
            if (lastRequestBody.request) {
                lastRequestBody.request.model = model;
            }
        }
        
        console.log(`🚀 Switching to provider: ${provider}, model: ${model}`);
        continue; // Retry with new provider
    }
    
    // No more providers available
    console.error(`🛑 Rate limit on all available providers (tried ${attemptedProviders.size} provider(s))`);
    console.log(`💡 Tip: Configure additional providers in your settings for better availability`);
    throw error;
}
```

## User Experience

### Scenario 1: User Has Multiple Providers

**Configuration:**
- Provider 1: OpenAI (gpt-4o)
- Provider 2: Groq (llama-3.3-70b-versatile)

**Behavior:**
1. Request sent to OpenAI
2. OpenAI returns 429 (rate limit)
3. System automatically switches to Groq
4. Request succeeds with Groq
5. User sees response without any error

**CloudWatch Logs:**
```
🎯 Selected provider: openai (source: user)
🔄 Attempt 1/3: provider=openai, model=gpt-4o
❌ Attempt 1 failed: Rate limit reached...
🔀 Rate limit hit on provider openai, model gpt-4o
🚀 Switching to provider: groq, model: llama-3.3-70b-versatile
🔄 Attempt 2/3: provider=groq, model=llama-3.3-70b-versatile
✅ Request succeeded on attempt 2
```

### Scenario 2: User Has Only One Provider

**Configuration:**
- Provider 1: OpenAI (gpt-4o)

**Behavior:**
1. Request sent to OpenAI
2. OpenAI returns 429 (rate limit)
3. No alternative providers available
4. Error returned to user with helpful message

**Error Message:**
```json
{
  "error": "Rate limit reached for gpt-4o...",
  "code": "RATE_LIMIT_ERROR",
  "message": "Rate limit on all available providers (tried 1 provider(s))",
  "tip": "Configure additional providers in your settings for better availability"
}
```

### Scenario 3: All Providers Hit Rate Limits

**Configuration:**
- Provider 1: OpenAI
- Provider 2: Groq
- Provider 3: Gemini

**Behavior:**
1. OpenAI → Rate limit → Switch to Groq
2. Groq → Rate limit → Switch to Gemini
3. Gemini → Rate limit → No more providers
4. Error returned after trying all 3

## Benefits

1. **Improved Availability**: System continues working when one provider is rate-limited
2. **Transparent Failover**: Users don't see errors when alternatives exist
3. **Cost Optimization**: Can configure free-tier providers as fallbacks for paid providers
4. **Better UX**: Seamless experience even during high load
5. **Debugging**: Clear CloudWatch logs show exactly which providers were tried

## Configuration Best Practices

### Recommended Setup

```javascript
// In UI Settings:
providers: [
    {
        id: "primary-openai",
        type: "openai",
        apiKey: "sk-...",
        enabled: true
    },
    {
        id: "fallback-groq",
        type: "groq-free",  // Free tier as fallback
        apiKey: "gsk_...",
        enabled: true
    },
    {
        id: "fallback-gemini",
        type: "gemini-free",
        apiKey: "AIza...",
        enabled: true
    }
]
```

### Provider Priority

The system tries providers in this order:
1. **Free-tier providers first** (groq-free, gemini-free)
2. **Paid providers second** (openai, groq, gemini, together)
3. **Custom providers last** (openai-compatible)

This prioritization ensures free resources are used before incurring costs.

## Testing

### Manual Test Cases

✅ **Test 1: Single provider with rate limit**
- Configure only OpenAI
- Trigger rate limit (heavy usage)
- Verify error message includes tip about configuring more providers

✅ **Test 2: Two providers, first hits rate limit**
- Configure OpenAI + Groq
- Trigger OpenAI rate limit
- Verify automatic switch to Groq
- Verify request succeeds

✅ **Test 3: All providers hit rate limits**
- Configure 3 providers
- Trigger rate limits on all
- Verify error shows "tried 3 provider(s)"

### CloudWatch Monitoring

Look for these log patterns:
```
🔀 Rate limit hit on provider openai
🚀 Switching to provider: groq
✅ Request succeeded on attempt 2
```

## Limitations

1. **No mid-stream switching**: Once a streaming response starts, we can't switch providers
2. **No conversation context switching**: Each provider switch starts fresh (no shared context)
3. **Model capabilities vary**: Some models may not support same tools/features
4. **Response quality varies**: Different providers may give different quality responses

## Future Improvements

1. **Smart provider selection**: Choose based on model capabilities, not just availability
2. **Load balancing**: Distribute requests across providers proactively
3. **Cost tracking**: Track which provider costs how much per request
4. **Provider health monitoring**: Detect slow/failing providers early
5. **Retry with backoff**: Wait before retrying same provider on rate limit
6. **User notifications**: Notify users when fallback occurs (optional)

## Related Documentation

- [Provider Pool and Endpoint Fix](./PROVIDER_POOL_AND_ENDPOINT_FIX.md) - Initial provider system implementation
- [Rate Limit Cross-Provider Fix](./RATE_LIMIT_CROSS_PROVIDER_FIX.md) - Previous attempt (removed model switching)
- [Model Validation Fix](./MODEL_VALIDATION_FIX.md) - Ensures model matches provider

## Deployment

**Deployment Time:** 19:38:09 UTC (October 10, 2025)  
**Package Size:** 167.0 KiB  
**Lambda URL:** https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/

## Summary

The provider fallback system enables resilient operation by automatically switching to alternative providers when rate limits occur. This dramatically improves availability and user experience, especially during high-load periods or when using free-tier providers with limited quotas.

Users with multiple configured providers now get seamless failover, while users with a single provider receive helpful error messages encouraging them to add alternatives.
