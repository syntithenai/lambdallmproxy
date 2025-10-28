# REST API Testing Guide

This guide shows how to test the OpenAI-compatible REST API endpoints.

## Prerequisites

1. **Create an API Key**: First, you need to create an API key in Google Sheets

```javascript
// Create API key (run this in Node.js REPL or create a script)
const { createAPIKey } = require('./src/services/api-key-manager');

// Create key for a user
await createAPIKey('user@example.com', 'Test Key', 'free', 'Testing REST API');
// Returns: { apiKey: 'sk-...', userEmail: 'user@example.com', ... }
```

2. **Set Environment Variables**: Ensure you have Google Sheets credentials configured

```bash
# Required in .env file
GS_SHEET_ID=your_spreadsheet_id
GS_EMAIL=your_service_account_email
GS_KEY="your_private_key"
```

## Testing with cURL

### 1. List Available Models

```bash
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer sk-your-api-key-here"
```

Expected response:
```json
{
  "object": "list",
  "data": [
    {
      "id": "groq/llama-3.3-70b-versatile",
      "object": "model",
      "created": 1698765432,
      "owned_by": "Groq Free Tier"
    },
    ...
  ]
}
```

### 2. Chat Completions (Streaming)

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-api-key-here" \
  -d '{
    "model": "groq/llama-3.3-70b-versatile",
    "messages": [
      {"role": "user", "content": "Say hello!"}
    ],
    "stream": true
  }'
```

Expected response (SSE stream):
```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1698765432,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1698765432,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: [DONE]
```

## Testing with Python (OpenAI SDK)

```python
import openai

# Configure client to use local server
client = openai.OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="sk-your-api-key-here"
)

# List models
models = client.models.list()
print("Available models:", [m.id for m in models.data])

# Chat completion (streaming)
stream = client.chat.completions.create(
    model="groq/llama-3.3-70b-versatile",
    messages=[
        {"role": "user", "content": "Tell me a joke"}
    ],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end='')
print()
```

## Testing with Node.js (OpenAI SDK)

```javascript
import OpenAI from 'openai';

// Configure client to use local server
const client = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'sk-your-api-key-here',
});

// List models
const models = await client.models.list();
console.log('Available models:', models.data.map(m => m.id));

// Chat completion (streaming)
const stream = await client.chat.completions.create({
  model: 'groq/llama-3.3-70b-versatile',
  messages: [
    { role: 'user', content: 'Tell me a joke' }
  ],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
console.log();
```

## Creating API Keys Programmatically

### Option 1: Node.js Script

```javascript
// scripts/create-api-key.js
require('dotenv').config();
const { createAPIKey } = require('../src/services/api-key-manager');

async function main() {
  const userEmail = process.argv[2];
  const keyName = process.argv[3] || 'Default';
  
  if (!userEmail) {
    console.error('Usage: node scripts/create-api-key.js user@example.com [keyName]');
    process.exit(1);
  }
  
  try {
    const result = await createAPIKey(userEmail, keyName, 'free');
    console.log('✅ API Key created:');
    console.log('   Email:', result.userEmail);
    console.log('   Key:', result.apiKey);
    console.log('   Name:', result.keyName);
    console.log('\n⚠️  Save this key! It will not be shown again.');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
```

Run it:
```bash
node scripts/create-api-key.js user@example.com "Production API Key"
```

### Option 2: Add to UI

You can add an API key management page to the UI (`ui-new/src/`) that calls a new endpoint:

```javascript
// src/endpoints/api-keys.js (new file)
// POST /api-keys/create - Create new API key
// GET /api-keys/list - List user's API keys
// POST /api-keys/revoke - Revoke an API key
```

## Error Handling

### Missing API Key
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"groq/llama-3.3-70b-versatile","messages":[{"role":"user","content":"Hello"}]}'
```

Response:
```json
{
  "error": {
    "message": "Missing API key. Please provide Authorization: Bearer sk-...",
    "type": "invalid_request_error"
  }
}
```

### Invalid API Key
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-invalid-key" \
  -d '{"model":"groq/llama-3.3-70b-versatile","messages":[{"role":"user","content":"Hello"}]}'
```

Response:
```json
{
  "error": {
    "message": "Invalid API key",
    "type": "invalid_request_error"
  }
}
```

### Revoked API Key
```bash
# Revoke a key first
node -e "const {revokeAPIKey} = require('./src/services/api-key-manager'); revokeAPIKey('sk-...').then(() => console.log('Revoked'))"

# Try to use it
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-revoked-key" \
  ...
```

Response:
```json
{
  "error": {
    "message": "API key revoked",
    "type": "invalid_request_error"
  }
}
```

## Monitoring

### Check Google Sheets

After making requests, check two sheets in your Google Sheets:

1. **"User API Keys" Sheet**: Shows API key metadata
   - API Key (masked in logs)
   - User Email
   - Requests Count (increments with each request)
   - Tokens Count (increments with token usage)
   - Last Used (updated timestamp)

2. **User-specific Sheet** (e.g., "user_at_example_dot_com"): Shows request logs
   - Timestamp
   - Model
   - Tokens In/Out
   - Cost
   - Duration

## Production Deployment

1. **Deploy to Lambda**:
   ```bash
   make deploy-lambda-fast
   ```

2. **Update base URL** in your client:
   ```python
   # Python
   client = openai.OpenAI(
       base_url="https://your-lambda-url.amazonaws.com/v1",
       api_key="sk-..."
   )
   ```

3. **Set up monitoring**:
   - CloudWatch logs: `make logs`
   - Google Sheets: Monitor "User API Keys" sheet
   - Track token usage and costs

## Next Steps

- [ ] Implement full streaming (currently placeholder)
- [ ] Add non-streaming mode support
- [ ] Implement tool use in OpenAI format
- [ ] Add custom SSE events for tool notifications
- [ ] Create API key management UI
- [ ] Add rate limiting enforcement
- [ ] Implement usage-based billing
- [ ] Add webhook support for async results
- [ ] Create SDK documentation
- [ ] Publish npm package (research-agent-sdk)
