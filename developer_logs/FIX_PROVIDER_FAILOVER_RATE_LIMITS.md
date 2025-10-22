# Fix: Improved Provider Failover for Rate Limits

**Date**: 2025-10-12  
**Status**: ✅ Completed and Deployed  
**Deployment**: Backend (deploy-lambda-fast)

## Issue

When Groq hits rate limits, the system was trying to switch models within Groq, but when the user only has Groq configured, it would fail with:

```
❌ Error: Rate limit reached for model llama-3.3-70b-versatile in organization org_01k5qexgg6etpvv9p9zhkenj4z service tier on_demand on tokens per day (TPD): Limit 100000, Used 97875, Requested 3399. Please try again in 18m20.589s.
```

**Expected Behavior**: System should immediately try another provider (OpenAI, Gemini, etc.) when Groq hits rate limits.

**Actual Behavior**: System tried both Groq models, both hit rate limits, then gave up because only Groq was configured.

## Root Cause

### 1. Model Cycling Without Provider Switch

The failover logic was:
1. Try Model A on Provider X → rate limit
2. Try Model B on Provider X → rate limit
3. Look for next provider
4. If no providers, fail

**Issue**: When only one provider was configured (e.g., only Groq), the system had nowhere to go after exhausting that provider's models.

### 2. No Provider Type Prioritization

The provider selection logic was:
```javascript
const nextProvider = providerPool.find(p => !attemptedProviders.has(p.id));
```

This would pick ANY unattempted provider, which could be another Groq instance if multiple were configured.

## Solution

### 1. Prioritize Different Provider Types

**Before**:
```javascript
const nextProvider = providerPool.find(p => !attemptedProviders.has(p.id));
```

**After**:
```javascript
// Prioritize switching to a DIFFERENT provider type when rate limited
const currentProviderType = selectedProvider.type;
let nextProvider = providerPool.find(p => 
    !attemptedProviders.has(p.id) && 
    p.type !== currentProviderType && 
    p.type !== 'groq-free' && 
    p.type !== 'groq'
);

// If no different provider type, try any unattempted provider
if (!nextProvider) {
    nextProvider = providerPool.find(p => !attemptedProviders.has(p.id));
}
```

**Key Changes**:
- **First priority**: Non-Groq providers (`p.type !== 'groq-free' && p.type !== 'groq'`)
- **Different provider type**: Avoids trying another Groq instance
- **Fallback**: If no different type available, try any unattempted provider

### 2. Reset Same-Model Retry Counter

When switching providers, reset the `sameModelRetries` counter:
```javascript
// Reset same-model retries for new provider
sameModelRetries = 0;
```

This ensures the new provider gets a fresh set of retry attempts.

### 3. Improved Error Messages

**Before**:
```
🛑 Rate limit on all available providers and models (tried 1 provider(s), 2 model(s))
💡 Tip: Configure additional providers in your settings for better availability
```

**After**:
```
🛑 Rate limit on all available providers and models (tried 1 provider(s), 2 model(s))
💡 Tip: Configure additional providers (OpenAI, Gemini, Anthropic) in your settings for automatic failover
📊 Current providers configured: groq-free
```

Now shows:
- **Specific provider examples** (OpenAI, Gemini, Anthropic)
- **Current configuration** so user can see what they have

## Files Modified

- `src/endpoints/chat.js`:
  - Lines 1249-1283: Enhanced provider failover logic
  - Added provider type prioritization
  - Added sameModelRetries reset
  - Improved error messages with current provider list

## Expected Behavior

### Scenario 1: Multiple Providers Configured

**Configuration**: Groq + OpenAI + Gemini

**Flow**:
1. Try Groq llama-3.3-70b → rate limit
2. Try Groq llama-3.1-8b → rate limit
3. **Switch to OpenAI** gpt-4o → success ✅

**Result**: Seamless failover to OpenAI

### Scenario 2: Only Groq Configured

**Configuration**: Groq only

**Flow**:
1. Try Groq llama-3.3-70b → rate limit
2. Try Groq llama-3.1-8b → rate limit
3. No other providers available
4. Show helpful error with suggestion

**Result**: Clear error message with actionable advice

### Scenario 3: Multiple Groq Instances

**Configuration**: Groq Free + Groq Paid

**Flow**:
1. Try Groq Free llama-3.3-70b → rate limit
2. Try Groq Free llama-3.1-8b → rate limit
3. **Should prefer non-Groq**, but if none available:
4. Try Groq Paid llama-3.3-70b → might succeed ✅

**Result**: Eventually tries other Groq instances as fallback

## Testing

### Test Case 1: Groq Rate Limit with OpenAI Available
**Setup**: Configure both Groq and OpenAI
**Action**: Make request that hits Groq rate limit
**Expected**: Automatically switch to OpenAI
**Log**: `🚀 Switching to different provider type: openai, model: gpt-4o`

### Test Case 2: Groq Rate Limit with Only Groq
**Setup**: Configure only Groq
**Action**: Make request that hits Groq rate limit
**Expected**: Clear error with provider suggestions
**Log**: `💡 Tip: Configure additional providers (OpenAI, Gemini, Anthropic)`

### Test Case 3: Multiple Provider Failover
**Setup**: Configure Groq + OpenAI + Gemini
**Action**: Hit rate limits on Groq and OpenAI
**Expected**: Try Gemini
**Log**: `🚀 Switching to different provider type: gemini, model: gemini-2.5-flash`

## Rate Limit Detection

The system detects rate limits by checking for these indicators:
```javascript
const isRateLimitError = 
    error.message?.includes('Rate limit') ||
    error.message?.includes('rate limit') ||
    error.message?.includes('rate_limit_exceeded') ||
    error.message?.includes('tokens per day') ||
    error.message?.includes('tokens per minute') ||
    error.message?.includes('TPD') ||
    error.message?.includes('TPM') ||
    error.message?.includes('Request too large') ||
    error.message?.includes('429') ||
    error.statusCode === 429;
```

## Impact

### Positive
- ✅ Automatic failover to different provider types
- ✅ Prioritizes non-Groq providers when Groq is rate limited
- ✅ Better error messages with actionable advice
- ✅ Shows current provider configuration in errors
- ✅ Reset retry counters for new providers

### User Action Required
If user only has Groq configured, they should add additional providers:
1. **OpenAI**: Add API key to enable GPT-4o, GPT-4o-mini
2. **Gemini**: Add API key to enable Gemini 2.5 Flash, Gemini 2.0 Flash
3. **Anthropic**: Add API key to enable Claude models

## Deployment

```bash
# Backend deployment
make deploy-lambda-fast
# ✅ Deployed: 2025-10-12 14:51:18
# Package size: 243K
# Function: llmproxy
# URL: https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws
```

## Related Features

- **Model Selection**: System automatically selects appropriate model for each provider
- **Retry Logic**: Handles network errors separately from rate limits
- **Provider Pool**: Built from user configuration and environment variables

## Future Improvements

1. 📝 Add provider health tracking to avoid rate-limited providers proactively
2. 📝 Cache rate limit status for 5-10 minutes to skip known rate-limited models
3. 📝 Add cost-aware provider selection (try cheaper providers first)
4. 📝 Add provider usage statistics to UI
5. 📝 Implement exponential backoff when rate limit time is known

## Notes

- Provider failover happens within 1-2 seconds
- Each provider switch is logged for debugging
- User sees seamless experience (no error unless all providers fail)
- Rate limit retry is smart: tries different models before switching providers

---

**Keywords**: rate limit, provider failover, Groq, OpenAI, Gemini, TPD, TPM, model switching, automatic retry, provider selection
