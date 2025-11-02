# Plan: Public REST API + SDKs

**Date**: 2025-10-28  
**Updated**: 2025-01-XX (Google Sheets storage, expanded streaming details)  
**Status**: � IN PROGRESS  
**Priority**: HIGH (User-requested OpenAI compatibility)  
**Estimated Implementation Time**: 2-3 days (simplified architecture)

## Executive Summary

This plan outlines the creation of a **public REST API** for the Research Agent that is **100% compatible with the OpenAI API format**. This allows developers to use existing OpenAI SDKs and tools (like LangChain, LlamaIndex) as drop-in replacements by simply changing the base URL.

## Current State Analysis

### Existing Internal API

**Endpoint**: `POST /chat` (AWS Lambda Function URL)

**Current Usage**:
- Web UI makes direct calls to Lambda URL
- Google OAuth required for authentication
- No public documentation
- Streaming via SSE (Server-Sent Events)

**Limitations**:
- ❌ Not OpenAI-compatible (different request/response format)
- ❌ No API key management (only OAuth)
- ❌ No versioning (`/v1/chat/completions`)
- ❌ No public SDK
- ❌ No developer documentation

## Requirements

### Functional Requirements

1. **OpenAI Compatibility**:
   - POST `/v1/chat/completions` (streaming + non-streaming)
   - POST `/v1/completions` (legacy text completion)
   - GET `/v1/models` (list available models)
   - Request/response format matching OpenAI 100%
   - Drop-in replacement (change base URL only)

2. **Streaming Support**:
   - SSE streaming (same as OpenAI)
   - `stream: true` parameter
   - `data: [DONE]` termination signal
   - Tool calls in streaming chunks

3. **Authentication**:
   - API key generation (user dashboard)
   - Bearer token authentication (`Authorization: Bearer sk-...`)
   - Key revocation and rotation
   - Multiple keys per user

4. **Rate Limiting**:
   - Tiered limits (free: 100 req/min, pro: 1000 req/min)
   - Token-based rate limiting (10k tokens/min)
   - 429 status code with `Retry-After` header

5. **Documentation**:
   - OpenAPI 3.0 specification
   - Swagger UI at `/docs`
   - Interactive playground
   - Code examples in Python, Node.js, cURL

## OpenAI API Compatibility

### Chat Completions Endpoint

**Endpoint**: `POST /v1/chat/completions`

**Request Format** (OpenAI-compatible):
```json
{
  "model": "groq/llama-3.3-70b-versatile",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is the capital of France?"}
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 1000,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "web_search",
        "description": "Search the web for information",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {"type": "string"}
          },
          "required": ["query"]
        }
      }
    }
  ]
}
```

**Response Format** (Non-Streaming):
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "groq/llama-3.3-70b-versatile",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The capital of France is Paris."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 10,
    "total_tokens": 30
  }
}
```

**Response Format** (Streaming):
```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"content":"The"},"finish_reason":null}]}

data: [DONE]
```

### Models Endpoint

**Endpoint**: `GET /v1/models`

**Response Format**:
```json
{
  "object": "list",
  "data": [
    {
      "id": "groq/llama-3.3-70b-versatile",
      "object": "model",
      "created": 1677652288,
      "owned_by": "groq"
    },
    {
      "id": "openai/gpt-4o-mini",
      "object": "model",
      "created": 1677652288,
      "owned_by": "openai"
    }
  ]
}
```

## Implementation Architecture

### Simplified Lambda Function URL Approach

**Decision**: No API Gateway or ElastiCache - use existing Lambda Function URL with Google Sheets storage

```
User Request (with Bearer token)
    ↓
AWS Lambda Function URL (existing)
    ├── Route: /v1/chat/completions → Internal handler
    ├── Route: /v1/models → Models list
    └── Route: /chat → Existing chat endpoint (for web UI)
    ↓
Lambda Handler (src/index.js)
    ├── Extract API key from Authorization header
    ├── Validate API key (Google Sheets lookup)
    ├── Transform request (OpenAI → internal format)
    ├── Execute chat with streaming collator
    ├── Stream SSE chunks (OpenAI format + custom events)
    ├── Log request/response to Google Sheets
    └── Increment usage counters (Google Sheets)
```

**Benefits**:
- ✅ No additional infrastructure (no API Gateway, DynamoDB, Redis)
- ✅ Uses existing Google Sheets logging infrastructure
- ✅ Same Lambda function handles both UI and API requests
- ✅ No cold start overhead from multiple Lambda functions
- ✅ Simpler deployment (just update Lambda code)

## Authentication & API Keys

### API Key Management

**Storage**: Google Sheets (dedicated sheet in logging spreadsheet named "User API Keys")

**Sheet Schema**:
```
Sheet Name: "User API Keys"

Columns:
| A: API Key (sk-...) | B: User Email | C: Key Name | D: Tier | E: Created At | F: Last Used | G: Requests Count | H: Tokens Count | I: Revoked | J: Notes |
```

**Example Row**:
```
| sk-abc123xyz... | user@example.com | Production | free | 2025-10-28 10:00:00 | 2025-10-28 15:30:00 | 1,234 | 567,890 | FALSE | Main app key |
```

### API Key Generation & Storage

**Service**: `src/services/api-key-manager.js`

```javascript
const crypto = require('crypto');
const { getGoogleSheetsClient, appendRow, findRow, updateRow } = require('./google-sheets-logger');

const API_KEYS_SHEET_NAME = 'User API Keys';

/**
 * Generate new API key
 */
function generateAPIKey() {
  const randomBytes = crypto.randomBytes(24);
  const key = `sk-${randomBytes.toString('base64url')}`;
  return key;
}

/**
 * Create new API key for user
 */
async function createAPIKey(userEmail, keyName = 'Default', tier = 'free', notes = '') {
  const apiKey = generateAPIKey();
  const timestamp = new Date().toISOString();
  
  // Get Google Sheets client
  const sheetsClient = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
  
  // Ensure sheet exists
  await ensureApiKeysSheetExists(sheetsClient, spreadsheetId);
  
  // Append row to "User API Keys" sheet
  const row = [
    apiKey,           // A: API Key
    userEmail,        // B: User Email
    keyName,          // C: Key Name
    tier,             // D: Tier (free, pro, enterprise)
    timestamp,        // E: Created At
    '',               // F: Last Used (empty initially)
    0,                // G: Requests Count
    0,                // H: Tokens Count
    'FALSE',          // I: Revoked
    notes             // J: Notes
  ];
  
  await appendRow(sheetsClient, spreadsheetId, API_KEYS_SHEET_NAME, row);
  
  console.log(`✅ Created API key for ${userEmail}: ${apiKey.slice(0, 12)}...`);
  
  return {
    apiKey,
    userEmail,
    keyName,
    tier,
    createdAt: timestamp
  };
}

/**
 * Validate API key and get associated user
 */
async function validateAPIKey(apiKey) {
  const sheetsClient = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
  
  // Find row with this API key
  const keyData = await findRow(
    sheetsClient,
    spreadsheetId,
    API_KEYS_SHEET_NAME,
    apiKey,
    0 // Column A (API Key)
  );
  
  if (!keyData) {
    return { valid: false, reason: 'Invalid API key' };
  }
  
  // Check if revoked
  if (keyData[8] === 'TRUE') { // Column I (Revoked)
    return { valid: false, reason: 'API key revoked' };
  }
  
  // Update last used timestamp and increment counters
  await updateLastUsed(sheetsClient, spreadsheetId, apiKey);
  
  return {
    valid: true,
    userEmail: keyData[1],      // Column B
    keyName: keyData[2],         // Column C
    tier: keyData[3],            // Column D
    requestsCount: parseInt(keyData[6] || 0), // Column G
    tokensCount: parseInt(keyData[7] || 0)    // Column H
  };
}

/**
 * Update last used timestamp and increment request count
 */
async function updateLastUsed(sheetsClient, spreadsheetId, apiKey) {
  const timestamp = new Date().toISOString();
  
  // Find row index
  const rowIndex = await findRowIndex(sheetsClient, spreadsheetId, API_KEYS_SHEET_NAME, apiKey);
  
  if (rowIndex >= 0) {
    // Update Column F (Last Used) and increment Column G (Requests Count)
    await updateRow(
      sheetsClient,
      spreadsheetId,
      API_KEYS_SHEET_NAME,
      rowIndex,
      [null, null, null, null, null, timestamp, '=G' + rowIndex + '+1', null, null, null] // Increment request count
    );
  }
}

/**
 * Increment token count for API key
 */
async function incrementTokenCount(apiKey, tokens) {
  const sheetsClient = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
  
  const rowIndex = await findRowIndex(sheetsClient, spreadsheetId, API_KEYS_SHEET_NAME, apiKey);
  
  if (rowIndex >= 0) {
    // Increment Column H (Tokens Count)
    await updateRow(
      sheetsClient,
      spreadsheetId,
      API_KEYS_SHEET_NAME,
      rowIndex,
      [null, null, null, null, null, null, null, `=H${rowIndex}+${tokens}`, null, null]
    );
  }
}

/**
 * Revoke API key
 */
async function revokeAPIKey(apiKey) {
  const sheetsClient = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
  
  const rowIndex = await findRowIndex(sheetsClient, spreadsheetId, API_KEYS_SHEET_NAME, apiKey);
  
  if (rowIndex >= 0) {
    // Set Column I (Revoked) to TRUE
    await updateRow(
      sheetsClient,
      spreadsheetId,
      API_KEYS_SHEET_NAME,
      rowIndex,
      [null, null, null, null, null, null, null, null, 'TRUE', null]
    );
    
    console.log(`🔒 Revoked API key: ${apiKey.slice(0, 12)}...`);
    return true;
  }
  
  return false;
}

/**
 * List all API keys for a user
 */
async function listUserAPIKeys(userEmail) {
  const sheetsClient = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
  
  // Get all rows from sheet
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${API_KEYS_SHEET_NAME}!A2:J` // Skip header row
  });
  
  const rows = response.data.values || [];
  
  // Filter rows for this user
  const userKeys = rows
    .filter(row => row[1] === userEmail) // Column B (User Email)
    .map(row => ({
      apiKey: row[0]?.slice(0, 12) + '...',  // Masked key
      keyName: row[2],
      tier: row[3],
      createdAt: row[4],
      lastUsed: row[5] || 'Never',
      requestsCount: parseInt(row[6] || 0),
      tokensCount: parseInt(row[7] || 0),
      revoked: row[8] === 'TRUE'
    }));
  
  return userKeys;
}

/**
 * Ensure "User API Keys" sheet exists
 */
async function ensureApiKeysSheetExists(sheetsClient, spreadsheetId) {
  // Check if sheet exists
  const metadata = await sheetsClient.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties'
  });
  
  const sheetExists = metadata.data.sheets.some(
    sheet => sheet.properties.title === API_KEYS_SHEET_NAME
  );
  
  if (!sheetExists) {
    // Create sheet
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          addSheet: {
            properties: {
              title: API_KEYS_SHEET_NAME
            }
          }
        }]
      }
    });
    
    // Add header row
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${API_KEYS_SHEET_NAME}!A1:J1`,
      valueInputOption: 'RAW',
      resource: {
        values: [[
          'API Key',
          'User Email',
          'Key Name',
          'Tier',
          'Created At',
          'Last Used',
          'Requests Count',
          'Tokens Count',
          'Revoked',
          'Notes'
        ]]
      }
    });
    
    console.log(`✅ Created "User API Keys" sheet`);
  }
}

/**
 * Helper: Find row index for API key
 */
async function findRowIndex(sheetsClient, spreadsheetId, sheetName, apiKey) {
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:A`
  });
  
  const rows = response.data.values || [];
  return rows.findIndex(row => row[0] === apiKey);
}

module.exports = {
  generateAPIKey,
  createAPIKey,
  validateAPIKey,
  incrementTokenCount,
  revokeAPIKey,
  listUserAPIKeys
};
```

## Rate Limiting

### Simplified Rate Limiting (Google Sheets Tracking)

**Storage**: Google Sheets "User API Keys" sheet (Columns G & H)
**Tracking**: Increment counters on each request

| Tier | Requests/Min | Tokens/Min | Notes |
|------|--------------|------------|-------|
| All  | 100          | 10,000     | Default for all API keys |

**Implementation**:
- **Request Count**: Increment Column G on each request
- **Token Count**: Increment Column H after completion
- **Rate Limit Check**: Read current values before processing
- **Reset**: Manual reset via UI or scheduled script (future)

**Note**: Google Sheets API has rate limits (100 requests/100 seconds per user). For high-volume scenarios, consider caching key validation results in Lambda memory for 60 seconds.

## Streaming & Tool Use Collation

### Challenge: OpenAI-Compatible Streaming with Tool Use

The Research Agent uses tools (web search, code execution, image proxy) which generate intermediate data and notifications. This data must be:
1. Collated along with the LLM response
2. Streamed in a way compatible with OpenAI's SSE format
3. Preserved for logging and debugging

### Current Internal Format (Non-Streaming)

**Internal Response Structure**:
```javascript
{
  response: {
    role: 'assistant',
    content: 'The capital of France is Paris.',
    tool_calls: [
      {
        id: 'call_abc123',
        type: 'function',
        function: {
          name: 'web_search',
          arguments: '{"query":"capital of France"}'
        }
      }
    ]
  },
  usage: {
    prompt_tokens: 20,
    completion_tokens: 10,
    total_tokens: 30
  },
  toolNotifications: [
    {
      tool: 'web_search',
      status: 'started',
      timestamp: 1698765432000,
      query: 'capital of France'
    },
    {
      tool: 'web_search',
      status: 'completed',
      timestamp: 1698765433500,
      resultsCount: 5,
      sources: ['wikipedia.org', 'britannica.com']
    }
  ],
  searchResults: [
    {
      title: 'Paris - Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Paris',
      snippet: 'Paris is the capital and most populous city of France...'
    }
  ],
  intermediateSteps: [
    { type: 'thinking', content: 'I should search for the capital of France' },
    { type: 'tool_call', tool: 'web_search', query: 'capital of France' },
    { type: 'tool_result', tool: 'web_search', results: [...] },
    { type: 'synthesizing', content: 'Based on search results, the answer is Paris' }
  ]
}
```

### OpenAI-Compatible Streaming Format

**SSE Stream Structure**:
```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_abc123","type":"function","function":{"name":"web_search","arguments":"{\n\"query\""}}]},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":": \"capital"}}]},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" of France"}}]},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"}\n}"}}]},"finish_reason":"tool_calls"}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"content":"The"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"content":" capital"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"content":" of"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"content":" France"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"content":" is"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"content":" Paris"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"content":"."},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1677652288,"model":"groq/llama-3.3-70b-versatile","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":10,"total_tokens":30}}

data: [DONE]
```

### Streaming Implementation Strategy

**Approach**: Collate all tool use data during streaming, then inject as custom SSE events

#### Step 1: Internal Streaming Handler

```javascript
// src/services/streaming-collator.js
class StreamingCollator {
  constructor() {
    this.toolNotifications = [];
    this.searchResults = [];
    this.intermediateSteps = [];
    this.fullContent = '';
  }

  /**
   * Track tool notification
   */
  addToolNotification(notification) {
    this.toolNotifications.push({
      ...notification,
      timestamp: Date.now()
    });
  }

  /**
   * Track search result
   */
  addSearchResult(result) {
    this.searchResults.push(result);
  }

  /**
   * Track intermediate step (thinking, tool call, etc.)
   */
  addIntermediateStep(step) {
    this.intermediateSteps.push({
      ...step,
      timestamp: Date.now()
    });
  }

  /**
   * Accumulate content chunks
   */
  addContent(chunk) {
    this.fullContent += chunk;
  }

  /**
   * Get all collated data
   */
  getCollatedData() {
    return {
      toolNotifications: this.toolNotifications,
      searchResults: this.searchResults,
      intermediateSteps: this.intermediateSteps,
      fullContent: this.fullContent
    };
  }
}
```

#### Step 2: Stream Transformation (Internal → OpenAI Format)

```javascript
// src/endpoints/v1-chat-completions.js
const { StreamingCollator } = require('../services/streaming-collator');

async function handleChatCompletions(req, res) {
  const { messages, stream, tools, model, temperature, max_tokens } = req.body;
  const { apiKey } = req.auth; // From middleware
  
  // Validate API key
  const keyValidation = await validateAPIKey(apiKey);
  if (!keyValidation.valid) {
    return res.status(401).json({ error: { message: 'Invalid API key', type: 'invalid_request_error' } });
  }
  
  const chatId = `chatcmpl-${crypto.randomBytes(16).toString('hex')}`;
  const created = Math.floor(Date.now() / 1000);
  
  if (!stream) {
    // Non-streaming: call internal endpoint, transform response
    const internalResponse = await callInternalChat(messages, tools, model, temperature, max_tokens);
    
    const openaiResponse = {
      id: chatId,
      object: 'chat.completion',
      created,
      model: model || 'groq/llama-3.3-70b-versatile',
      choices: [{
        index: 0,
        message: internalResponse.response,
        finish_reason: internalResponse.response.tool_calls ? 'tool_calls' : 'stop'
      }],
      usage: internalResponse.usage
    };
    
    // Log to Google Sheets
    await logAPIRequest(keyValidation.userEmail, apiKey, messages, internalResponse, openaiResponse.usage);
    
    return res.json(openaiResponse);
  }
  
  // STREAMING MODE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const collator = new StreamingCollator();
  
  try {
    // Call internal streaming endpoint
    const internalStream = await callInternalChatStreaming(messages, tools, model, temperature, max_tokens);
    
    let toolCallsAccumulated = [];
    let currentToolCallIndex = -1;
    let usage = null;
    
    for await (const chunk of internalStream) {
      if (chunk.event === 'tool_notification') {
        // Internal event: Tool use notification (web search started, etc.)
        collator.addToolNotification(chunk.data);
        
        // Send custom SSE event (not part of OpenAI spec, but useful for debugging)
        res.write(`event: tool_notification\ndata: ${JSON.stringify(chunk.data)}\n\n`);
        
      } else if (chunk.event === 'search_result') {
        // Internal event: Search result received
        collator.addSearchResult(chunk.data);
        
        // Send custom SSE event
        res.write(`event: search_result\ndata: ${JSON.stringify(chunk.data)}\n\n`);
        
      } else if (chunk.event === 'intermediate_step') {
        // Internal event: Thinking, synthesizing, etc.
        collator.addIntermediateStep(chunk.data);
        
        // Send custom SSE event
        res.write(`event: intermediate_step\ndata: ${JSON.stringify(chunk.data)}\n\n`);
        
      } else if (chunk.event === 'tool_call') {
        // LLM is calling a tool
        currentToolCallIndex++;
        
        const toolCall = {
          index: currentToolCallIndex,
          id: chunk.data.id,
          type: 'function',
          function: {
            name: chunk.data.function.name,
            arguments: ''
          }
        };
        
        toolCallsAccumulated.push(toolCall);
        
        // Send OpenAI-compatible tool call start
        const openaiChunk = {
          id: chatId,
          object: 'chat.completion.chunk',
          created,
          model: model || 'groq/llama-3.3-70b-versatile',
          choices: [{
            index: 0,
            delta: {
              tool_calls: [toolCall]
            },
            finish_reason: null
          }]
        };
        
        res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
        
      } else if (chunk.event === 'tool_call_arguments') {
        // Stream tool call arguments
        toolCallsAccumulated[currentToolCallIndex].function.arguments += chunk.data.arguments;
        
        const openaiChunk = {
          id: chatId,
          object: 'chat.completion.chunk',
          created,
          model: model || 'groq/llama-3.3-70b-versatile',
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: currentToolCallIndex,
                function: {
                  arguments: chunk.data.arguments
                }
              }]
            },
            finish_reason: null
          }]
        };
        
        res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
        
      } else if (chunk.event === 'delta') {
        // Content delta (LLM response text)
        collator.addContent(chunk.data.content);
        
        const openaiChunk = {
          id: chatId,
          object: 'chat.completion.chunk',
          created,
          model: model || 'groq/llama-3.3-70b-versatile',
          choices: [{
            index: 0,
            delta: {
              content: chunk.data.content
            },
            finish_reason: null
          }]
        };
        
        res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
        
      } else if (chunk.event === 'message_complete') {
        // Stream complete
        usage = chunk.data.usage;
        
        const openaiChunk = {
          id: chatId,
          object: 'chat.completion.chunk',
          created,
          model: model || 'groq/llama-3.3-70b-versatile',
          choices: [{
            index: 0,
            delta: {},
            finish_reason: toolCallsAccumulated.length > 0 ? 'tool_calls' : 'stop'
          }],
          usage: chunk.data.usage
        };
        
        res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
      }
    }
    
    // Send [DONE] signal
    res.write('data: [DONE]\n\n');
    
    // Log to Google Sheets (full collated data)
    const collatedData = collator.getCollatedData();
    await logAPIRequest(
      keyValidation.userEmail,
      apiKey,
      messages,
      {
        response: {
          role: 'assistant',
          content: collatedData.fullContent,
          tool_calls: toolCallsAccumulated.length > 0 ? toolCallsAccumulated.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments
            }
          })) : undefined
        },
        usage,
        ...collatedData // Include toolNotifications, searchResults, intermediateSteps
      },
      usage
    );
    
    // Increment token count for API key
    await incrementTokenCount(apiKey, usage.total_tokens);
    
  } catch (error) {
    console.error('Streaming error:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
}

/**
 * Log API request to Google Sheets
 */
async function logAPIRequest(userEmail, apiKey, messages, internalResponse, usage) {
  const sheetsClient = await getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_LOG_SPREADSHEET_ID;
  
  // Find or create user's log sheet
  const sheetName = sanitizeSheetName(userEmail);
  await ensureSheetExists(sheetsClient, spreadsheetId, sheetName);
  
  // Prepare log row
  const row = [
    new Date().toISOString(),                           // Timestamp
    apiKey.slice(0, 12) + '...',                        // Masked API key
    messages.length,                                     // Message count
    JSON.stringify(messages[messages.length - 1]),      // Last message
    internalResponse.response.content?.slice(0, 500),   // Response (truncated)
    usage.prompt_tokens,                                 // Prompt tokens
    usage.completion_tokens,                             // Completion tokens
    usage.total_tokens,                                  // Total tokens
    internalResponse.toolNotifications?.length || 0,    // Tool use count
    JSON.stringify(internalResponse.toolNotifications || []), // Tool notifications
    JSON.stringify(internalResponse.searchResults?.slice(0, 5) || []), // Search results (top 5)
    JSON.stringify(internalResponse.intermediateSteps || [])  // Intermediate steps
  ];
  
  await appendRow(sheetsClient, spreadsheetId, sheetName, row);
  
  console.log(`📊 Logged API request to Google Sheets: ${userEmail}`);
}
```

### Custom SSE Events (Research Agent Extensions)

While streaming, the Research Agent sends **additional custom SSE events** that OpenAI clients can ignore but custom clients can use:

```
event: tool_notification
data: {"tool":"web_search","status":"started","query":"capital of France"}

event: search_result
data: {"title":"Paris - Wikipedia","url":"https://en.wikipedia.org/wiki/Paris","snippet":"Paris is the capital..."}

event: intermediate_step
data: {"type":"thinking","content":"I should search for the capital of France"}
```

**OpenAI SDK Compatibility**:
- OpenAI SDKs ignore events with custom types (`event: tool_notification`)
- They only process standard `data:` lines with `chat.completion.chunk` objects
- This allows seamless compatibility while preserving rich debugging info

### Logging Schema (Google Sheets)

**User Log Sheet** (one per API key user):
```
Sheet Name: <sanitized_user_email>

Columns:
| A: Timestamp | B: API Key | C: Msg Count | D: Last Message | E: Response | F: Prompt Tokens | G: Completion Tokens | H: Total Tokens | I: Tool Use Count | J: Tool Notifications | K: Search Results | L: Intermediate Steps |
```

**Example Row**:
```
| 2025-10-28 15:30:00 | sk-abc123... | 3 | {"role":"user","content":"What is the capital of France?"} | The capital of France is Paris. | 20 | 10 | 30 | 1 | [{"tool":"web_search","status":"completed",...}] | [{"title":"Paris - Wikipedia",...}] | [{"type":"thinking",...}] |
``` 

## SDKs

### Python SDK (OpenAI-Compatible)

**Installation**:
```bash
pip install openai
```

**Usage**:
```python
import openai

openai.api_base = "https://api.research-agent.com/v1"
openai.api_key = "sk-your-api-key-here"

response = openai.ChatCompletion.create(
    model="groq/llama-3.3-70b-versatile",
    messages=[
        {"role": "user", "content": "What is the capital of France?"}
    ],
    stream=True
)

for chunk in response:
    if hasattr(chunk.choices[0].delta, 'content'):
        print(chunk.choices[0].delta.content, end='')
```

### Node.js SDK

**Installation**:
```bash
npm install research-agent-sdk
```

**Usage**:
```javascript
import { ResearchAgent } from 'research-agent-sdk';

const agent = new ResearchAgent({
  apiKey: 'sk-your-api-key-here',
});

const stream = await agent.chat.completions.create({
  model: 'groq/llama-3.3-70b-versatile',
  messages: [
    { role: 'user', content: 'What is the capital of France?' }
  ],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

## Implementation Plan

### Simplified 3-Day Implementation

**Day 1: Core Infrastructure**
- [x] Update plan with Google Sheets storage and streaming details
- [ ] Implement API key management service (src/services/api-key-manager.js)
- [ ] Create "User API Keys" sheet in Google Sheets
- [ ] Test key generation/validation/revocation

**Day 2: OpenAI-Compatible Endpoints**
- [ ] Implement streaming collator service (src/services/streaming-collator.js)
- [ ] Implement /v1/chat/completions endpoint (src/endpoints/v1-chat-completions.js)
- [ ] Implement /v1/models endpoint (src/endpoints/v1-models.js)
- [ ] Add routing to Lambda handler (src/index.js)
- [ ] Test non-streaming and streaming requests

**Day 3: Testing & Documentation**
- [ ] Test with OpenAI Python SDK (change base URL)
- [ ] Test with OpenAI Node.js SDK
- [ ] Test with cURL (streaming and non-streaming)
- [ ] Test tool use with custom SSE events
- [ ] Verify logging to Google Sheets
- [ ] Write API usage documentation
- [ ] Deploy to production Lambda

### Removed Phases (No longer needed)
- ~~Phase 1: API Gateway setup~~ (using Lambda Function URL)
- ~~Phase 2: DynamoDB/Redis setup~~ (using Google Sheets)
- ~~Phase 3: ElastiCache for rate limiting~~ (using Google Sheets)
- ~~Phase 4-6: SDKs~~ (OpenAI SDKs work out of the box)

## Success Metrics

### Adoption
- **Target**: 100 developers in first month
- **Metric**: Unique API keys created

### Usage
- **Target**: 10M tokens/month
- **Metric**: Total tokens processed

### Revenue
- **Target**: $500 MRR (Monthly Recurring Revenue)
- **Metric**: Subscription revenue + overage fees

## Future Enhancements

### Phase 5: Advanced Features
- [ ] Batch API (async processing)
- [ ] Fine-tuning API (custom models)
- [ ] Embeddings endpoint (`/v1/embeddings`)
- [ ] Image generation endpoint
- [ ] Audio transcription endpoint

### Phase 6: Enterprise Features
- [ ] Dedicated instances
- [ ] VPC peering
- [ ] SSO integration (SAML, OIDC)
- [ ] Audit logs
- [ ] Custom model hosting

---

**Status**: 🚧 IN PROGRESS  
**Next Step**: Implement API key management service  
**Estimated Launch**: 2-3 days from start  
**Deployment**: Local development first, then Lambda when ready

````
