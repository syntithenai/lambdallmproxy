# Guardrails API Method Fix ✅

## Issue

Content moderation system was failing with the error:
```
Content moderation system error: provider.createChatCompletion is not a function
```

## Root Cause

The guardrails factory code (`src/guardrails/guardrail-factory.js`) was calling `provider.createChatCompletion()`, but provider instances from the `provider-factory` only implement the following methods:
- `makeRequest(messages, options)` - For non-streaming requests
- `streamRequest(messages, options, onChunk)` - For streaming requests

The `createChatCompletion()` method does not exist in the BaseProvider interface.

## Solution

Updated `src/guardrails/guardrail-factory.js` to use the correct `makeRequest()` method:

**Before (incorrect):**
```javascript
const response = await provider.createChatCompletion({
  model: config.inputModel,
  messages: [
    { role: 'user', content: prompt }
  ],
  temperature: 0,
  max_tokens: 500
});
```

**After (correct):**
```javascript
const response = await provider.makeRequest([
  { role: 'user', content: prompt }
], {
  model: config.inputModel,
  temperature: 0,
  max_tokens: 500
});
```

## Changes Made

### Source Code
1. **src/guardrails/guardrail-factory.js** (2 changes):
   - Fixed `validateInput()` method to use `makeRequest(messages, options)`
   - Fixed `validateOutput()` method to use `makeRequest(messages, options)`

### Test Files
1. **tests/unit/guardrails-factory.test.js**:
   - Updated mock to use `makeRequest` instead of `createChatCompletion`
   - Renamed `mockCreateChatCompletion` to `mockMakeRequest` throughout

2. **tests/integration/guardrails-auto-detection.test.js**:
   - Updated provider mock to use `makeRequest` instead of `createChatCompletion`

## Verification

✅ All 52 guardrails tests passing
✅ No syntax errors in modified files
✅ Provider API usage now matches BaseProvider interface

## Test Results

```
PASS tests/integration/guardrails-auto-detection.test.js (10 tests)
PASS tests/unit/guardrails-config.test.js (26 tests)
PASS tests/unit/guardrails-factory.test.js (16 tests)

Test Suites: 3 passed, 3 total
Tests:       52 passed, 52 total
```

## BaseProvider API Reference

The correct BaseProvider interface (from `src/providers/base-provider.js`):

```javascript
class BaseProvider {
  // Non-streaming request
  async makeRequest(messages, options = {}) { }
  
  // Streaming request
  async streamRequest(messages, options = {}, onChunk) { }
  
  // Other helper methods
  getEndpoint()
  getHeaders()
  buildRequestBody(messages, options)
  parseRateLimits(headers)
  getSupportedModels()
  supportsModel(modelName)
  handleError(error, context)
  estimateTokens(messages)
}
```

## Impact

- ✅ Content moderation now works correctly
- ✅ Guardrails can properly filter user input and LLM output
- ✅ All existing tests continue to pass
- ✅ No breaking changes to public APIs

---

**Fixed:** 2025-10-22
**Status:** ✅ Complete and verified
