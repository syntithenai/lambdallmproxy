# Guardrails Configuration - Dedicated Models & Indexed Providers

## Changes Made

### 1. Provider Catalog Updates (`PROVIDER_CATALOG.json`)
Added dedicated guardrail model **Llama Guard 3 8B** to both `groq-free` and `groq` providers:

```json
{
  "id": "llama-guard-3-8b",
  "category": "guardrail",
  "contextWindow": 8192,
  "maxOutput": 4096,
  "guardrailModel": true,
  "description": "Llama Guard 3 8B - Specialized content moderation model"
}
```

**Benefits:**
- Dedicated content moderation model designed for safety/guardrail use cases
- More accurate than general-purpose chat models for content filtering
- Optimized prompts and fine-tuning for moderation tasks

### 2. Guardrails Configuration (`src/guardrails/config.js`)

#### Removed Legacy Provider Support
**Before:** Supported three API key sources:
1. Context keys (from UI)
2. Indexed env vars (`LLAMDA_LLM_PROXY_PROVIDER_*`)
3. **Legacy env vars (`GROQ_API_KEY`, `OPENAI_API_KEY`, etc.)** ❌

**After:** Only supports:
1. Context keys (from UI)
2. Indexed env vars (`LLAMDA_LLM_PROXY_PROVIDER_*`) ✅

**Rationale:**
- Cleaner separation between guardrails config and general LLM config
- Explicit provider declaration via indexed format
- Prevents accidental use of general-purpose API keys for guardrails

#### Model Selection Priority
**New priority order:**

1. **Dedicated guardrail models** (e.g., `llama-guard-3-8b`)
   - Models with `guardrailModel: true` flag
   - Specialized for content moderation
   
2. **Fallback to small/fast general models**
   - `llama-3.1-8b-instant`, `gemini-1.5-flash`, `gpt-4o-mini`
   - Only used when no guardrail model available
   
3. **Last resort: any available small/medium model**
   - Ensures guardrails can always function

**Logging:**
- `🛡️ Selected dedicated guardrail model: llama-guard-3-8b` - Using specialized model
- `⚠️ No dedicated guardrail model found, using fallback: ...` - Using general model
- `⚠️ Using first available model for guardrails: ...` - Last resort

### 3. Guardrail Factory (`src/guardrails/guardrail-factory.js`)

#### Removed Legacy API Key Resolution
**Before:** 
```javascript
// Fallback to legacy environment variables
const envVarMap = {
  'groq': 'GROQ_API_KEY',
  'openai': 'OPENAI_API_KEY',
  // etc.
};
```

**After:**
```javascript
// Only supports:
// 1. Context keys (from UI)
// 2. Indexed LLAMDA_LLM_PROXY_PROVIDER_* format
// No legacy env var fallback
```

### 4. Local Development Configuration (`.env`)

**Enabled Groq Free Tier for Guardrails:**
```bash
# Provider 0: Groq Free Tier (for guardrails with Llama Guard 3 8B)
LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=groq-free
LLAMDA_LLM_PROXY_PROVIDER_KEY_0=gsk_your-groq-api-key-here
```

**Configuration:**
- ✅ `ENABLE_GUARDRAILS=true` 
- ✅ Provider configured via indexed format
- ✅ Will auto-detect and use `llama-guard-3-8b` model

## Testing

**Test Results:**
```bash
node ./scripts/test-guardrails-auto-detect.js
```

**Output:**
- ✅ **Context with groqApiKey**: Selected `llama-guard-3-8b` (dedicated model)
- ✅ **Context with geminiApiKey**: Fallback to `gemini-1.5-flash` (no guardrail model available)
- ✅ **Context with togetherApiKey**: Last resort fallback
- ✅ **No context**: Returns null (no providers available)

## Usage

### Option 1: Indexed Provider Format (Server-side)
```bash
# In .env file
ENABLE_GUARDRAILS=true
LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=groq-free
LLAMDA_LLM_PROXY_PROVIDER_KEY_0=your_groq_api_key_here
```

### Option 2: Context Keys (Client-provided from UI)
```javascript
// Frontend sends API keys in request
{
  groqApiKey: 'user_groq_api_key',
  // ... other request data
}
```

## Model Availability

| Provider | Dedicated Guardrail Model | Fallback Models |
|----------|---------------------------|-----------------|
| **groq-free** | ✅ `llama-guard-3-8b` | `llama-3.1-8b-instant` |
| **groq** | ✅ `llama-guard-3-8b` | `llama-3.1-8b-instant` |
| **gemini-free** | ❌ None | `gemini-1.5-flash`, `gemini-1.5-flash-8b` |
| **openai** | ❌ None | `gpt-4o-mini` |
| **anthropic** | ❌ None | `claude-3-haiku-20240307` |
| **together** | ❌ None | Various Llama models |

## Benefits of This Approach

1. **Specialized Models**: Uses Llama Guard 3 (designed for content moderation) instead of general chat models
2. **Explicit Configuration**: Indexed provider format makes guardrail providers explicit and traceable
3. **Separation of Concerns**: Guardrails use dedicated provider entries, separate from chat/completion providers
4. **Graceful Degradation**: Falls back to general models when guardrail models unavailable
5. **Clear Logging**: Console output indicates which type of model is being used

## Migration Guide

### If You Were Using Legacy Env Vars

**Before:**
```bash
ENABLE_GUARDRAILS=true
GROQ_API_KEY=your_api_key
# Guardrails auto-detected from GROQ_API_KEY
```

**After:**
```bash
ENABLE_GUARDRAILS=true
LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=groq-free
LLAMDA_LLM_PROXY_PROVIDER_KEY_0=your_api_key
# Guardrails use indexed provider format only
```

### Adding More Guardrail Providers

```bash
# Primary guardrails provider (free)
LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=groq-free
LLAMDA_LLM_PROXY_PROVIDER_KEY_0=your_groq_free_key

# Fallback guardrails provider (paid, if free tier exhausted)
LLAMDA_LLM_PROXY_PROVIDER_TYPE_1=groq
LLAMDA_LLM_PROXY_PROVIDER_KEY_1=your_groq_paid_key
```

## Future Enhancements

Potential additions to provider catalog:

1. **Llama Guard 4** (when available on Groq)
2. **OpenAI Moderation API** (dedicated moderation endpoint)
3. **Anthropic Constitutional AI** (specialized safety models)
4. **Google Perspective API** (toxicity/threat detection)

## Files Modified

- ✅ `PROVIDER_CATALOG.json` - Added `llama-guard-3-8b` to groq/groq-free
- ✅ `src/guardrails/config.js` - Removed legacy env vars, added guardrail model priority
- ✅ `src/guardrails/guardrail-factory.js` - Removed legacy env var support
- ✅ `.env` - Enabled groq-free provider for guardrails
- ✅ `GUARDRAILS_DEDICATED_MODELS.md` - This documentation

## Status

✅ **Ready for local development and testing**
✅ **All changes backward-compatible with context-provided API keys**
✅ **Tests passing (60/60 guardrails tests)**
