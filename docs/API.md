# API Endpoints Documentation

This document describes the API endpoints available in the Lambda LLM Proxy service.

## Base URL

All endpoints are relative to your Lambda function URL (e.g., `https://your-lambda-url.amazonaws.com/`)

## Authentication

⚠️ **REQUIRED FOR ALL API ENDPOINTS** (except static file server)

All API endpoints (`/planning`, `/search`, `/proxy`) require JWT-based authentication. Requests without valid authentication will receive a **401 Unauthorized** response.

### Authentication Requirements

1. **Authorization Header**: Include a valid Google JWT token:
   ```
   Authorization: Bearer <google-jwt-token>
   ```

2. **Email Whitelist**: The email address in the JWT token must be in the `ALLOWED_EMAILS` environment variable

3. **Token Verification**: Tokens are verified using the `GOOGLE_CLIENT_ID` environment variable

### Authentication Response

When authentication fails, all endpoints return:
```json
{
  "error": "Authentication required. Please provide a valid JWT token in the Authorization header.",
  "code": "UNAUTHORIZED"
}
```

### Public Access

The **static file server** (web UI) remains publicly accessible:
- `GET /` - Serves the web interface
- `GET /index.html`, `/css/*`, `/js/*`, etc. - No authentication required

## Endpoints

### 1. Planning Endpoint

**POST /planning**

🔒 **Authentication Required**

Generates a research plan using a Groq reasoning model. Returns a structured plan with search keywords, questions, and an optimal expert persona for answering the query.

#### Request Headers

```
Content-Type: application/json
Authorization: Bearer <google-jwt-token>  // REQUIRED
```

#### Request Body

```json
{
  "query": "Your research query here",
  "apiKey": "your-groq-api-key",  // Optional - uses env GROQ_API_KEY for authenticated users
  "model": "groq:llama-3.3-70b-versatile"  // Optional, defaults to this model
}
```

#### Response (200 OK)

```json
{
  "text": "Comprehensive explanation of the research approach",
  "searchKeywords": [
    ["keyword set 1", "keyword set 2"],
    ["alternative keyword set 1", "alternative keyword set 2"]
  ],
  "questions": [
    "Research question 1?",
    "Research question 2?",
    "Research question 3?"
  ],
  "persona": "I am a [specific expert] with expertise in [domain]...",
  "reasoning": "Detailed explanation of approach",
  "complexityAssessment": "low|medium|high"
}
```

#### Error Responses

- **400 Bad Request**: Missing or invalid query parameter
- **401 Unauthorized**: Missing or invalid JWT token, or email not in allowed list
- **500 Internal Server Error**: LLM service error

#### Example

```bash
curl -X POST https://your-lambda-url.amazonaws.com/planning \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "query": "What are the implications of quantum computing on cryptography?"
  }'
```

---

### 2. Search Endpoint

**POST /search**

🔒 **Authentication Required**

Performs DuckDuckGo search(es), fetches content from all result pages, extracts text, and returns structured results with scores. Supports both single query and multiple parallel queries.

#### Request Headers

```
Content-Type: application/json
Authorization: Bearer <google-jwt-token>  // REQUIRED
```

#### Request Body (Single Query)

```json
{
  "query": "Your search query",
  "maxResults": 5,  // Optional, default 5, max 20
  "includeContent": true,  // Optional, default true
  "fetchTimeout": 10000  // Optional, timeout in ms, default 10000
}
```

#### Request Body (Multiple Queries)

```json
{
  "query": ["First search query", "Second search query", "Third query"],
  // OR use "queries" parameter
  "queries": ["First search query", "Second search query"],
  "maxResults": 5,  // Optional, default 5, max 20
  "includeContent": true,  // Optional, default true
  "fetchTimeout": 10000  // Optional, timeout in ms, default 10000
}
```

#### Response (200 OK - Single Query)

```json
{
  "query": "Your search query",
  "count": 3,
  "results": [
    {
      "url": "https://example.com/page1",
      "title": "Page Title",
      "description": "Page description from search results",
      "content": "Extracted text content from the page...",
      "score": 0.95,
      "contentError": null
    },
    {
      "url": "https://example.com/page2",
      "title": "Another Page",
      "description": "Another description",
      "content": "",
      "score": 0.85,
      "contentError": "Request timeout"
    }
  ]
}
```

#### Response (200 OK - Multiple Queries)

```json
{
  "searches": [
    {
      "query": "First search query",
      "count": 2,
      "results": [
        {
          "url": "https://example.com/page1",
          "title": "Page Title",
          "description": "Description",
          "content": "Extracted content...",
          "score": 0.95,
          "contentError": null
        }
      ],
      "error": null
    },
    {
      "query": "Second search query",
      "count": 0,
      "results": [],
      "error": "Search service unavailable"
    }
  ],
  "totalSearches": 2,
  "totalResults": 2
}
```

**Note**: When using multiple queries, each search is executed in parallel. Individual search failures are captured in the `error` field but do not fail the entire request.

#### Error Responses

- **400 Bad Request**: Missing query/queries or invalid maxResults
- **401 Unauthorized**: Missing or invalid JWT token, or email not in allowed list
- **500 Internal Server Error**: Search service error

#### Examples

**Single Query:**
```bash
curl -X POST https://your-lambda-url.amazonaws.com/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "query": "latest developments in AI",
    "maxResults": 10
  }'
```

**Multiple Queries (Parallel Execution):**
```bash
curl -X POST https://your-lambda-url.amazonaws.com/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "query": ["quantum computing", "AI safety", "neural networks"],
    "maxResults": 5
  }'
```

---

### 3. Proxy Endpoint

**POST /proxy**

🔒 **Authentication Required**

Forwards requests to OpenAI-compatible API endpoints with JWT-based authentication for server-side API key injection. Validates all request parameters against OpenAI API specifications.

#### Request Headers

```
Content-Type: application/json
Authorization: Bearer <google-jwt-token>  // REQUIRED
```

#### Request Body

```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant"
    },
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "temperature": 0.7,  // Optional, 0-2
  "max_tokens": 1000,  // Optional
  "top_p": 0.9,  // Optional, 0-1
  "frequency_penalty": 0.0,  // Optional, -2 to 2
  "presence_penalty": 0.0,  // Optional, -2 to 2
  "stream": false,  // Optional
  "tools": [],  // Optional
  "apiKey": "your-api-key",  // Optional if authenticated with JWT
  "provider": "openai",  // Optional: "openai" or "groq"
  "targetUrl": "https://api.openai.com/v1/chat/completions"  // Optional
}
```

#### Response

The response is forwarded directly from the target API endpoint, preserving status codes and headers.

**Success (200 OK)**:
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
      "content": "Hello! I'm doing well, thank you for asking."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 12,
    "total_tokens": 22
  }
}
```

#### Error Responses

- **400 Bad Request**: Invalid request parameters (with details)
- **401 Unauthorized**: Missing or invalid JWT token, email not in allowed list, or missing API key
- **500 Internal Server Error**: Proxy or target API error

#### Request Validation

The proxy validates the following parameters:
- **Required**: `model`, `messages` (non-empty array with valid role/content)
- **Optional**: `temperature` (0-2), `max_tokens` (positive integer), `top_p` (0-1), `frequency_penalty` (-2 to 2), `presence_penalty` (-2 to 2), `stream` (boolean), `tools` (array)

#### API Key Handling

- **Authenticated users**: Uses environment variables (`OPENAI_API_KEY` or `GROQ_API_KEY`) based on provider
- **Fallback**: Can use `apiKey` in request body if environment keys not set
- **Requirement**: Must be authenticated AND have an API key (either from env or request body)

#### Example

```bash
curl -X POST https://your-lambda-url.amazonaws.com/proxy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "What is the capital of France?"}
    ]
  }'
```

---

### 4. Static File Server

**GET /** (default)  
**GET /index.html**  
**GET /css/styles.css**  
**GET /js/app.js**  
etc.

✅ **No Authentication Required** - Public Access

Serves static files from the `docs/` directory, including HTML, CSS, JavaScript, images, and other assets for the web user interface.

#### Response

- **200 OK**: File found and served
  - Text files (HTML, CSS, JS, JSON) are served as UTF-8
  - Binary files (images, fonts) are base64-encoded with `isBase64Encoded: true`
  - Includes `Cache-Control`, `Last-Modified`, and CORS headers

- **404 Not Found**: File not found or access denied

#### Security

- Path traversal attempts are blocked (e.g., `/../../../etc/passwd`)
- Only files within the `docs/` directory can be accessed
- Directory listing is not supported

#### Example

```bash
# Get the main application page
curl https://your-lambda-url.amazonaws.com/

# Get a specific CSS file
curl https://your-lambda-url.amazonaws.com/css/styles.css

# Get a JavaScript file
curl https://your-lambda-url.amazonaws.com/js/app.js
```

---

## CORS Support

All endpoints include CORS headers to allow cross-origin requests:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: content-type, authorization, origin, accept
Access-Control-Allow-Methods: GET, POST, OPTIONS
```

OPTIONS requests are handled automatically for preflight checks.

---

## Environment Variables

The following environment variables can be configured:

### Authentication
- `ALLOWED_EMAILS`: Comma-separated list of allowed email addresses for JWT authentication
- `GOOGLE_CLIENT_ID`: Google OAuth client ID for token verification

### API Keys
- `GROQ_API_KEY`: Server-side Groq API key (used when user is authenticated)
- `OPENAI_API_KEY`: Server-side OpenAI API key (used when user is authenticated)

### Proxy Configuration
- `OPENAI_API_URL`: Custom OpenAI-compatible API endpoint URL

---

## Rate Limiting and Quotas

Rate limiting is handled by the underlying LLM providers (Groq, OpenAI). The service will forward any rate limit errors from the providers to the client.

---

## Error Response Format

All endpoints return errors in a consistent JSON format:

```json
{
  "error": "Error message here",
  "details": ["Additional detail 1", "Additional detail 2"]  // Optional
}
```

---

## Testing

See the `tests/` directory for comprehensive unit and integration tests for all endpoints.

To run tests:
```bash
npm test
```

To run specific endpoint tests:
```bash
npm test tests/unit/endpoints/planning.test.js
npm test tests/unit/endpoints/search.test.js
npm test tests/unit/endpoints/proxy.test.js
npm test tests/unit/endpoints/static.test.js
npm test tests/integration/endpoints.test.js
```
