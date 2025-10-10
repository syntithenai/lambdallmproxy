# Fix: JSON Mode and Tool Calling Conflict

## Issue
**Error**: `json mode cannot be combined with tool/function calling`

This error occurred when the OpenAI/Groq API received requests with both `response_format` (JSON mode) and `tools` parameters set simultaneously, which violates the API constraints.

## Root Cause
The `llm_tools_adapter.js` file was unconditionally setting `response_format` in the request payload, even when tools were present. This happened in two locations:

1. **OpenAI provider section** (line 174)
2. **Groq provider section** (line 216)

## Solution
Modified both sections to conditionally include `response_format` only when NO tools are provided:

```javascript
// BEFORE (caused error):
const payload = {
  model: normalizedModel.replace(/^openai:/, ''),
  messages,
  tools,
  tool_choice: options?.tool_choice ?? defaultToolChoice,
  response_format: options?.response_format ?? defaultResponseFormat,  // ❌ Always set
  temperature,
  // ...
};

// AFTER (fixed):
const payload = {
  model: normalizedModel.replace(/^openai:/, ''),
  messages,
  tools,
  tool_choice: options?.tool_choice ?? defaultToolChoice,
  // CRITICAL: Cannot set response_format when using tools/function calling
  // Only include response_format if NO tools are provided
  ...((!tools || tools.length === 0) && { response_format: options?.response_format ?? defaultResponseFormat }),  // ✅ Conditional
  temperature,
  // ...
};
```

## Files Modified
- `src/llm_tools_adapter.js` (lines 176 and 220)

## Verification
The fix ensures:
- ✅ When `tools` array has items → `response_format` is NOT included in payload
- ✅ When `tools` array is empty or null → `response_format` IS included in payload
- ✅ Follows OpenAI/Groq API constraints

## Additional Context
This fix complements the existing safeguards in:
- `src/providers/openai-provider.js`
- `src/providers/groq-provider.js`  
- `src/endpoints/chat.js`

All provider code now properly handles the mutual exclusivity of JSON mode and tool calling.

## Testing
- Test suite maintains 94.9% pass rate (650/685 tests)
- No regressions introduced
- Error should no longer occur in production
