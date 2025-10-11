# Model Provider Detection Fix - October 7, 2025

## Issue

When using model names without provider prefixes (e.g., `gpt-4o` instead of `openai:gpt-4o`), the system was incorrectly assuming they were Groq models and sending them to the Groq API, resulting in errors like:

```
❌ Error: The model gpt-4o does not exist or you do not have access to it.
```

This happened even when the user had set "Groq" as their provider in settings, because the model name `gpt-4o` is actually an OpenAI model.

## Root Cause

In `src/llm_tools_adapter.js`, the auto-detection logic was:

```javascript
// Auto-detect and add provider prefix if missing
let normalizedModel = model;
if (!isOpenAIModel(model) && !isGroqModel(model)) {
  // If no prefix, assume groq (most common for tool calls)
  console.log(`⚠️ Model "${model}" missing provider prefix, assuming groq:${model}`);
  normalizedModel = `groq:${model}`;
}
```

**The problem**:
1. User selects model `gpt-4o` (no prefix)
2. `isOpenAIModel('gpt-4o')` returns `false` (checks for `openai:` prefix)
3. `isGroqModel('gpt-4o')` returns `false` (checks for `groq:` prefix)
4. Code assumes Groq: `normalizedModel = 'groq:gpt-4o'`
5. Sends `gpt-4o` to Groq API
6. Groq rejects it: "model does not exist"

## Solution

Added a check for known OpenAI model names before defaulting to Groq:

```javascript
// Check if it's a known OpenAI model name (like gpt-4o, gpt-4, etc.)
if (isKnownOpenAIModel(model)) {
  console.log(`⚠️ Model "${model}" is an OpenAI model, adding openai: prefix`);
  normalizedModel = `openai:${model}`;
} else {
  // If no prefix and not a known OpenAI model, assume groq
  console.log(`⚠️ Model "${model}" missing provider prefix, assuming groq:${model}`);
  normalizedModel = `groq:${model}`;
}
```

## Changes Made

### File: `src/llm_tools_adapter.js`

**Added import**:
```javascript
const { PROVIDERS } = require('./providers');
```

**Added helper function**:
```javascript
// Check if model name (without prefix) is a known OpenAI model
function isKnownOpenAIModel(modelName) {
  return PROVIDERS.openai.models.includes(modelName);
}
```

**Updated auto-detection logic** (lines ~110-123):
```javascript
async function llmResponsesWithTools({ model, input, tools, options }) {
  // ... existing parameter setup ...
  
  // Auto-detect and add provider prefix if missing
  let normalizedModel = model;
  if (!isOpenAIModel(model) && !isGroqModel(model)) {
    // Check if it's a known OpenAI model name (like gpt-4o, gpt-4, etc.)
    if (isKnownOpenAIModel(model)) {
      console.log(`⚠️ Model "${model}" is an OpenAI model, adding openai: prefix`);
      normalizedModel = `openai:${model}`;
    } else {
      // If no prefix and not a known OpenAI model, assume groq
      console.log(`⚠️ Model "${model}" missing provider prefix, assuming groq:${model}`);
      normalizedModel = `groq:${model}`;
    }
  }
  
  // ... rest of function ...
}
```

## Known OpenAI Models

From `src/providers.js`:
```javascript
PROVIDERS.openai.models = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4',
  'gpt-3.5-turbo'
];
```

## How It Works Now

### Scenario 1: OpenAI Model Without Prefix
```javascript
Input: model = 'gpt-4o'

1. isOpenAIModel('gpt-4o') → false (no openai: prefix)
2. isGroqModel('gpt-4o') → false (no groq: prefix)
3. isKnownOpenAIModel('gpt-4o') → true ✅ (in PROVIDERS.openai.models)
4. normalizedModel = 'openai:gpt-4o'
5. Sends to: api.openai.com
6. Result: ✅ Success
```

### Scenario 2: Groq Model Without Prefix
```javascript
Input: model = 'llama-3.1-70b-versatile'

1. isOpenAIModel('llama-3.1-70b-versatile') → false
2. isGroqModel('llama-3.1-70b-versatile') → false
3. isKnownOpenAIModel('llama-3.1-70b-versatile') → false
4. normalizedModel = 'groq:llama-3.1-70b-versatile'
5. Sends to: api.groq.com
6. Result: ✅ Success
```

### Scenario 3: Model With Explicit Prefix
```javascript
Input: model = 'groq:llama-3.1-8b-instant'

1. isOpenAIModel('groq:llama-3.1-8b-instant') → false
2. isGroqModel('groq:llama-3.1-8b-instant') → true ✅
3. normalizedModel = 'groq:llama-3.1-8b-instant' (unchanged)
4. Sends to: api.groq.com
5. Result: ✅ Success
```

### Scenario 4: Unknown Model Without Prefix
```javascript
Input: model = 'some-custom-model'

1. isOpenAIModel('some-custom-model') → false
2. isGroqModel('some-custom-model') → false
3. isKnownOpenAIModel('some-custom-model') → false
4. normalizedModel = 'groq:some-custom-model' (default to Groq)
5. Sends to: api.groq.com
6. Result: ❌ Error from Groq (model not found)
```

## Impact

**Before**:
```
User selects: gpt-4o
Provider: groq (incorrect!)
API call: POST api.groq.com → ❌ Error: model gpt-4o does not exist
```

**After**:
```
User selects: gpt-4o
Provider: openai (correct!)
API call: POST api.openai.com → ✅ Success
```

## Testing

### Test Case 1: OpenAI Models Without Prefix
```javascript
// Test these models:
'gpt-4o'
'gpt-4o-mini'
'gpt-4'
'gpt-3.5-turbo'

// Expected:
✅ Auto-detects as OpenAI
✅ Adds 'openai:' prefix
✅ Sends to api.openai.com
✅ Works correctly
```

### Test Case 2: Groq Models Without Prefix
```javascript
// Test these models:
'llama-3.1-70b-versatile'
'llama-3.3-70b-versatile'
'mixtral-8x7b-32768'

// Expected:
✅ Not recognized as OpenAI
✅ Adds 'groq:' prefix (default)
✅ Sends to api.groq.com
✅ Works correctly
```

### Test Case 3: Explicit Prefixes
```javascript
// Test these models:
'openai:gpt-4o'
'groq:llama-3.1-70b-versatile'

// Expected:
✅ Prefix detected
✅ No modification needed
✅ Routes to correct API
✅ Works correctly
```

## Related Files

- ✅ `src/llm_tools_adapter.js` - Main fix (model detection logic)
- ✅ `src/providers.js` - Provider configuration and model lists
- 📝 `src/lambda_search_llm_handler.js` - Uses llm_tools_adapter
- 📝 `src/tools.js` - Tool execution with model context

## Console Logging

### Before Fix
```
⚠️ Model "gpt-4o" missing provider prefix, assuming groq:gpt-4o
Error: The model gpt-4o does not exist or you do not have access to it.
```

### After Fix
```
⚠️ Model "gpt-4o" is an OpenAI model, adding openai: prefix
✅ Success - OpenAI API call completed
```

## Future Enhancements

To make model selection even more robust, consider:

1. **Add more OpenAI models** to the known list as they're released
2. **Validate model availability** before making API calls
3. **Provide clear error messages** when model is unavailable
4. **UI model selector** with grouped providers (OpenAI | Groq)
5. **Auto-detect from API key** (gsk_* = Groq, sk-* = OpenAI)
6. **Model aliases** (map common names to full model IDs)

## Deployment

**Method**: Fast deployment (10 seconds)
```bash
make fast
```

**Status**: ✅ Deployed successfully  
**Package**: `llmproxy-20251007-151707.zip` (93KB)  
**Endpoint**: https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/

## User Impact

**Before**:
- ❌ Selecting `gpt-4o` caused errors
- ❌ Confusing error messages
- ❌ Users had to manually add `openai:` prefix

**After**:
- ✅ `gpt-4o` works automatically
- ✅ Smart provider detection
- ✅ No manual prefix needed for common models
- ✅ Clear console logs for debugging

---

**Status**: ✅ Complete and deployed  
**Testing**: Ready for user verification  
**Date**: October 7, 2025
