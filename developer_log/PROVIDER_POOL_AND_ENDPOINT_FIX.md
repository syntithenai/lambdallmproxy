# Provider Pool Implementation & 404 Endpoint Fix

## Issues Fixed

### Issue 1: "API key not configured for provider: groq"
**Problem**: When user had only OpenAI configured in the UI, the system still tried to use Groq provider with environment variables.

**Root Cause**: The code was building a `providerPool` from user-configured providers but then ignoring it and using legacy hardcoded provider logic that relied on environment variables.

**Solution**: Replaced legacy provider selection logic (lines 495-522 in chat.js) with new logic that:
1. Uses the `providerPool` built from UI-configured providers
2. Intelligently selects providers (free tier first, then paid)
3. Only uses providers that the user has actually configured

### Issue 2: "404 Not Found" from API
**Problem**: After fixing Issue 1, requests to OpenAI returned 404 errors.

**Root Cause**: The provider configuration in the UI stores the base endpoint URL (e.g., `https://api.openai.com/v1`) but the code was using it directly without appending `/chat/completions`, resulting in requests to incomplete URLs.

**Solution**: Added logic to automatically append `/chat/completions` to base endpoint URLs if not already present.

## Code Changes

### File: `src/endpoints/chat.js`

#### Change 1: Provider Selection (Lines 495-560)
**Before**: Hardcoded Groq provider and env var API keys
```javascript
// OLD CODE - REMOVED
const provider = 'groq';
const model = 'llama-3.3-70b-versatile';
const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
const targetUrl = 'https://api.groq.com/openai/v1/chat/completions';
```

**After**: Dynamic provider selection from pool
```javascript
// NEW CODE - Select from providerPool
const freeProviders = providerPool.filter(p => 
    p.type.includes('-free') || p.source === 'env-free'
);
const paidProviders = providerPool.filter(p => 
    !p.type.includes('-free') && p.source !== 'env-free'
);

// Prefer free tier, fallback to paid
const selectedProvider = freeProviders[0] || paidProviders[0];

// Use provider's apiKey and type for endpoint/model selection
const apiKey = selectedProvider.apiKey;
const provider = selectedProvider.type;
```

#### Change 2: Endpoint URL Construction (Lines 509-528)
**Before**: Direct use of apiEndpoint
```javascript
// OLD CODE
if (selectedProvider.apiEndpoint) {
    targetUrl = selectedProvider.apiEndpoint;  // Missing /chat/completions!
}
```

**After**: Smart endpoint URL construction
```javascript
// NEW CODE
if (selectedProvider.apiEndpoint) {
    // Append /chat/completions if not already present
    const baseUrl = selectedProvider.apiEndpoint.replace(/\/$/, ''); // Remove trailing slash
    targetUrl = baseUrl.endsWith('/chat/completions') 
        ? baseUrl 
        : `${baseUrl}/chat/completions`;
}
```

## How Provider Selection Works Now

### 1. Provider Pool Building (Already existed at line 457)
```javascript
const providerPool = buildProviderPool(
    userProviders || [],      // From UI configuration
    null,                      // No env providers (disabled)
    { allowEnvProviders: false }
);
```

### 2. Provider Prioritization (New logic)
- **Free tier first**: `groq-free`, `gemini-free`, etc.
- **Paid tier second**: `openai`, `groq`, `together`, etc.
- **Custom providers**: `openai-compatible` with user-specified endpoints

### 3. Endpoint Construction
For UI-configured providers:
- Base URL from UI: `https://api.openai.com/v1`
- Auto-appended: `/chat/completions`
- Final URL: `https://api.openai.com/v1/chat/completions` ✅

### 4. Model Selection (Auto-selected based on provider)
```javascript
if (selectedProvider.type === 'openai') {
    model = isComplex ? 'gpt-4o' : 'gpt-4o-mini';
} else if (selectedProvider.type === 'groq' || selectedProvider.type === 'groq-free') {
    model = isComplex ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
}
// ... etc
```

## UI Configuration

### Provider Endpoint Storage (ui-new/src/types/provider.ts)
```typescript
export const PROVIDER_ENDPOINTS: Record<ProviderType, string> = {
  'openai': 'https://api.openai.com/v1',           // Base URL
  'groq': 'https://api.groq.com/openai/v1',        // Base URL
  'groq-free': 'https://api.groq.com/openai/v1',   // Base URL
  // ...
};
```

These base URLs are stored in the provider config and sent to the Lambda function. The Lambda function now automatically appends `/chat/completions`.

## Testing Checklist

- [x] User with only OpenAI configured no longer sees Groq error
- [x] OpenAI API endpoint correctly formed: `https://api.openai.com/v1/chat/completions`
- [x] 404 errors resolved
- [x] Provider pool correctly prioritizes free tier
- [x] Custom endpoints with `/chat/completions` already appended not duplicated
- [x] Model auto-selection works based on provider type

## Deployment Info

- **First Deploy** (Provider pool fix): 2025-10-10 19:18:52 UTC
- **Second Deploy** (Endpoint fix): 2025-10-10 19:20:54 UTC
- **Lambda URL**: https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/
- **Deploy Method**: Fast deploy (code only, ~10 seconds)

## Benefits

1. **Uses UI Configuration**: Respects providers configured in the UI
2. **No Environment Variables**: No longer depends on deprecated env vars
3. **Smart Provider Selection**: Automatically uses free tier when available
4. **Correct Endpoints**: Properly constructs API URLs
5. **Better Error Messages**: Clear logs showing which provider is selected

## Related Files

- `src/endpoints/chat.js` - Main request handler (modified)
- `src/credential-pool.js` - Provider pool builder (unchanged)
- `ui-new/src/types/provider.ts` - Provider type definitions (unchanged)
- `ui-new/src/components/ProviderList.tsx` - UI for configuring providers (unchanged)

## Future Improvements

1. Add retry logic to try next provider if one fails
2. Track provider success rates for better selection
3. Add user-configurable provider priority
4. Show provider selection in UI transparency logs

## Logs to Check

After deployment, you should see logs like:
```
🎯 Selected provider: openai (source: user)
🤖 Auto-selected model: gpt-4o-mini (provider: openai, complex: false)
📡 Making request to: https://api.openai.com/v1/chat/completions
```

No more "API key not configured for provider: groq" errors!
