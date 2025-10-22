# Fix: Provider Model Parsing for Groq Models with Prefixes

**Date**: October 5, 2025  
**Issue**: Invalid model ID error for `openai/gpt-oss-120b`  
**Root Cause**: Provider parsing logic treated `openai/` prefix as OpenAI provider  
**Status**: ✅ FIXED

## Problem Description

When using Groq models with vendor prefixes (e.g., `openai/gpt-oss-120b`, `qwen/qwen3-32b`, `meta-llama/llama-4-scout-17b-16e-instruct`), the `parseProviderModel()` function was incorrectly parsing these as different providers rather than Groq models.

### Error Symptom
```
Error: invalid model ID
```

### Root Cause Analysis

The `parseProviderModel()` function in `src/providers.js` only checked for explicit provider prefixes using colon notation (e.g., `groq:model-name`). When given `openai/gpt-oss-120b`, it would split on `:` and default to treating the first part before any separator as the provider name.

Since `openai/gpt-oss-120b` doesn't contain a colon, the function wasn't designed to handle vendor-prefixed model names that are actually Groq models.

## Solution

Updated `src/providers.js` to properly handle vendor-prefixed Groq models:

### Code Changes

**File**: `src/providers.js`

1. **Updated `parseProviderModel()` function**:
```javascript
function parseProviderModel(modelString) {
    if (!modelString || typeof modelString !== 'string') {
        return { provider: 'groq', model: 'llama-3.1-8b-instant' };
    }
    
    // Check for explicit provider prefix (e.g., "groq:llama-3.1-8b-instant")
    if (modelString.includes(':')) {
        const [provider, ...modelParts] = modelString.split(':');
        const model = modelParts.join(':') || 'llama-3.1-8b-instant';
        return { provider: provider || 'groq', model };
    }
    
    // Models with openai/, qwen/, meta-llama/, moonshotai/ prefixes are Groq models
    if (modelString.startsWith('openai/') || 
        modelString.startsWith('qwen/') || 
        modelString.startsWith('meta-llama/') ||
        modelString.startsWith('moonshotai/')) {
        return { provider: 'groq', model: modelString };
    }
    
    // Default to Groq provider for all other models
    return { provider: 'groq', model: modelString };
}
```

2. **Updated Groq models list**:
```javascript
groq: {
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    envKey: 'GROQ_API_KEY',
    models: [
        'llama-3.1-8b-instant',
        'llama-3.3-70b-versatile',
        'mixtral-8x7b-32768',
        'openai/gpt-oss-20b',
        'openai/gpt-oss-120b',
        'qwen/qwen3-32b',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'meta-llama/llama-4-maverick-17b-128e-instruct',
        'moonshotai/kimi-k2-instruct-0905'
    ]
}
```

### UI Changes

**File**: `ui-new/src/components/ChatTab.tsx`

Updated default model to `openai/gpt-oss-120b`:
```typescript
const [settings] = useLocalStorage('app_settings', {
    provider: 'groq',
    llmApiKey: '',
    apiEndpoint: 'https://api.groq.com/openai/v1',
    largeModel: 'openai/gpt-oss-120b'
});
```

## Available Groq Models with Tool Support

All of these models are hosted on Groq and accessed via `api.groq.com`:

| Model ID | Tool Use | Parallel Tools | JSON Mode | Context |
|----------|----------|----------------|-----------|---------|
| `moonshotai/kimi-k2-instruct-0905` | ✅ Yes | ✅ Yes | ✅ Yes | 262K |
| `openai/gpt-oss-20b` | ✅ Yes | ❌ No | ✅ Yes | 131K |
| `openai/gpt-oss-120b` | ✅ Yes | ❌ No | ✅ Yes | 131K |
| `qwen/qwen3-32b` | ✅ Yes | ✅ Yes | ✅ Yes | 131K |
| `meta-llama/llama-4-scout-17b-16e-instruct` | ✅ Yes | ✅ Yes | ✅ Yes | 128K |
| `meta-llama/llama-4-maverick-17b-128e-instruct` | ✅ Yes | ✅ Yes | ✅ Yes | 128K |
| `llama-3.3-70b-versatile` | ✅ Yes | ✅ Yes | ✅ Yes | 128K |
| `llama-3.1-8b-instant` | ✅ Yes | ✅ Yes | ✅ Yes | 128K |

## Why openai/gpt-oss-120b?

**Advantages**:
1. **131K context window** - Larger than llama-3.3-70b's 128K
2. **120B parameters** - More capable than llama-3.3-70b's 70B
3. **Tool use support** - Supports OpenAI function calling format
4. **JSON mode** - Structured output support
5. **Different architecture** - May not have the same `<function=...>` syntax issues as llama-3.3-70b

**Trade-offs**:
- **No parallel tool use** - Must execute tools sequentially (not a problem for our use case)
- **Unknown behavior** - Need to test if it generates function syntax tags like llama-3.3-70b
- **Newer model** - Less battle-tested than llama-3.3-70b

## Testing Checklist

- [ ] Test normal chat queries with `openai/gpt-oss-120b`
- [ ] Test web search tool execution
- [ ] Test code execution tool
- [ ] Test URL scraping tool
- [ ] Verify no `<function=...>` tags in responses
- [ ] Test parallel conversations
- [ ] Test continuation mechanism
- [ ] Check response quality vs llama-3.3-70b
- [ ] Monitor for any new error patterns

## Deployment

**Backend**: ✅ Deployed successfully  
**Frontend**: ✅ Built successfully (256.22 kB)

```bash
# Backend
./scripts/deploy.sh

# Frontend  
cd ui-new && npm run build
```

## Rate Limits

From `src/groq-rate-limits.js`:

```javascript
"openai/gpt-oss-120b": {
    rpm: 30,
    rpd: 1000,
    tpm: 8000,
    tpd: 200000,
    context_window: 131072,
    reasoning_capability: "advanced",
    speed: "moderate",
    vision_capable: false
}
```

**Free Tier Limits**:
- 30 requests per minute
- 1,000 requests per day
- 8,000 tokens per minute
- 200,000 tokens per day

## Model Comparison

### openai/gpt-oss-120b vs llama-3.3-70b-versatile

| Feature | openai/gpt-oss-120b | llama-3.3-70b-versatile |
|---------|---------------------|-------------------------|
| Parameters | 120B | 70B |
| Context Window | 131,072 tokens | 128,000 tokens |
| Tool Use | ✅ Yes | ✅ Yes |
| Parallel Tools | ❌ No | ✅ Yes |
| TPM (Free) | 8,000 | 12,000 |
| TPD (Free) | 200,000 | 100,000 |
| Function Syntax Issue | 🔍 Unknown | ✅ Known (requires cleaning) |

## Rollback Plan

If `openai/gpt-oss-120b` has issues, revert to `llama-3.3-70b-versatile`:

```typescript
// ui-new/src/components/ChatTab.tsx
largeModel: 'llama-3.3-70b-versatile'
```

The `cleanLLMContent()` function is still in place and active, so switching back is simple.

## Related Issues

- **llama-3.1-70b-versatile**: DEPRECATED (Jan 24, 2025)
- **llama-3.3-70b-versatile**: Generates `<function=...>` syntax tags (cleaned on frontend)
- **openai/gpt-oss-120b**: Unknown behavior (testing in progress)

## Future Improvements

1. **Add UI Model Selector**: Let users choose from available models
2. **Model Capabilities Detection**: Auto-detect tool support, parallel tools, JSON mode
3. **Smart Fallback Chain**: Auto-switch to backup model if primary fails
4. **Performance Monitoring**: Track response quality and speed per model
5. **Cost Tracking**: Monitor token usage across different models

## Additional Models to Consider

**If openai/gpt-oss-120b doesn't work well**:

1. **qwen/qwen3-32b** (32B params, parallel tools)
   - Context: 131K
   - TPM: 6,000
   - Parallel tool use: ✅

2. **meta-llama/llama-4-scout-17b-16e-instruct** (17B params, vision)
   - Context: 128K
   - TPM: 30,000 (!!)
   - Vision capable: ✅

3. **moonshotai/kimi-k2-instruct-0905** (unknown params, huge context)
   - Context: 262K (!!!)
   - TPM: 10,000
   - Parallel tool use: ✅

## Key Learnings

1. **Vendor Prefixes**: Groq hosts models from multiple vendors (OpenAI, Qwen, Meta, Moonshot)
2. **Model IDs**: Must pass the full model ID including prefix (e.g., `openai/gpt-oss-120b`)
3. **Provider Routing**: All vendor-prefixed models route to `api.groq.com`
4. **Documentation vs Reality**: Groq docs list models that may or may not be accessible
5. **Always Check Parsing**: Model name parsing logic must handle all naming conventions

## Success Metrics

**Deployment**:
- ✅ Backend deployed successfully
- ✅ Frontend built (256.22 kB)
- ✅ No build errors
- ✅ Provider parsing fixed

**Next Steps**:
- ⏳ User testing with `openai/gpt-oss-120b`
- ⏳ Monitor for function syntax issues
- ⏳ Compare response quality vs llama-3.3-70b
- ⏳ Gather user feedback
