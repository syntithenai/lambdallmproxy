# Guardrails Auto-Detection: Test Coverage Summary

## Overview
Comprehensive unit and integration tests for the guardrails auto-detection system that automatically selects providers and models at runtime based on available API keys.

## Test Files Created

### 1. Unit Tests - Configuration (`tests/unit/guardrails-config.test.js`)
**29 tests** covering `src/guardrails/config.js`

#### Test Suites:
- **Disabled State** (3 tests)
  - Returns null when ENABLE_GUARDRAILS not set
  - Returns null when ENABLE_GUARDRAILS is false
  - Returns null when enabled but no providers available

- **Provider Priority - Context Keys** (6 tests)
  - Prefers groq-free when groqApiKey provided
  - Uses gemini-free when available
  - Uses together, openai when higher priorities unavailable
  - Correctly prioritizes multiple available providers

- **Provider Priority - Legacy Env Vars** (3 tests)
  - Detects providers from GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY

- **Provider Priority - Indexed Env Vars** (3 tests)
  - Detects providers from LLAMDA_LLM_PROXY_PROVIDER_TYPE_* format
  - Skips providers with empty keys

- **Context Overrides Env Vars** (2 tests)
  - Context keys override legacy env vars
  - Context keys override indexed env vars

- **Configuration Structure** (4 tests)
  - Returns complete config with all required fields
  - Sets enabled=true and strictness=moderate

- **Edge Cases** (4 tests)
  - Handles empty/undefined context
  - Handles null values in context
  - Handles whitespace-only API keys

- **Groq Paid Tier** (1 test)
  - Validates groq paid tier selection logic

- **Model Selection** (3 tests)
  - Selects appropriate models per provider (llama-3.1-8b-instant, gemini-1.5-flash, gpt-4o-mini)

### 2. Unit Tests - Factory (`tests/unit/guardrails-factory.test.js`)
**19 tests** covering `src/guardrails/guardrail-factory.js`

#### Test Suites:
- **createGuardrailValidator** (6 tests)
  - Returns null when config is null or disabled
  - Throws error when no API key found
  - Creates validator with context, legacy env, and indexed env API keys

- **Validator Methods** (8 tests)
  - validateInput: safe input, unsafe input, JSON parsing, error handling
  - validateOutput: safe output, unsafe output, error handling
  - Handles markdown-wrapped JSON responses
  - Fails safe on errors

- **Multiple Provider Support** (3 tests)
  - Works with OpenAI, Anthropic, Gemini providers

- **Context Priority** (2 tests)
  - Context keys override env vars

### 3. Integration Tests (`tests/integration/guardrails-auto-detection.test.js`)
**12 tests** covering end-to-end flows

#### Test Suites:
- **End-to-End Flow** (7 tests)
  - Complete config and validator creation with groq-free
  - Works with environment variables
  - Works with indexed provider format
  - Skips when disabled or unavailable
  - Prefers context over environment
  - Validates provider fallback priority

- **Cost Tracking** (1 test)
  - Validator has tracking capabilities

- **Error Handling** (2 tests)
  - Handles missing providers gracefully
  - Throws appropriate errors

- **Backwards Compatibility** (2 tests)
  - Works with legacy GROQ_API_KEY
  - Works with indexed provider format

## Total Test Coverage
- **60 tests total** across 3 test files
- **100% pass rate** (60/60 passing)
- **Test execution time**: < 1 second

## Provider Priority Order (Validated by Tests)
1. `groq-free` - Free Groq tier (preferred)
2. `gemini-free` - Free Gemini tier
3. `groq` - Paid Groq tier
4. `together` - Together AI
5. `gemini` - Paid Gemini
6. `openai` - OpenAI
7. `anthropic` - Anthropic

## API Key Resolution Order (Validated by Tests)
1. Context keys (from UI): `context.groqApiKey`, `context.geminiApiKey`, etc.
2. Indexed env vars: `LLAMDA_LLM_PROXY_PROVIDER_TYPE_0` + `LLAMDA_LLM_PROXY_PROVIDER_KEY_0`
3. Legacy env vars: `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, etc.

## Key Features Validated
✅ Auto-detection of available providers  
✅ Priority-based provider selection  
✅ Model selection per provider  
✅ Context key overrides  
✅ Multiple API key sources (context, indexed, legacy)  
✅ Fail-safe behavior (returns null when no providers available)  
✅ Error handling and graceful degradation  
✅ Backwards compatibility with existing env var formats  
✅ Proper config structure (enabled, provider, inputModel, outputModel, strictness)  
✅ Provider factory integration  
✅ Validator creation with proper API key resolution  

## Running the Tests

```bash
# Run all guardrails tests
npm test -- --testPathPattern="guardrails"

# Run only unit tests
npm test -- tests/unit/guardrails-config.test.js
npm test -- tests/unit/guardrails-factory.test.js

# Run only integration tests
npm test -- tests/integration/guardrails-auto-detection.test.js

# Run with coverage
npm test -- --coverage --testPathPattern="guardrails"
```

## Implementation Files Tested
- `src/guardrails/config.js` - Configuration and auto-detection logic
- `src/guardrails/guardrail-factory.js` - Validator factory and API key resolution
- `PROVIDER_CATALOG.json` - Provider and model definitions (mocked in tests)

## Test Utilities Created
- `scripts/test-guardrails-auto-detect.js` - Manual test script for quick verification

## Notes
- Tests use mocked PROVIDER_CATALOG.json to avoid external dependencies
- Tests mock provider-factory to avoid real API calls
- All tests properly isolate environment variables (save/restore in beforeEach/afterEach)
- Tests cover both synchronous config loading and asynchronous validation
- Integration tests focus on config/validator creation, unit tests cover full validation flow
