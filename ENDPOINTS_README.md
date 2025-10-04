# Lambda LLM Proxy - Multi-Endpoint API

A serverless AWS Lambda function that provides multiple endpoints for AI-powered research, search, and LLM proxy capabilities.

## Features

- 🧠 **Planning Endpoint**: Generate research plans using Groq reasoning models
- 🔍 **Search Endpoint**: DuckDuckGo search with content extraction and scoring
- 🔄 **Proxy Endpoint**: Forward requests to OpenAI-compatible APIs with validation and auth injection
- 📄 **Static File Server**: Serve web UI and documentation
- 🔐 **JWT Authentication**: Optional Google OAuth token verification for server-side API key injection
- ✅ **Request Validation**: Comprehensive parameter validation for all endpoints
- 🧪 **Comprehensive Tests**: Full unit and integration test coverage

## Quick Start

### Installation

```bash
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific endpoint tests
npm test tests/unit/endpoints/
npm test tests/integration/endpoints.test.js

# Run with coverage
npm test:coverage
```

### Deployment

```bash
# Deploy Lambda function
./scripts/deploy.sh

# Build and deploy documentation
./scripts/build-docs.sh
./scripts/deploy-docs.sh

# Or use make commands
make deploy
make deploy-docs
```

## API Endpoints

### 1. POST /planning

Generate a research plan with search keywords, questions, and expert persona.

```bash
curl -X POST https://your-lambda-url/planning \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Explain quantum computing",
    "apiKey": "your-groq-api-key"
  }'
```

**Response:**
```json
{
  "text": "Research strategy explanation",
  "searchKeywords": [["quantum", "computing"], ["qubits", "superposition"]],
  "questions": ["What is quantum computing?", "How do qubits work?"],
  "persona": "I am a quantum computing researcher...",
  "complexityAssessment": "high"
}
```

### 2. POST /search

Perform DuckDuckGo search with content extraction.

```bash
curl -X POST https://your-lambda-url/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "latest AI developments",
    "maxResults": 5
  }'
```

**Response:**
```json
{
  "query": "latest AI developments",
  "count": 5,
  "results": [
    {
      "url": "https://example.com",
      "title": "AI Breakthrough",
      "description": "Latest developments...",
      "content": "Extracted page content...",
      "score": 0.95
    }
  ]
}
```

### 3. POST /proxy

Forward requests to OpenAI-compatible APIs with validation.

```bash
curl -X POST https://your-lambda-url/proxy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### 4. GET /* (Static Files)

Serve static web UI and documentation.

```bash
curl https://your-lambda-url/
curl https://your-lambda-url/css/styles.css
curl https://your-lambda-url/js/app.js
```

## Architecture

### Directory Structure

```
src/
├── index.js                    # Main router
├── endpoints/
│   ├── planning.js            # Research planning endpoint
│   ├── search.js              # DuckDuckGo search endpoint
│   ├── proxy.js               # OpenAI-compatible proxy
│   └── static.js              # Static file server
├── auth.js                    # JWT authentication
├── providers.js               # LLM provider configs
├── search.js                  # DuckDuckGo searcher
├── html-parser.js             # HTML content extraction
├── llm_tools_adapter.js       # LLM API adapter
├── tools.js                   # Tool functions
├── config/                    # Configuration modules
└── utils/                     # Utility functions

tests/
├── unit/
│   └── endpoints/             # Unit tests for each endpoint
└── integration/
    └── endpoints.test.js      # Integration tests for router

docs/
├── API.md                     # Complete API documentation
└── [static files]             # Web UI files
```

### Endpoint Routing

The main handler in `src/index.js` routes requests based on HTTP method and path:

- `POST /planning` → `endpoints/planning.js`
- `POST /search` → `endpoints/search.js`
- `POST /proxy` → `endpoints/proxy.js`
- `GET /*` → `endpoints/static.js`
- `OPTIONS *` → CORS preflight handler

## Authentication

### JWT-Based Authentication

When environment variables `ALLOWED_EMAILS` and `GOOGLE_CLIENT_ID` are configured, the service supports JWT-based authentication:

1. Client obtains a Google OAuth token
2. Client includes token in `Authorization: Bearer <token>` header
3. Service verifies token and checks if email is in allowed list
4. If valid, service uses server-side API keys (from env vars) instead of requiring client-provided keys

### Environment Variables

```bash
# Authentication
ALLOWED_EMAILS=user1@example.com,user2@example.com
GOOGLE_CLIENT_ID=your-google-client-id

# API Keys (used for authenticated requests)
GROQ_API_KEY=your-groq-api-key
OPENAI_API_KEY=your-openai-api-key

# Optional Proxy Configuration
OPENAI_API_URL=https://api.openai.com/v1/chat/completions
```

## Request Validation

The proxy endpoint validates all parameters against OpenAI API specifications:

- **Required**: `model`, `messages` (with valid roles and content)
- **Optional**: `temperature` (0-2), `max_tokens` (positive int), `top_p` (0-1), etc.
- Returns **400 Bad Request** with detailed error messages for invalid parameters

## Development

### Local Testing

```bash
# Run unit tests in watch mode
npm run test:watch

# Run tests with debug output
DEBUG_TESTS=1 npm test

# Run specific test file
npm test tests/unit/endpoints/planning.test.js
```

### Adding New Endpoints

1. Create endpoint file in `src/endpoints/`
2. Export `handler` function with Lambda event/context signature
3. Add route in `src/index.js`
4. Create unit tests in `tests/unit/endpoints/`
5. Add integration tests in `tests/integration/endpoints.test.js`
6. Update `docs/API.md` with endpoint documentation

### Code Structure

Each endpoint module should export:
- `handler(event, context)` - Main Lambda handler
- Helper functions for testing (e.g., `validateRequest`, `processData`)

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "details": ["Additional info"]  // Optional
}
```

Common error codes:
- **400**: Bad Request (invalid parameters)
- **401**: Unauthorized (missing/invalid auth)
- **404**: Not Found (static files only)
- **405**: Method Not Allowed
- **500**: Internal Server Error

## CORS Support

All endpoints include CORS headers for cross-origin requests:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: content-type, authorization, origin, accept
Access-Control-Allow-Methods: GET, POST, OPTIONS
```

## Testing

### Unit Tests

Each endpoint has comprehensive unit tests covering:
- Valid requests with expected responses
- Invalid inputs and parameter validation
- Error handling and edge cases
- Authentication and authorization
- CORS headers

### Integration Tests

Integration tests verify:
- Request routing to correct endpoints
- End-to-end request/response flow
- Error handling across the router
- CORS preflight handling
- Multiple event format support

### Running Tests

```bash
# All tests
npm test

# Specific test suite
npm test tests/unit/endpoints/planning.test.js

# With coverage report
npm run test:coverage

# Watch mode for development
npm run test:watch
```

## Documentation

- **API Reference**: See [docs/API.md](docs/API.md) for complete endpoint documentation
- **Architecture**: See inline code comments and JSDoc annotations
- **Examples**: See test files for usage examples

## License

MIT

## Contributing

1. Create feature branch
2. Add comprehensive tests
3. Ensure all tests pass: `npm test`
4. Update documentation as needed
5. Submit pull request

## Support

For issues, questions, or contributions, please open an issue on GitHub.
