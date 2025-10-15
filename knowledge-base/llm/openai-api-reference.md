# OpenAI API Reference

## Overview

The OpenAI API provides access to powerful language models including GPT-4, GPT-3.5, and embedding models.

## Authentication

All API requests require an API key passed in the Authorization header:

```
Authorization: Bearer YOUR_API_KEY
```

## Chat Completions API

### Endpoint
```
POST https://api.openai.com/v1/chat/completions
```

### Request Body

```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.7,
  "max_tokens": 150,
  "stream": false
}
```

### Parameters

- **model** (string, required): The model to use. Options include:
  - `gpt-4` - Most capable model
  - `gpt-4-turbo-preview` - Latest GPT-4 with improved performance
  - `gpt-3.5-turbo` - Fast and cost-effective
  
- **messages** (array, required): Array of message objects with `role` and `content`
  - Roles: `system`, `user`, `assistant`, `function`

- **temperature** (number, optional): Sampling temperature between 0 and 2. Default: 1
  - Lower values (0-0.3): More focused and deterministic
  - Higher values (0.7-1.5): More creative and random

- **max_tokens** (number, optional): Maximum tokens to generate

- **stream** (boolean, optional): Stream responses as they're generated

### Response

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 9,
    "total_tokens": 19
  }
}
```

## Embeddings API

### Endpoint
```
POST https://api.openai.com/v1/embeddings
```

### Request Body

```json
{
  "model": "text-embedding-3-small",
  "input": "Your text here",
  "encoding_format": "float"
}
```

### Models

- **text-embedding-3-small** - Most efficient, 1536 dimensions
- **text-embedding-3-large** - Higher accuracy, 3072 dimensions
- **text-embedding-ada-002** - Legacy model, 1536 dimensions

### Response

```json
{
  "object": "list",
  "data": [{
    "object": "embedding",
    "embedding": [0.0023064255, -0.009327292, ...],
    "index": 0
  }],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

## Function Calling

GPT-4 and GPT-3.5-turbo support function calling for structured outputs.

### Request with Functions

```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "What's the weather in Boston?"}
  ],
  "functions": [{
    "name": "get_weather",
    "description": "Get the current weather in a location",
    "parameters": {
      "type": "object",
      "properties": {
        "location": {
          "type": "string",
          "description": "City and state, e.g. San Francisco, CA"
        },
        "unit": {
          "type": "string",
          "enum": ["celsius", "fahrenheit"]
        }
      },
      "required": ["location"]
    }
  }],
  "function_call": "auto"
}
```

### Function Call Response

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": null,
      "function_call": {
        "name": "get_weather",
        "arguments": "{\"location\": \"Boston, MA\", \"unit\": \"celsius\"}"
      }
    },
    "finish_reason": "function_call"
  }]
}
```

## Error Handling

Common HTTP status codes:

- **401** - Invalid API key
- **429** - Rate limit exceeded
- **500** - OpenAI server error
- **503** - Service temporarily unavailable

Error response format:

```json
{
  "error": {
    "message": "Invalid API key",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_api_key"
  }
}
```

## Rate Limits

Rate limits vary by model and organization tier:

- **Free tier**: 3 requests/minute, 40,000 tokens/minute
- **Tier 1**: 60 requests/minute, 60,000 tokens/minute
- **Tier 2**: 3,500 requests/minute, 80,000 tokens/minute

Monitor usage with response headers:
- `x-ratelimit-limit-requests`
- `x-ratelimit-remaining-requests`
- `x-ratelimit-limit-tokens`
- `x-ratelimit-remaining-tokens`

## Best Practices

1. **Set appropriate temperature**: Lower for factual tasks, higher for creative tasks
2. **Use system messages**: Guide model behavior with clear system instructions
3. **Handle errors gracefully**: Implement retry logic with exponential backoff
4. **Monitor token usage**: Track costs and optimize prompt length
5. **Use streaming**: For better user experience in chat applications
6. **Cache embeddings**: Reuse embeddings when possible to reduce costs
7. **Batch requests**: Combine multiple independent requests when feasible

## Pricing (as of 2024)

### GPT-4
- Input: $0.03 / 1K tokens
- Output: $0.06 / 1K tokens

### GPT-3.5-turbo
- Input: $0.0005 / 1K tokens
- Output: $0.0015 / 1K tokens

### Embeddings
- text-embedding-3-small: $0.00002 / 1K tokens
- text-embedding-3-large: $0.00013 / 1K tokens
