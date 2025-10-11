# Chat Endpoint with Streaming and Tool Execution

## Overview

The `/chat` endpoint provides OpenAI-compatible chat completions with automatic tool execution and Server-Sent Events (SSE) streaming. It supports the full OpenAI tool calling flow, executing tools automatically and injecting results back into the conversation.

## Endpoint

```
POST /chat
```

## Features

- ✅ **OpenAI-Compatible**: Supports standard OpenAI chat completion format
- ✅ **Streaming Responses**: Real-time SSE streaming of responses
- ✅ **Automatic Tool Execution**: Detects tool_calls and executes them automatically
- ✅ **Multi-Turn Tool Calling**: Handles multiple tool execution iterations
- ✅ **Progress Events**: Real-time updates on tool execution status
- ✅ **Error Handling**: Graceful error recovery with detailed error events
- ✅ **Authentication**: JWT-based authentication with Google OAuth

## Request Format

### Headers

```http
POST /chat HTTP/1.1
Content-Type: application/json
Authorization: Bearer <YOUR_JWT_TOKEN>
```

### Body

```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Search for information about climate change"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search_web",
        "description": "Search the web for information",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Search query"
            },
            "limit": {
              "type": "integer",
              "default": 3
            }
          },
          "required": ["query"]
        }
      }
    }
  ],
  "temperature": 0.7,
  "max_tokens": 1000,
  "top_p": 1.0,
  "frequency_penalty": 0,
  "presence_penalty": 0
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model to use (e.g., "gpt-4", "groq/mixtral-8x7b-32768") |
| `messages` | array | Yes | Array of message objects with `role` and `content` |
| `tools` | array | No | Array of tool definitions (OpenAI format) |
| `temperature` | number | No | Sampling temperature (0-2, default: 0.7) |
| `max_tokens` | integer | No | Maximum tokens to generate |
| `top_p` | number | No | Nucleus sampling (0-1, default: 1.0) |
| `frequency_penalty` | number | No | Frequency penalty (-2 to 2, default: 0) |
| `presence_penalty` | number | No | Presence penalty (-2 to 2, default: 0) |
| `provider` | string | No | API provider ("openai" or "groq", auto-detected) |
| `targetUrl` | string | No | Custom API endpoint URL |

## Response Format (SSE)

The endpoint streams responses using Server-Sent Events with the following event types:

### Event: `status`

Sent at the beginning of processing.

```json
{
  "status": "processing",
  "model": "gpt-4",
  "provider": "openai",
  "hasTools": true
}
```

### Event: `delta`

Streaming text chunks from the LLM.

```json
{
  "content": "Based on the search results, climate change is..."
}
```

### Event: `tool_call_start`

Sent when a tool call is detected.

```json
{
  "id": "call_abc123",
  "name": "search_web",
  "arguments": "{\"query\":\"climate change\",\"limit\":3}"
}
```

### Event: `tool_call_progress`

Sent during tool execution.

```json
{
  "id": "call_abc123",
  "name": "search_web",
  "status": "executing"
}
```

### Event: `tool_call_result`

Sent when a tool completes execution.

```json
{
  "id": "call_abc123",
  "name": "search_web",
  "content": "{\"query\":\"climate change\",\"results\":[...]}"
}
```

### Event: `llm_request`

Sent when making a sub-request to LLM (e.g., for summaries).

```json
{
  "phase": "page_summary",
  "tool": "search_web",
  "model": "gpt-4",
  "page_index": 0,
  "url": "https://example.com"
}
```

### Event: `llm_response`

Sent when receiving a sub-response from LLM.

```json
{
  "phase": "page_summary",
  "tool": "search_web",
  "model": "gpt-4",
  "summary": "This page discusses..."
}
```

### Event: `message_complete`

Sent when the assistant's message is complete.

```json
{
  "role": "assistant",
  "content": "Based on the search results, climate change is a significant global challenge...",
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "search_web",
        "arguments": "{\"query\":\"climate change\",\"limit\":3}"
      }
    }
  ]
}
```

### Event: `complete`

Sent when all processing is complete.

```json
{
  "status": "success",
  "messages": [...],
  "iterations": 2
}
```

### Event: `error`

Sent when an error occurs.

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

#### Error Codes

- `UNAUTHORIZED` - Authentication required or invalid token
- `INVALID_REQUEST` - Invalid request parameters
- `CONFIGURATION_ERROR` - Missing API keys or configuration
- `MAX_ITERATIONS` - Maximum tool execution iterations reached
- `ERROR` - General error

## Tool Execution Flow

1. **Request with Tools**: Client sends a chat request with tools defined
2. **LLM Response**: LLM responds with tool_calls
3. **Tool Execution**: Lambda executes each tool automatically
4. **Result Injection**: Tool results are injected as tool messages
5. **Final Response**: LLM is called again with tool results to generate final response
6. **Repeat**: Process repeats if LLM requests more tool calls (max 5 iterations)

```
User Message → LLM (with tools) → Tool Call Detected
  ↓
  Execute Tool → Inject Result → LLM (with tool result)
  ↓
  Final Response → Client
```

## Available Tools

### search_web

Search the web and optionally fetch content and generate summaries.

```json
{
  "type": "function",
  "function": {
    "name": "search_web",
    "parameters": {
      "type": "object",
      "properties": {
        "query": { "type": "string" },
        "limit": { "type": "integer", "default": 3 },
        "timeout": { "type": "integer", "default": 15 },
        "load_content": { "type": "boolean", "default": false },
        "generate_summary": { "type": "boolean", "default": false }
      },
      "required": ["query"]
    }
  }
}
```

### scrape_web_content

Fetch and extract content from a specific URL.

```json
{
  "type": "function",
  "function": {
    "name": "scrape_web_content",
    "parameters": {
      "type": "object",
      "properties": {
        "url": { "type": "string" },
        "timeout": { "type": "integer", "default": 15 }
      },
      "required": ["url"]
    }
  }
}
```

### execute_javascript

Execute JavaScript code in a secure sandbox.

```json
{
  "type": "function",
  "function": {
    "name": "execute_javascript",
    "parameters": {
      "type": "object",
      "properties": {
        "code": { "type": "string" },
        "timeout": { "type": "integer", "default": 5 }
      },
      "required": ["code"]
    }
  }
}
```

## Example Usage

### JavaScript (Fetch API)

```javascript
const response = await fetch('https://your-lambda-url.on.aws/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'Search for the latest AI news' }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'search_web',
          description: 'Search the web',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' }
            },
            required: ['query']
          }
        }
      }
    ]
  })
});

// Parse SSE stream
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      const eventType = line.substring(7);
    } else if (line.startsWith('data: ')) {
      const data = JSON.parse(line.substring(6));
      
      if (eventType === 'delta') {
        console.log('Content:', data.content);
      } else if (eventType === 'tool_call_start') {
        console.log('Tool:', data.name);
      } else if (eventType === 'complete') {
        console.log('Done!');
      }
    }
  }
}
```

### Curl

```bash
curl -X POST https://your-lambda-url.on.aws/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "What is 2+2? Use JavaScript to calculate."}
    ],
    "tools": [{
      "type": "function",
      "function": {
        "name": "execute_javascript",
        "parameters": {
          "type": "object",
          "properties": {
            "code": {"type": "string"}
          },
          "required": ["code"]
        }
      }
    }]
  }' \
  --no-buffer
```

## Configuration

### Environment Variables

- `OPENAI_API_KEY` - OpenAI API key
- `GROQ_API_KEY` - Groq API key
- `OPENAI_API_URL` - OpenAI API endpoint (default: https://api.openai.com/v1/chat/completions)
- `MAX_TOOL_ITERATIONS` - Maximum tool calling iterations (default: 5)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID for JWT verification
- `ALLOWED_EMAILS` - Comma-separated list of allowed emails

## Differences from /proxy

| Feature | /chat | /proxy |
|---------|-------|--------|
| Streaming | ✅ SSE | ❌ Buffered |
| Tool Execution | ✅ Automatic | ❌ None |
| Real-time Updates | ✅ Yes | ❌ No |
| Tool Status | ✅ Visible | ❌ N/A |
| Response Format | SSE Events | JSON |
| Use Case | Interactive chat | Simple proxy |

## Troubleshooting

### No events received

- Ensure client is parsing SSE correctly (look for `event:` and `data:` lines)
- Check that response is not being buffered by proxies
- Verify `Content-Type: text/event-stream` header is set

### Tool execution timeout

- Increase `timeout` parameter in tool arguments
- Check CloudWatch logs for tool execution errors
- Verify network connectivity to external services

### Max iterations error

- Reduce tool complexity or number of tools
- Increase `MAX_TOOL_ITERATIONS` environment variable
- Check if LLM is stuck in a loop requesting the same tools

### Authentication failures

- Verify JWT token is valid and not expired
- Check that user email is in `ALLOWED_EMAILS`
- Ensure `GOOGLE_CLIENT_ID` matches token issuer

## Performance

- **Latency**: First token typically arrives in 200-500ms
- **Tool Execution**: 2-10 seconds per tool depending on complexity
- **Total Time**: Varies based on number of tool calls and LLM response length
- **Timeout**: 2 minute timeout for entire request

## Limits

- Maximum 5 tool execution iterations per request
- Maximum 2 minute total request time
- Tool-specific timeouts (configurable per tool)
- Rate limits inherited from underlying LLM API

---

**Status**: Production Ready  
**Version**: 1.0  
**Last Updated**: October 5, 2025
