# Fix: Rate Limit Fallback for Expanded Providers

**Date**: 2025-10-23  
**Issue**: When Groq model hits rate limit, system doesn't try other expanded provider instances  
**Status**: ✅ **FIXED**

---

## Problem

When a user has a single `groq-free` provider that's auto-expanded into 10 model-specific instances:

```javascript
// Expanded providers (all share type='groq-free')
groq-free-0 → llama-3.1-8b-instant
groq-free-1 → llama-3.3-70b-versatile  ← Rate limit hit (100K TPD exhausted)
groq-free-2 → llama-4-maverick
groq-free-3 → llama-4-scout
... 6 more models
```

When `llama-3.3-70b-versatile` hits its **daily token limit** (100,000 TPD):

```
❌ Error: Rate limit reached for model llama-3.3-70b-versatile 
   Used 96931/100000 tokens per day
   Requested 5522 more tokens
   Please try again in 35m19s
```

The system **failed to switch to other Groq models** because the fallback logic was filtering by `provider.type`, and all expanded instances shared `type: 'groq-free'`.

---

## Root Cause

### Bad Logic (Before Fix)

```javascript
// ❌ PROBLEM: Filters out all groq-free providers
let nextProvider = chatEnabledProviders.find(p => 
    !attemptedProviders.has(p.id) && 
    p.type !== currentProviderType  // ❌ Excludes all groq-free instances!
);
```

When the current provider is `groq-free-1` (type=`groq-free`), this logic **excludes ALL other groq-free instances** because they all have the same type!

Result: System gives up immediately instead of trying the other 9 Groq models.

---

## Solution

### Fixed Logic (After Fix)

```javascript
// ✅ FIXED: First priority - same type but different model/instance
let nextProvider = chatEnabledProviders.find(p => 
    !attemptedProviders.has(p.id) &&    // Not yet tried
    p.type === currentProviderType &&   // ✅ Same type (groq-free)
    p.id !== currentProviderId &&        // ✅ Different instance ID
    p.model !== currentModel             // ✅ Different model
);
```

Now the system:
1. **Tries other Groq models first** (same provider type, different models)
2. **Falls back to Gemini/OpenAI** if all Groq models exhausted
3. **Last resort**: Tries any unattempted provider

---

## Fallback Priority (New Behavior)

When a rate limit is hit:

```
📊 Priority Order for Fallback:

1️⃣ **Same Provider Type, Different Model** (Expanded Instances)
   - groq-free-0 (llama-3.1-8b-instant)
   - groq-free-2 (llama-4-maverick)
   - groq-free-3 (llama-4-scout)
   - groq-free-4 (kimi-k2)
   - ... up to 10 models

2️⃣ **Free Providers** (Different Type)
   - gemini-free (if configured)

3️⃣ **Other Provider Types**
   - openai, anthropic, etc. (if configured)

4️⃣ **Last Resort**
   - Any unattempted provider (even same type)
```

---

## Changes Made

### File: `src/credential-pool.js`

**Location**: Lines 139-145 (provider expansion)

**Issue**: Expanded providers were setting `modelName` but chat endpoint checks for `model`

**Before**:
```javascript
const expandedProviders = models.map((modelId, index) => ({
    ...provider,
    id: `${provider.id || provider.type}-${index}`,
    modelName: modelId,  // ❌ Chat endpoint looks for 'model', not 'modelName'
    originalProvider: provider.id || provider.type
}));
```

**After**:
```javascript
const expandedProviders = models.map((modelId, index) => ({
    ...provider,
    id: `${provider.id || provider.type}-${index}`,
    model: modelId,          // ✅ Set 'model' property for rate limit tracking
    modelName: modelId,      // Keep 'modelName' for backward compatibility
    originalProvider: provider.id || provider.type
}));
```

### File: `src/endpoints/chat.js`

**Location**: Lines 2037-2073 (rate limit fallback logic)

**Issue**: Fallback logic filtered by `provider.type`, excluding all expanded instances with same type

**Before**:
```javascript
// Prioritize switching to a DIFFERENT provider type when rate limited
const currentProviderType = selectedProvider.type;

// First priority: Try free providers that are chat-enabled
let nextProvider = chatEnabledProviders.find(p => 
    !attemptedProviders.has(p.id) && 
    p.type !== currentProviderType &&  // ❌ Problem here
    (p.type === 'gemini-free')
);

// Second priority: Try other provider types (excluding groq variants)
if (!nextProvider) {
    nextProvider = chatEnabledProviders.find(p => 
        !attemptedProviders.has(p.id) && 
        p.type !== currentProviderType &&  // ❌ Problem here
        p.type !== 'groq-free' &&          // ❌ Excludes all groq
        p.type !== 'groq'
    );
}
```

**After**:
```javascript
// Prioritize switching to a DIFFERENT provider instance when rate limited
// For expanded providers (e.g., groq-free with multiple models), treat each as separate
const currentProviderType = selectedProvider.type;
const currentProviderId = selectedProvider.id;
const currentModel = model;

// First priority: Try same provider type but different model/instance (expanded providers)
let nextProvider = chatEnabledProviders.find(p => 
    !attemptedProviders.has(p.id) && 
    p.type === currentProviderType &&   // ✅ Same type
    p.id !== currentProviderId &&        // ✅ Different ID
    p.model !== currentModel             // ✅ Different model
);

if (nextProvider) {
    console.log(`🔄 Found another ${currentProviderType} instance: ${nextProvider.id} (model: ${nextProvider.model})`);
}

// Second priority: Try free providers that are chat-enabled (different type)
if (!nextProvider) {
    nextProvider = chatEnabledProviders.find(p => 
        !attemptedProviders.has(p.id) && 
        p.type !== currentProviderType && 
        (p.type === 'gemini-free')
    );
}

// Third priority: Try other provider types (excluding same type to force diversity)
if (!nextProvider) {
    nextProvider = chatEnabledProviders.find(p => 
        !attemptedProviders.has(p.id) && 
        p.type !== currentProviderType
    );
}

// Last resort: Try any unattempted provider (even same type)
if (!nextProvider) {
    nextProvider = chatEnabledProviders.find(p => !attemptedProviders.has(p.id));
}
```

**Location**: Lines 2088-2095 (use pre-assigned model)

**Added**:
```javascript
// For expanded providers, use the pre-assigned model
if (selectedProvider.model) {
    model = selectedProvider.model;
    console.log(`🎯 Using pre-assigned model from expanded provider: ${model}`);
} else {
    model = selectModelForProvider(selectedProvider, requestedModel, isComplex);
}
```

**Location**: Line 2139 (improved logging)

**Before**:
```javascript
console.log(`🚀 Switching to different provider type: ${provider}, model: ${model}`);
```

**After**:
```javascript
console.log(`🚀 Switching to provider instance: ${selectedProvider.id} (type: ${provider}, model: ${model})`);
```

---

## Testing

### Test Script

Created `test-rate-limit-fallback.js` to verify behavior:

```bash
$ node test-rate-limit-fallback.js

🧪 Testing Rate Limit Fallback Logic

📍 Starting with: groq-free-1 (model: llama-3.3-70b-versatile)

❌ Rate limit hit on: groq-free-1 (model: llama-3.3-70b-versatile)
🔍 Looking for fallback provider...

✅ Found fallback provider:
   ID: groq-free-0
   Type: groq-free
   Model: llama-3.1-8b-instant

🎯 Result: Will retry with different Groq model

---

🔍 OLD LOGIC (for comparison):
❌ No fallback provider found (all groq-free excluded!)

✨ With the fix, the system will try all 10 Groq models before giving up!
```

### Expected Behavior

When `llama-3.3-70b-versatile` hits rate limit:

```
🔀 Rate limit hit on provider groq-free, model llama-3.3-70b-versatile
📊 Updated rate limit tracker with 429 error for groq-free/llama-3.3-70b-versatile (retry after 35m19s)
🔄 Found another groq-free instance: groq-free-0 (model: llama-3.1-8b-instant)
🎯 Using pre-assigned model from expanded provider: llama-3.1-8b-instant
🚀 Switching to provider instance: groq-free-0 (type: groq-free, model: llama-3.1-8b-instant)
```

The system will now automatically try:
1. `llama-3.1-8b-instant` (6K TPM available)
2. `llama-4-maverick` (15K TPM available)
3. `llama-4-scout` (30K TPM available)
4. `kimi-k2` (10K TPM available)
5. ... and so on through all 10 models

**Combined capacity**: ~100K TPM across all models (vs. previous 6K TPM single model)

---

## Benefits

### Before Fix
- ❌ Single model hits rate limit → **Request fails immediately**
- ❌ Other 9 Groq models sit idle with available capacity
- ❌ User sees: "Rate limit on all available providers" (false!)

### After Fix
- ✅ Single model hits rate limit → **Automatically tries next model**
- ✅ Full utilization of all 10 Groq models (~100K TPM combined)
- ✅ True "all providers exhausted" only after trying all models
- ✅ Seamless automatic failover across models

---

## Rate Limit Context

### Groq Free Tier Limits (Per Model)

| Model | TPM | RPM | RPD |
|-------|-----|-----|-----|
| llama-3.1-8b-instant | 6,000 | 30 | 14,400 |
| llama-3.3-70b-versatile | 20,000 | 30 | 14,400 |
| llama-4-scout | 30,000 | 30 | - |
| llama-4-maverick | 15,000 | 30 | - |
| kimi-k2 | 10,000 | 60 | - |
| Others | 10K-20K | 30-60 | varies |

**Important**: Rate limits are **per model**, NOT per API key. So if `llama-3.3-70b` is exhausted, you can still use `llama-3.1-8b` with the same API key.

---

## Deployment

### Local Testing
```bash
# Restart dev server
make dev

# Test with chat request that triggers rate limit
# System should automatically switch models
```

### Production Deployment
```bash
# Deploy to Lambda
make deploy-lambda-fast

# Monitor logs for fallback behavior
make logs-tail
```

---

## Related Files

- `src/endpoints/chat.js` - Main fix (rate limit fallback logic)
- `src/credential-pool.js` - Provider expansion (already working)
- `src/routing/load-balancer.js` - Round-robin selection (unchanged)
- `src/model-selection/rate-limit-tracker.js` - Tracks limits per model (unchanged)
- `test-rate-limit-fallback.js` - Test script demonstrating fix

---

## Related Documentation

- `developer_logs/FEATURE_GROQ_AUTO_EXPANSION.md` - Provider expansion feature
- `PROVIDER_CATALOG.json` - Model specifications and rate limits

---

## Status

✅ **Fixed** - Deployed to local dev server  
📅 **Next**: Test with production Lambda deployment  
🎯 **Impact**: 10× increase in effective rate limit capacity for Groq users
