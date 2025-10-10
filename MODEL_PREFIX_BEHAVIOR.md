# Model Name Prefix Behavior

## Overview
The LLM proxy uses a `provider:model` format internally to route requests to different LLM providers. The most common prefix is `groq:` for Groq models.

## Key Behavior: Prefix Stripping

**IMPORTANT**: The `groq:` prefix (and other provider prefixes) are **STRIPPED before sending to the upstream LLM API**.

### Why This Matters

1. **Internal Routing**: The prefix is used internally by the proxy to determine which API endpoint to use
2. **Upstream Compatibility**: The actual LLM APIs (Groq, OpenAI, etc.) expect model names WITHOUT the provider prefix
3. **Automatic Stripping**: The code automatically removes the prefix before making the API call

## Examples

### Input to Proxy → Sent to Upstream API

```javascript
// User specifies (or system selects):
"groq:llama-3.3-70b-versatile"

// Proxy strips prefix and sends to Groq API:
"llama-3.3-70b-versatile"
```

```javascript
// User specifies:
"groq:llama-3.1-8b-instant"

// Sent to Groq API:
"llama-3.1-8b-instant"
```

```javascript
// OpenAI models:
"openai:gpt-4"

// Sent to OpenAI API:
"gpt-4"
```

## Code Locations

### 1. LLM Tools Adapter (`src/llm_tools_adapter.js`)

```javascript
// Line 204: Strips groq: prefix before sending to API
const payload = {
  model: normalizedModel.replace(/^groq:/, ''),  // ← PREFIX STRIPPED HERE
  messages,
  tools,
  tool_choice: 'auto',
  // ...
};
```

### 2. Chat Endpoint (`src/endpoints/chat.js`)

```javascript
// Lines 640-641: Model passed through with prefix intact
const currentRequestBody = {
  ...requestBody,
  model: requestBody.model || model  // e.g., "groq:llama-3.3-70b-versatile"
};

// Then later in llm_tools_adapter.js, the prefix is stripped before API call
```

### 3. Model Selector (`src/model-selector.js`)

```javascript
// Lines 239, 256: Always returns models WITH groq: prefix
return `groq:${modelName}`;  // e.g., "groq:llama-3.1-8b-instant"
```

### 4. Provider Parser (`src/providers.js`)

```javascript
// Lines 32-60: Parses provider:model format
function parseProviderModel(modelString) {
  // Splits "groq:llama-3.1-8b-instant" into:
  // { provider: "groq", model: "llama-3.1-8b-instant" }
}
```

## Model Selection Flow

1. **User Request** or **Auto-Selection**:
   - System determines model (e.g., `groq:llama-3.3-70b-versatile`)
   
2. **Provider Parsing**:
   - `parseProviderModel()` splits: `{ provider: "groq", model: "llama-3.3-70b-versatile" }`
   
3. **API Routing**:
   - Uses `provider` to determine endpoint: `https://api.groq.com/openai/v1`
   
4. **Prefix Stripping**:
   - Before sending to API: `model.replace(/^groq:/, '')`
   - Result: `"llama-3.3-70b-versatile"`
   
5. **API Call**:
   - Groq API receives: `{ model: "llama-3.3-70b-versatile", messages: [...], ... }`

## Retry Logic with Model Switching

When rate limits are hit, the system switches models:

```javascript
// Model selector returns: "groq:gemma2-9b-it"
const newModel = await selectModel(cleanMessages, tools);

// Strip prefix for tracking:
const modelName = newModel.replace('groq:', '');  // "gemma2-9b-it"

// Store in requestBody WITH prefix:
requestBody.model = newModel;  // "groq:gemma2-9b-it"

// Later, when sending to API, prefix is stripped again
```

## Why Use Prefixes?

1. **Multi-Provider Support**: Easily route to different providers (`groq:`, `openai:`, `gemini:`)
2. **Consistent Interface**: Same format for all providers
3. **Clean Separation**: Internal routing vs. external API calls
4. **Easy Switching**: Change providers without changing client code

## Default Behavior

- **No prefix provided**: Defaults to `groq:` provider
- **Model without prefix**: Treated as Groq model (e.g., `llama-3.1-8b-instant` → `groq:llama-3.1-8b-instant`)
- **Models with slashes**: Auto-detected as Groq (e.g., `meta-llama/llama-4-scout-17b-16e-instruct`)

## Summary

✅ **Internally**: Models are stored and tracked with `groq:` prefix  
✅ **Externally**: Prefix is **stripped** before API calls  
✅ **Routing**: Prefix determines which API endpoint to use  
✅ **Compatibility**: Upstream APIs receive clean model names without prefixes

This design allows the proxy to support multiple providers while maintaining clean API calls to each provider.
