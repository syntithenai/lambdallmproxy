# Gemini-Free Provider Fix

## Issue
Planning endpoint was returning errors when using the `gemini-free` provider:
1. First error: `HTTP 401: Invalid API Key` (even with valid API key)
2. Second error: `HTTP 404: models/gemini-1.5-pro is not found for API version v1main`

## Root Causes

### Issue 1: Model Detection
The `isGeminiModel()` function in `src/llm_tools_adapter.js` only checked for models with `gemini:` prefix, but the `gemini-free` provider was creating models with `gemini-free:` prefix (e.g., `gemini-free:gemini-1.5-flash`).

This caused the Gemini-specific code path to never execute, leading to incorrect API endpoint usage and authentication failures.

### Issue 2: Incorrect API Path
The Gemini API path in `src/providers.js` was set to `/v1beta/openai/v1/chat/completions`, which created an incorrect URL. The correct path for Gemini's OpenAI-compatible API is `/v1beta/openai/chat/completions` (without the extra `/v1`).

## Files Changed

### src/llm_tools_adapter.js

1. **Line 10**: Updated `isGeminiModel()` function
   ```javascript
   // Before:
   function isGeminiModel(model) { return typeof model === 'string' && model.startsWith('gemini:'); }
   
   // After:
   function isGeminiModel(model) { return typeof model === 'string' && (model.startsWith('gemini:') || model.startsWith('gemini-free:')); }
   ```

2. **Line 38**: Updated `geminiSupportsReasoning()` to handle both prefixes
   ```javascript
   // Before:
   const m = String(model || '').replace(/^gemini:/, '');
   
   // After:
   const m = String(model || '').replace(/^gemini(-free)?:/, '');
   ```

3. **Line 322**: Updated model name extraction in payload
   ```javascript
   // Before:
   model: normalizedModel.replace(/^gemini:/, ''),
   
   // After:
   model: normalizedModel.replace(/^gemini(-free)?:/, ''),
   ```

### src/providers.js

4. **Line 30**: Fixed Gemini API path
   ```javascript
   // Before:
   path: '/v1beta/openai/v1/chat/completions',
   
   // After:
   path: '/v1beta/openai/chat/completions',
   ```
   
   This removes the duplicate `/v1` from the path, fixing the "API version v1main" error.

### ui-new/src/components/PlanningTab.tsx & PlanningDialog.tsx

Enhanced error handling to show provider and model information in error messages, with helpful hints for common errors like invalid API keys.

## Deployment
- **Lambda (Fix 1 - Model Detection)**: Deployed via `./scripts/deploy-fast.sh` on 2025-10-15 04:23:40 UTC
- **Lambda (Fix 2 - API Path)**: Deployed via `./scripts/deploy-fast.sh` on 2025-10-15 04:28:28 UTC
- **UI**: Deployed via `make deploy-ui` on 2025-10-14 17:11:09 UTC

## Testing
To test the fix:
1. Go to Settings and verify your `gemini-free` provider has a valid API key
2. Navigate to Planning tab
3. Try creating a plan - it should now work correctly
4. If you still see an error, the error message will now clearly show which provider/model is failing

## Related Files
- `PROVIDER_CATALOG.json`: Defines `gemini-free` provider with models like `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash-exp`, `gemini-2.5-flash`
- `src/endpoints/planning.js`: Constructs model strings as `${providerType}:${modelName}`
- `src/providers.js`: Defines Gemini API endpoint and configuration
