# Guardrails Legacy Environment Variables Removal - Complete ✅

## Summary

Successfully removed all legacy environment variable support from the guardrails system per user requirements. The system now exclusively uses the indexed provider format (`LLAMDA_LLM_PROXY_PROVIDER_TYPE_N` / `LLAMDA_LLM_PROXY_PROVIDER_KEY_N`) for environment-based configuration.

## Changes Made

### 1. Source Code Updates

**src/guardrails/config.js:**
- ✅ Removed legacy env var checking from `hasProviderApiKey()` function
- ✅ Updated to only check: context keys → indexed providers
- ✅ Added dedicated guardrail model prioritization
- ✅ Added model selection logging (dedicated vs fallback)

**src/guardrails/guardrail-factory.js:**
- ✅ Removed legacy env var fallback from `getProviderApiKey()` function  
- ✅ Updated to only check: context keys → indexed providers → null
- ✅ Updated function comment to reflect indexed-only support

### 2. Test Suite Updates

**tests/unit/guardrails-config.test.js:**
- ✅ Removed "Provider Priority - Legacy Env Vars" test suite (3 tests deleted)
- ✅ Updated "Context Overrides Env Vars" to remove legacy test
- ✅ Updated "Edge Cases" to use indexed providers (4 tests updated)
- Total changes: 8 tests removed/updated

**tests/unit/guardrails-factory.test.js:**
- ✅ Removed "should create validator with legacy env var API key" test
- ✅ Removed duplicate "should prefer context key over env var" test
- ✅ Kept only indexed provider tests
- Total changes: 2 tests removed

**tests/integration/guardrails-auto-detection.test.js:**
- ✅ Merged "should work with environment variables" into indexed provider test
- ✅ Renamed "Backwards Compatibility" suite to "Indexed Provider Format"
- ✅ Removed "should still work with legacy GROQ_API_KEY" test
- Total changes: 2 tests removed/merged

### 3. Test Results

**Before fixes:** 10 failed, 50 passed (60 total)
**After fixes:** 0 failed, 52 passed (52 total) ✅

Note: Test count decreased from 60 to 52 because we removed 8 tests that specifically tested legacy env var behavior that was intentionally removed.

## API Key Resolution Order (Current)

The guardrails system now follows this priority order:

1. **Context Keys** (from UI): `groqApiKey`, `geminiApiKey`, `togetherApiKey`, `openaiApiKey`, `anthropicApiKey`
2. **Indexed Provider Env Vars**: `LLAMDA_LLM_PROXY_PROVIDER_TYPE_N` + `LLAMDA_LLM_PROXY_PROVIDER_KEY_N`
3. **Return null** if no keys found

## Model Selection Priority (Current)

1. **Dedicated guardrail models** (models with `guardrailModel: true` flag)
   - Example: `llama-guard-3-8b`
   - Logs: "🛡️ Selected dedicated guardrail model: {model}"
2. **Fast general models** (for providers without dedicated guardrail models)
   - Example: `llama-3.1-8b-instant`, `gemini-1.5-flash`
   - Logs: "⚠️ No dedicated guardrail model found, using fallback: {model}"
3. **Any small/medium model** (last resort)

## Validation

✅ All guardrails tests passing (52/52)
✅ No legacy env var references in `src/guardrails/`
✅ Manual testing confirms llama-guard-3-8b selection works
✅ No errors found in modified source files

## Local Development Configuration

The `.env` file has been configured with Provider 0 for local guardrails:

```bash
ENABLE_GUARDRAILS=true
LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=groq-free
LLAMDA_LLM_PROXY_PROVIDER_KEY_0=gsk_your-groq-api-key-here
```

## Breaking Changes

⚠️ **Applications using the following environment variables for guardrails will need to migrate:**

**Old format (no longer supported):**
```bash
GROQ_API_KEY=your-key
OPENAI_API_KEY=your-key
GEMINI_API_KEY=your-key
```

**New format (required):**
```bash
LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=groq-free
LLAMDA_LLM_PROXY_PROVIDER_KEY_0=your-groq-key

LLAMDA_LLM_PROXY_PROVIDER_TYPE_1=openai
LLAMDA_LLM_PROXY_PROVIDER_KEY_1=your-openai-key

LLAMDA_LLM_PROXY_PROVIDER_TYPE_2=gemini
LLAMDA_LLM_PROXY_PROVIDER_KEY_2=your-gemini-key
```

## References

- [GUARDRAILS_DEDICATED_MODELS.md](./GUARDRAILS_DEDICATED_MODELS.md) - Dedicated model implementation details
- [GUARDRAILS_AUTO_DETECTION_TESTS.md](./GUARDRAILS_AUTO_DETECTION_TESTS.md) - Original test coverage summary

---

**Completion Date:** 2025-01-XX  
**Status:** ✅ Complete - All tests passing, no legacy references remaining
