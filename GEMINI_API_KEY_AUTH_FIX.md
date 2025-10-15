# Gemini API Key Authentication Fix

**Date**: 2025-10-15  
**Status**: ✅ RESOLVED

## Problem

Gemini API requests were failing with error:
```
HTTP 404: models/gemini-1.5-pro is not found for API version v1main
```

The error message "v1main" was confusing and didn't match our configured path `/v1beta/openai/chat/completions`.

## Root Cause

Gemini's OpenAI-compatible API has a unique authentication requirement:
- **Standard OpenAI APIs**: Use `Authorization: Bearer API_KEY` header
- **Gemini API**: Requires API key as query parameter `?key=API_KEY`

Our code was using the Authorization header for all providers, which caused Gemini to reject requests with a misleading error message.

## Solution

Modified `makeStreamingRequest()` function in `src/endpoints/chat.js` to detect Gemini requests and handle authentication differently:

### Before
```javascript
const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${apiKey}`,  // ❌ Doesn't work for Gemini
        'User-Agent': 'LambdaLLMProxy/1.0',
        'Accept': 'text/event-stream'
    }
};
```

### After
```javascript
// Check if this is a Gemini API request
const isGemini = url.hostname.includes('generativelanguage.googleapis.com');

// For Gemini, append API key as query parameter instead of Authorization header
if (isGemini) {
    url.searchParams.set('key', apiKey);
}

const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': 'LambdaLLMProxy/1.0',
    'Accept': 'text/event-stream'
};

// Only add Authorization header for non-Gemini APIs
if (!isGemini) {
    headers['Authorization'] = `Bearer ${apiKey}`;
}

const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,  // ✅ Includes ?key=API_KEY for Gemini
    method: 'POST',
    headers
};
```

## Changes Made

1. **Detection**: Check if hostname contains `generativelanguage.googleapis.com`
2. **Query Parameter**: For Gemini, append `?key=API_KEY` to URL
3. **Header Removal**: Skip Authorization header for Gemini requests
4. **Other Providers**: Keep Authorization header for non-Gemini APIs

## Files Modified

1. `src/endpoints/chat.js` - Line 529 (makeStreamingRequest function) - Chat endpoint
2. `src/llm_tools_adapter.js` - Line 340-355 (Gemini OpenAI-compatible section) - Planning endpoint

## Testing

✅ Gemini-free provider now works correctly  
✅ Gemini paid provider uses same authentication method  
✅ Other providers (OpenAI, Groq, Together) unaffected  

## Deployment

```bash
./scripts/deploy-fast.sh
```

Deployed:
- Chat endpoint fix: 2025-10-15 04:46:08 UTC
- Planning endpoint fix: 2025-10-15 04:51:21 UTC (COMPLETE FIX)

## Related Issues

This is the third bug in the Gemini integration:
1. **Model detection** - `isGeminiModel()` didn't recognize `gemini-free:` prefix
2. **API path** - Had duplicate `/v1` in path (`/v1beta/openai/v1/chat/completions`)
3. **API key authentication** - Used Authorization header instead of query parameter (this fix)

## References

- Gemini OpenAI-compatible API: https://ai.google.dev/gemini-api/docs/openai
- API Key Authentication: Requires `?key=YOUR_API_KEY` query parameter
- Other previous fixes: See GEMINI_FREE_FIX.md
