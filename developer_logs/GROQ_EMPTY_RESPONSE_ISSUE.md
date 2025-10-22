# Groq Empty Response Issue - Investigation and Fix

## Problem Statement

**Query**: "search youtube for ai news"
**Issue**: Groq API returns HTTP 200 but empty content stream
**Model**: llama-3.3-70b-versatile
**Provider**: groq-free
**Date**: 2025-10-11

## Symptoms

From CloudWatch logs:
```
🔄 Attempt 1/3: provider=groq-free, model=llama-3.3-70b-versatile
📋 HTTP Response Headers captured: {...}
📊 HTTP Status: 200
⚠️ Provider groq-free did not return usage data - using estimates
🔍 Tool execution decision: hasToolCalls=false, contentLength=0
⚠️ WARNING: Empty response detected with no tool calls
```

## Rate Limit Status

✅ NOT a rate limit issue:
- `x-ratelimit-remaining-requests`: 999/1000
- `x-ratelimit-remaining-tokens`: 9938/12000

## Tool Definitions Sent

The request included 5 tools:
1. ✅ `search_web` - Working
2. ✅ `execute_javascript` - Working  
3. ✅ `scrape_web_content` - Working
4. ✅ `search_youtube` - **This should be called**
5. ✅ `transcribe_url` - Working

Tool descriptions are correct and include proper YouTube support.

## Root Cause Theories

### Theory 1: Groq Model Issue with Complex Tool Definitions
The `llama-3.3-70b-versatile` model may be struggling with:
- 5 tools with complex descriptions
- Long system prompt with detailed tool usage instructions
- Multiple tools mentioning YouTube (search_youtube + transcribe_url)

### Theory 2: Streaming Response Bug
- Groq returns HTTP 200
- Stream starts but immediately closes without sending any chunks
- This creates `content=""` and `finish_reason=null`

### Theory 3: Tool Description Confusion
Even though `DISABLE_YOUTUBE_TRANSCRIPTION=false`, both tools mention YouTube:
- `search_youtube`: "Use when user wants to FIND or SEARCH for videos"
- `transcribe_url`: "YOUTUBE SUPPORT: Can transcribe directly from YouTube URLs"

The model might be confused about which tool to use.

## Attempted Fixes

### Fix 1: Set `DISABLE_YOUTUBE_TRANSCRIPTION=false` ✅
- Changed from `true` to `false`
- Deployed to Lambda
- **Result**: Still empty response

### Fix 2: Redeployed Lambda Code ✅
- Ensured latest code with debug logging
- **Result**: Tools being sent correctly, still empty response

## Proposed Solutions

### Solution A: Model Fallback Strategy (RECOMMENDED)

When Groq returns empty response, automatically retry with a different model:

```javascript
// In chat endpoint, after empty response detection
if (assistantMessage.content.trim().length === 0 && !hasToolCalls && iterationCount === 1) {
  console.log(`⚠️ Empty response from ${provider}:${model}, trying fallback model`);
  
  // Try OpenAI as fallback
  const fallbackProvider = 'openai';
  const fallbackModel = 'gpt-4o-mini';
  
  // Retry the request with fallback
  continue; // Loop again with new provider
}
```

### Solution B: Simplify Tool Descriptions

Reduce cognitive load on the LLM:

```javascript
// Shorter, clearer descriptions
const search_youtube_desc = "Search for YouTube videos by query. Returns video titles, URLs, and metadata.";
const transcribe_url_desc = "Transcribe audio/video from URL (supports YouTube). Returns full text transcript.";
```

### Solution C: Separate YouTube Search from Transcription

Make it crystal clear which tool does what:

```javascript
if (query.toLowerCase().includes('search youtube') || query.toLowerCase().includes('find youtube')) {
  // Only offer search_youtube tool
  tools = tools.filter(t => t.function.name === 'search_youtube' || t.function.name !== 'transcribe_url');
}
```

### Solution D: Use Different Groq Model

Switch to a model known to work well with function calling:
- `llama-3.1-70b-versatile` (older, more stable)
- `llama-3.1-8b-instant` (faster, simpler)
- `mixtral-8x7b-32768` (good function calling support)

### Solution E: Add Retry Logic with Exponential Backoff

```javascript
let retries = 0;
const maxRetries = 3;

while (retries < maxRetries) {
  const response = await callLLM(messages, tools);
  
  if (response.content.trim().length > 0 || response.tool_calls) {
    break; // Success
  }
  
  retries++;
  console.log(`⚠️ Empty response, retry ${retries}/${maxRetries}`);
  await sleep(1000 * retries); // Exponential backoff
}
```

## Immediate Action Plan

1. ⏳ **Test with OpenAI model** to verify tools work correctly
2. ⏳ **Test with different Groq model** (llama-3.1-70b-versatile)
3. ⏳ **Implement model fallback** in code
4. ⏳ **Add retry logic** for empty responses
5. ⏳ **Simplify tool descriptions** if issue persists

## Testing Commands

```bash
# Check current model selection logic
grep -r "llama-3.3-70b-versatile" src/

# Test with explicit model override
curl -X POST https://your-lambda-url/chat \
  -H "Content-Type: application/json" \
  -d '{"model": "openai:gpt-4o-mini", "messages": [{"role": "user", "content": "search youtube for ai news"}]}'

# Monitor logs
make logs-tail
```

## Related Files

- `src/endpoints/chat.js` - Empty response detection (line 1325)
- `src/llm_tools_adapter.js` - Groq API calls
- `src/model-selection/selector.js` - Model selection logic
- `src/tools.js` - Tool definitions

## Next Steps

1. User should try the query with OpenAI model (if available)
2. Implement automatic fallback to OpenAI when Groq returns empty
3. Add telemetry to track how often this happens
4. Consider reporting issue to Groq if it's reproducible

## Workaround for User

**Temporary Solution**: Use OpenAI model explicitly by adding to the request:

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "messages": [...]
}
```

Or in the UI, select OpenAI as the provider before sending the query.
