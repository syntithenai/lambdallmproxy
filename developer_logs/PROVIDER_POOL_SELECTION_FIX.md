# Provider Pool Selection Fix

## Issue
User configured only OpenAI in the UI settings, but received error:
```
❌ Error: API key not configured for provider: groq
```

Despite having environment variable providers disabled, the system was still trying to use Groq.

## Root Cause
The chat endpoint (`src/endpoints/chat.js`) had **legacy code** that was:
1. ✅ Building a `providerPool` from user's UI configuration (line 457)
2. ❌ But then **ignoring it completely**
3. ❌ Hardcoding Groq models (llama-3.3-70b-versatile, llama-3.1-8b-instant)
4. ❌ Using environment variables for API keys (`process.env.GROQ_API_KEY`)

This meant the provider pool system was built but never used - the old logic always tried Groq.

## Code Before Fix
```javascript
// Lines 495-522 (OLD CODE)
if (!model) {
    // Always defaulted to Groq models
    if (isComplex) {
        model = 'llama-3.3-70b-versatile'; // Groq
    } else {
        model = 'llama-3.1-8b-instant'; // Groq
    }
}

// Then tried to get API key from environment
const provider = body.provider || detectedProvider;
const apiKey = provider === 'groq' 
    ? process.env.GROQ_API_KEY   // ❌ Always looked for env var
    : process.env.OPENAI_API_KEY;

if (!apiKey) {
    // This is where the error was thrown
    error: `API key not configured for provider: ${provider}`
}
```

## Solution
Replaced the legacy provider selection logic with proper provider pool consumption:

### 1. Select Provider from Pool (Intelligently)
```javascript
// Priority: free tier first, then paid providers
const freeProviders = providerPool.filter(p => 
    p.type === 'groq-free' || p.type === 'gemini-free'
);
const paidProviders = providerPool.filter(p => 
    p.type !== 'groq-free' && p.type !== 'gemini-free'
);

// Try free providers first, then paid
const selectedProvider = freeProviders[0] || paidProviders[0];
```

### 2. Use Provider's API Key (Not Environment)
```javascript
const apiKey = selectedProvider.apiKey; // ✅ From user's config
```

### 3. Determine Endpoint Based on Provider Type
```javascript
let targetUrl;
if (selectedProvider.apiEndpoint) {
    // Use custom endpoint (openai-compatible)
    targetUrl = selectedProvider.apiEndpoint;
} else if (selectedProvider.type === 'groq-free' || selectedProvider.type === 'groq') {
    targetUrl = 'https://api.groq.com/openai/v1/chat/completions';
} else if (selectedProvider.type === 'openai') {
    targetUrl = 'https://api.openai.com/v1/chat/completions';
} else if (selectedProvider.type === 'gemini-free' || selectedProvider.type === 'gemini') {
    targetUrl = 'https://generativelanguage.googleapis.com/v1beta/chat/completions';
} else if (selectedProvider.type === 'together') {
    targetUrl = 'https://api.together.xyz/v1/chat/completions';
}
```

### 4. Auto-Select Model Based on Provider Type
```javascript
if (!model) {
    if (selectedProvider.modelName) {
        // Use specified model (openai-compatible)
        model = selectedProvider.modelName;
    } else if (selectedProvider.type === 'groq-free' || selectedProvider.type === 'groq') {
        model = isComplex ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
    } else if (selectedProvider.type === 'openai') {
        model = isComplex ? 'gpt-4o' : 'gpt-4o-mini'; // ✅ Now uses OpenAI
    } else if (selectedProvider.type === 'gemini-free' || selectedProvider.type === 'gemini') {
        model = 'gemini-1.5-flash';
    } else if (selectedProvider.type === 'together') {
        model = 'meta-llama/Llama-3-70b-chat-hf';
    }
}
```

## Provider Selection Logic

### Priority Order:
1. **Free Tier Providers** (groq-free, gemini-free)
   - No cost, good for testing
   - Used first if available

2. **Paid Providers** (openai, groq, gemini, together, openai-compatible)
   - Only used if no free tier available
   - Or if user only configured paid providers

### Model Selection by Provider:
| Provider Type | Simple Requests | Complex Requests |
|--------------|-----------------|------------------|
| `openai` | gpt-4o-mini | gpt-4o |
| `groq-free` | llama-3.1-8b-instant | llama-3.3-70b-versatile |
| `groq` | llama-3.1-8b-instant | llama-3.3-70b-versatile |
| `gemini-free` | gemini-1.5-flash | gemini-1.5-flash |
| `gemini` | gemini-1.5-flash | gemini-1.5-flash |
| `together` | Llama-3-70b-chat-hf | Llama-3-70b-chat-hf |
| `openai-compatible` | Uses `modelName` | Uses `modelName` |

### Complexity Detection:
Request is considered "complex" if:
- Total message content > 1000 characters
- More than 5 messages in history
- Tools are enabled

## Result
✅ System now uses the provider configured in the UI
✅ No more "API key not configured for provider: groq" errors
✅ Intelligent provider selection (free tier first)
✅ Correct model selection per provider type
✅ Environment variable providers completely removed from consideration

## Testing
User with only OpenAI configured should now:
1. Have OpenAI selected from their provider pool
2. Use OpenAI API endpoint
3. Use their OpenAI API key from UI settings
4. Auto-select `gpt-4o-mini` or `gpt-4o` based on complexity

## Deployment
- **Date**: October 10, 2025
- **Method**: Fast Lambda deployment (~10 seconds)
- **Function**: `llmproxy-20251010-191852.zip`
- **Size**: 152.6 KiB
- **Status**: ✅ Deployed successfully

## Related Files
- `src/endpoints/chat.js` - Provider selection logic (lines 495-570)
- `src/credential-pool.js` - Provider pool building
- `ui-new/src/components/ChatTab.tsx` - Sends enabled providers to backend

## Migration Notes
This fix completes the migration from:
- ❌ Environment variable-based provider selection
- ✅ UI-configured provider pool system

Users should:
1. Configure at least one provider in UI settings
2. Remove/ignore old environment variables (GROQ_API_KEY, OPENAI_API_KEY)
3. Use the new provider management UI for all configuration
