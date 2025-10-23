# Groq Provider Auto-Expansion for Load Balancing

**Date**: October 23, 2025  
**Feature**: Automatic expansion of groq-free providers into model-specific instances

---

## Problem

When a user configures a single `groq-free` provider through the UI:
- Only **1 provider instance** was created
- Rate limits applied to **all requests** using that single provider
- When hitting 429 errors, there was **no failover** to other models
- User experienced delays waiting for rate limit cooldowns

**Example**: User enables Groq with their API key → System creates 1 provider → All requests use same model → Rate limited → No alternatives available

---

## Solution

**Backend Auto-Expansion**: When a `groq-free` or `groq` provider is detected without a specific model, the system automatically expands it into **multiple provider instances** (one per available model).

### How It Works

1. **User Configures Provider** (via UI):
   ```json
   {
     "type": "groq-free",
     "apiKey": "gsk_xxx",
     "enabled": true
   }
   ```

2. **Backend Expands** (in `credential-pool.js`):
   - Reads `PROVIDER_CATALOG.json` to get all available models
   - Filters out guardrail models (llama-guard-4-12b)
   - Creates 1 provider instance per model:
   ```json
   [
     { "id": "groq-free-0", "type": "groq-free", "apiKey": "gsk_xxx", "modelName": "llama-3.1-8b-instant" },
     { "id": "groq-free-1", "type": "groq-free", "apiKey": "gsk_xxx", "modelName": "llama-3.3-70b-versatile" },
     { "id": "groq-free-2", "type": "groq-free", "apiKey": "gsk_xxx", "modelName": "meta-llama/llama-4-maverick-17b-128e-instruct" },
     // ... 7 more models
   ]
   ```

3. **Load Balancer Distributes** (in `load-balancer.js`):
   - Uses round-robin across all 10 providers
   - Automatically skips rate-limited providers
   - Rotates through different models on each request

### Result

- **1 UI provider** → **10 backend providers** → **10× rate limit capacity**
- Automatic failover when one model is rate-limited
- Balanced load across all Groq models
- No user configuration needed

---

## Implementation Details

### Files Modified

1. **`src/credential-pool.js`**
   - Added `getAvailableModelsForProvider()` - Reads catalog, filters available models
   - Added `expandProviderForLoadBalancing()` - Expands single provider into multiple
   - Modified `buildProviderPool()` - Applies expansion to all providers

2. **New Functions**:
   ```javascript
   // Get models from catalog
   getAvailableModelsForProvider('groq-free')
   // Returns: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', ...]

   // Expand provider
   expandProviderForLoadBalancing({type: 'groq-free', apiKey: 'xxx'})
   // Returns: [
   //   {id: 'groq-free-0', modelName: 'llama-3.1-8b-instant', ...},
   //   {id: 'groq-free-1', modelName: 'llama-3.3-70b-versatile', ...},
   //   ...
   // ]
   ```

### Expansion Rules

| Provider Type | Expansion Behavior |
|--------------|-------------------|
| `groq-free` (no model) | ✅ Expands to 10 models |
| `groq` (no model) | ✅ Expands to 10 models |
| `groq-free` (with model) | ❌ No expansion (uses specified model) |
| `openai` | ❌ No expansion |
| `gemini-free` | ❌ No expansion |
| Other providers | ❌ No expansion |

### Models Included (from PROVIDER_CATALOG.json)

1. `llama-3.1-8b-instant` - Fast, 560 tps
2. `llama-3.3-70b-versatile` - Powerful, 280 tps
3. `meta-llama/llama-4-maverick-17b-128e-instruct` - Vision, 600 tps
4. `meta-llama/llama-4-scout-17b-16e-instruct` - Vision, 750 tps
5. `moonshotai/kimi-k2-instruct` - 262K context, 200 tps
6. `moonshotai/kimi-k2-instruct-0905` - 262K context, 200 tps
7. `openai/gpt-oss-20b` - Open source, 1000 tps
8. `openai/gpt-oss-120b` - Large, 500 tps
9. `qwen/qwen3-32b` - Alibaba, 400 tps
10. `allam-2-7b` - Arabic-focused

**Excluded**: `meta-llama/llama-guard-4-12b` (guardrail model, not for chat)

---

## Load Balancing Behavior

### Request Distribution

```
Request 1 → Provider 0 (llama-3.1-8b-instant)
Request 2 → Provider 1 (llama-3.3-70b-versatile)
Request 3 → Provider 2 (llama-4-maverick)
Request 4 → Provider 3 (llama-4-scout)
...
Request 10 → Provider 9 (allam-2-7b)
Request 11 → Provider 0 (back to start)
```

### Rate Limit Handling

```
Request 1 → Provider 0 ✅ Success
Request 2 → Provider 1 ✅ Success
Request 3 → Provider 2 ❌ Rate limited (429)
Request 4 → Provider 3 ✅ Success (skipped #2)
Request 5 → Provider 4 ✅ Success
...
Request N → Provider 2 ✅ Success (rate limit expired)
```

### Per-Provider Rate Limits (Free Tier)

- **llama-3.1-8b-instant**: 6K TPM, 30 RPM, 14.4K RPD
- **llama-3.3-70b-versatile**: 12K TPM, 30 RPM, 1K RPD
- **llama-4-scout**: 30K TPM, 30 RPM, 1K RPD ⭐ Highest TPM
- **llama-4-maverick**: 6K TPM, 30 RPM, 1K RPD
- **kimi-k2**: 10K TPM, 60 RPM, 1K RPD ⭐ Highest RPM
- **gpt-oss-20b**: 8K TPM, 30 RPM, 1K RPD
- **gpt-oss-120b**: 8K TPM, 30 RPM, 1K RPD
- **qwen3-32b**: 6K TPM, 60 RPM, 1K RPD
- **allam-2-7b**: 6K TPM, 30 RPM, 7K RPD

**Combined Capacity**: ~100K TPM across all models!

---

## Testing

### Test Script

Run `node test-provider-expansion.js` to verify:
- ✅ Single groq-free provider expands to 10 models
- ✅ Providers with specific models don't expand
- ✅ Non-Groq providers pass through unchanged

### Manual Testing

1. Configure 1 Groq provider in UI
2. Send multiple requests quickly
3. Observe logs showing different models used:
   ```
   Request 1 using groq-free-0 (llama-3.1-8b-instant)
   Request 2 using groq-free-1 (llama-3.3-70b-versatile)
   Request 3 using groq-free-2 (llama-4-maverick)
   ```
4. Hit rate limit on one model → Automatically skips to next

---

## Benefits

### For Users
- ✅ **10× rate limit capacity** - Distribute load across models
- ✅ **Automatic failover** - No manual switching needed
- ✅ **No configuration** - Works out of the box
- ✅ **Diverse models** - Get responses from fast, powerful, vision, or long-context models

### For System
- ✅ **Better resilience** - Multiple fallback options
- ✅ **Load distribution** - Spread requests across Groq infrastructure
- ✅ **Transparent** - No UI changes needed
- ✅ **Flexible** - Easy to add/remove models in catalog

---

## Migration Notes

### Backward Compatibility
- ✅ Existing providers continue to work
- ✅ Environment providers (LLAMDA_LLM_PROXY_PROVIDER_*) also expanded
- ✅ No breaking changes to API
- ✅ Users with specific models set are unaffected

### Production Deployment
```bash
# Test locally first
make dev

# Deploy when ready
make deploy-lambda-fast
```

### Monitoring
Check logs for expansion messages:
```
🔄 Expanded groq-free into 10 model-specific providers for load balancing
🎯 Final provider pool size: 10 provider(s)
```

---

## Future Enhancements

### Potential Improvements
1. **Smart Model Selection**
   - Route simple queries to fast models (llama-3.1-8b)
   - Route complex queries to powerful models (llama-3.3-70b)
   - Route vision queries to vision models (llama-4-scout/maverick)

2. **Cost-Aware Load Balancing**
   - When paid tier, prefer cheaper models first
   - Track spending per model

3. **Performance-Based Routing**
   - Track response times per model
   - Prefer faster models for real-time use cases

4. **Dynamic Expansion**
   - Check model availability at runtime
   - Disable models that consistently fail

---

## Summary

**Before**: 1 Groq provider → Rate limited frequently → Poor UX  
**After**: 1 Groq provider → 10 model instances → 10× capacity → Automatic failover → Excellent UX

Users now get transparent load balancing across all Groq models without any configuration! 🚀
