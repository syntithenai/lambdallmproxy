# Guardrails Auto-Detection Feature

**Date**: October 23, 2025  
**Status**: ✅ Complete  
**Related Files**: 
- `src/guardrails/config.js` - Auto-detection logic
- `src/guardrails/guardrail-factory.js` - Validator factory
- `.env` - Simplified configuration

## Overview

Content guardrails provide automatic content moderation for both user input and LLM output using LLM-based filtering. The system now features **automatic provider and model detection**, requiring only a single configuration flag.

## Configuration

### Minimal Setup (Recommended)

```bash
# .env file
ENABLE_GUARDRAILS=true
```

That's it! The system will automatically:
1. Detect available providers from environment variables and UI-provided API keys
2. Select the best provider based on preference order
3. Choose the most appropriate model (dedicated guardrail models preferred)

### Provider Selection Priority

The auto-detection follows this preference order:

1. **groq-free** - Groq free tier (fast, free, high quality)
2. **gemini-free** - Gemini free tier (fast, free)
3. **groq** - Groq paid tier (fast, cheap)
4. **together** - Together AI (various models)
5. **gemini** - Gemini paid tier
6. **openai** - OpenAI (expensive but reliable)
7. **anthropic** - Anthropic (expensive)

### Model Selection Strategy

For each provider, the system looks for models in this order:

1. **Dedicated Guardrail Models** (preferred):
   - `meta-llama/llama-guard-4-12b` (Groq) - Specifically designed for content moderation
   - `virtueguard-text-lite` (Together AI)
   - Other models marked with `guardrailModel: true` in `PROVIDER_CATALOG.json`

2. **Fallback Models** (small, fast general models):
   - `llama-3.1-8b-instant` (Groq 8B)
   - `llama-3.2-3b-preview` (Groq 3B)
   - `gemini-1.5-flash` (Gemini)
   - `gemini-1.5-flash-8b` (Gemini 8B)
   - `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` (Together AI)
   - `gpt-4o-mini` (OpenAI)
   - `claude-3-haiku-20240307` (Anthropic)

3. **Last Resort** (first available small/medium model from provider catalog)

## How It Works

### 1. Provider Detection

The auto-detection checks for API keys in two places:

**A. Environment Variables (Indexed Format)**:
```bash
LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=groq-free
LLAMDA_LLM_PROXY_PROVIDER_KEY_0=gsk_...
```

**B. UI-Provided Keys** (from request context):
- `openaiApiKey`
- `groqApiKey`
- `geminiApiKey`
- `togetherApiKey`
- `anthropicApiKey`
- etc.

### 2. Model Selection

Once a provider is selected, the system:
1. Loads `PROVIDER_CATALOG.json` to get available models
2. Checks for dedicated guardrail models first
3. Falls back to small/fast general-purpose models
4. Uses the same model for both input and output filtering

### 3. Initialization Flow

```javascript
// In src/endpoints/chat.js
const guardrailConfig = loadGuardrailConfig(guardrailContext);
// Returns: {
//   enabled: true,
//   provider: 'groq-free',
//   inputModel: 'meta-llama/llama-guard-4-12b',
//   outputModel: 'meta-llama/llama-guard-4-12b',
//   strictness: 'moderate'
// }

if (guardrailConfig) {
  guardrailValidator = createGuardrailValidator(guardrailConfig, guardrailContext);
  console.log('🛡️ Guardrails initialized for content filtering');
}
```

## Logging Output

When guardrails are enabled, you'll see:

```
🛡️ Selected dedicated guardrail model: meta-llama/llama-guard-4-12b
🛡️ Content guardrails: ENABLED (auto-detected) { provider: 'groq-free', model: 'meta-llama/llama-guard-4-12b' }
✅ Created provider: groq-free (id: guardrail, source: guardrail)
🛡️ Created guardrail validator using groq-free
🛡️ Guardrails initialized for content filtering
```

During request processing:
```
🛡️ Validating input (156 chars) with meta-llama/llama-guard-4-12b...
🛡️ Input validation: ✅ SAFE (0.43s, 89 tokens)

🛡️ Validating output (428 chars) with meta-llama/llama-guard-4-12b...
🛡️ Output validation: ✅ SAFE (0.38s, 104 tokens)
```

If content is flagged:
```
🛡️ Input validation: ❌ UNSAFE (0.51s, 92 tokens)
🛡️ Violations: S1, S10
   Reason: Flagged: Violent Crimes, Hate
```

## Llama Guard Safety Categories

The Llama Guard 4 model checks for these violation categories:

- **S1**: Violent Crimes
- **S2**: Non-Violent Crimes
- **S3**: Sex Crimes
- **S4**: Child Exploitation
- **S5**: Defamation
- **S6**: Specialized Advice (e.g., unqualified legal/medical advice)
- **S7**: Privacy violations
- **S8**: Intellectual Property violations
- **S9**: Indiscriminate Weapons
- **S10**: Hate speech
- **S11**: Self-Harm
- **S12**: Sexual Content
- **S13**: Elections misinformation
- **S14**: Code Interpreter Abuse

## Cost Tracking

All guardrail LLM calls are tracked in the LLM Info panel with:
- **Type**: `guardrail_input` or `guardrail_output`
- **Badge Color**: Yellow
- **Token Usage**: Prompt tokens + completion tokens
- **Cost**: Calculated based on provider pricing
- **Duration**: Response time in seconds

Example tracking object:
```javascript
{
  type: 'guardrail_input',
  model: 'meta-llama/llama-guard-4-12b',
  provider: 'groq-free',
  promptTokens: 89,
  completionTokens: 12,
  duration: 0.43
}
```

## Error Handling

**Fail-Safe Behavior**: If guardrail validation fails (API error, timeout, etc.), the system assumes content is **UNSAFE** and blocks the request:

```javascript
{
  safe: false,
  violations: ['system_error'],
  reason: 'Moderation error: API timeout',
  tracking: { error: 'API timeout', duration: 5.2 }
}
```

**Missing Provider**: If guardrails are enabled but no suitable provider is available:

```
⚠️ Content guardrails: ENABLED but no suitable provider available
   Continuing without guardrails. Provide API keys for groq-free, gemini-free, or other providers.
```

Request continues without guardrails (degraded mode).

## Legacy Configuration (Not Recommended)

The system previously required manual configuration:

```bash
# OLD WAY - NO LONGER NEEDED
ENABLE_GUARDRAILS=true
GUARDRAIL_PROVIDER=groq-free
GUARDRAIL_INPUT_MODEL=llama-3.1-8b-instant
GUARDRAIL_OUTPUT_MODEL=llama-3.1-8b-instant
GROQ_API_KEY=gsk_...
```

This still works but is **deprecated**. The auto-detection system is more flexible and finds better models automatically.

## Benefits of Auto-Detection

1. **Simpler Configuration**: Only need `ENABLE_GUARDRAILS=true`
2. **Better Model Selection**: Automatically finds dedicated guardrail models (Llama Guard 4)
3. **Flexible Provider Support**: Works with environment providers AND UI-provided keys
4. **Graceful Degradation**: Falls back to general models if no dedicated guardrail model available
5. **Cost Optimization**: Prefers free tier providers (groq-free, gemini-free) over paid tiers

## Testing

To test guardrails:

1. **Enable guardrails**:
   ```bash
   # .env
   ENABLE_GUARDRAILS=true
   ```

2. **Ensure a provider is configured**:
   ```bash
   # .env
   LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=groq-free
   LLAMDA_LLM_PROXY_PROVIDER_KEY_0=gsk_...
   ```

3. **Restart dev server**:
   ```bash
   make dev
   ```

4. **Check logs** for auto-detection:
   ```bash
   grep "guardrail" /tmp/dev-server.log
   ```

5. **Send a test message** via UI and check:
   - LLM Info panel shows guardrail calls (yellow badges)
   - Console logs show input/output validation
   - No errors in validation process

6. **Test unsafe content** (optional):
   - Try sending requests with policy violations
   - Should see `❌ UNSAFE` validation results
   - Request should be blocked

## Future Enhancements

Potential improvements:

1. **Configurable Strictness Levels**: 
   - `GUARDRAIL_STRICTNESS=strict|moderate|permissive`
   - Different prompt templates for each level

2. **Category-Specific Filtering**:
   - `GUARDRAIL_ENABLED_CATEGORIES=S1,S3,S4,S10`
   - Only check specific violation categories

3. **Custom Guardrail Prompts**:
   - Allow overriding default prompts via environment variables
   - Support for domain-specific content policies

4. **Caching**:
   - Cache validation results for identical inputs (TTL: 1 hour)
   - Reduce API calls for repeated content

5. **Async Validation**:
   - Validate output asynchronously (don't block response)
   - Log violations but still return response (monitoring mode)

## Related Documentation

- See `src/guardrails/prompts.js` for filter prompt templates
- See `PROVIDER_CATALOG.json` for model capabilities and pricing
- See `ARCHITECTURE_PUPPETEER_LAMBDA_SEPARATION.md` for overall architecture
