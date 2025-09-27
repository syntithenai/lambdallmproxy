# Lambda LLM Proxy & Intelligent Search System

An advanced AWS Lambda function that combines comprehensive web search with large language model processing to provide thorough, well-researched answers with citations and source references.

## Quick Start - Use the Makefile!

**⚡ For all deployments and builds, use the Makefile commands:**

```bash
# 🔥 RECOMMENDED FOR AI AGENTS - Quick deploy after code changes
make dev

# Deploy the Lambda function (legacy)
make deploy

# Deploy everything (Lambda + docs)
make full-deploy

# Build and deploy UI (build docs + push to git)
make deploy_ui

# Test the Lambda function
make test

# View all available commands (with AI agent recommendations)
make help
```

**The Makefile is your single interface for all operations - it ensures consistent, reliable deployments and builds.**

## 🤖 AI Agent Workflow

**For AI agents making code changes (per instructions.md):**

1. **Make Lambda code changes** in `src/` → **Always run `make dev`** (uses `scripts/deploy.sh`)
2. **Make UI changes** in `ui/index_template.html` → **Always run `make deploy-docs`** (uses `scripts/deploy-docs.sh`)
3. **Test immediately**: Visit https://lambdallmproxy.pages.dev
4. **Check output**: All commands pipe to `output.txt` for Copilot to read

See [AI_AGENT_WORKFLOW.md](AI_AGENT_WORKFLOW.md) for detailed AI agent instructions and [instructions.md](instructions.md) for project-specific requirements.

## Architecture

### Modular Design

The project is organized for maintainability and scalability:

- **`src/`** - Modularized source code
  - `lambda_search_llm_handler.js` - Main Lambda function with intelligent multi-search
  - `index.js` - Entry point that exports the handler
  - `auth.js` - Google OAuth authentication and email validation
  - `providers.js` - LLM provider configuration (OpenAI, Groq)  
  - `memory-tracker.js` - Memory management and token optimization
  - `html-parser.js` - HTML parsing and content extraction
  - `search.js` - DuckDuckGo search functionality with intelligent scoring
- **`scripts/`** - All deployment and build scripts
- **`Makefile`** - Centralized build automation

### System Flow

1. **Authentication**: Google OAuth with email allowlist validation
2. **Request Analysis**: LLM determines optimal search strategy (2-3 complementary queries)
3. **Multi-Search Execution**: Parallel execution of diverse search queries
4. **Content Processing**: Intelligent scoring, content extraction, and analysis
5. **Iterative Research**: Up to 3 search iterations with comprehensive coverage bias
6. **Expert Synthesis**: Authoritative response generation with full source utilization

## Key Features

### 🔍 Comprehensive Multi-Search System
- **Intelligent Search Planning**: AI generates 2-3 complementary search queries covering different aspects
- **Multi-Angle Coverage**: Systematic exploration of overviews, recent developments, and expert opinions
- **Iterative Research Loop**: Up to 3 search cycles with aggressive continuation bias
- **Comprehensive Coverage**: System biases toward thoroughness over efficiency

### 🧠 Advanced LLM Integration
- **Multiple Model Support**: OpenAI GPT-4, GPT-4o, Groq models (Llama 3.1)
- **Intelligent Decision Making**: AI determines whether to search or respond directly
- **Expert-Level Synthesis**: Authoritative responses with comprehensive source integration
- **Template-Driven Prompts**: Configurable system prompts and response templates

### 🌐 Sophisticated Search Engine
- **DuckDuckGo Integration**: High-quality search with intelligent result scoring
- **Authority Prioritization**: Wikipedia, academic, and news sources ranked higher
- **Parallel Processing**: Multiple search queries executed simultaneously
- **Content Extraction**: Full page content fetching and HTML parsing

### � Secure Authentication
- **Google OAuth Integration**: Frontend login with JWT token validation  
- **Email Allowlist**: Configurable authorized user list
- **Access Control**: Optional secret-based API protection
- **Token Verification**: Backend validation of Google JWT tokens with expiration checking

### ⚡ Performance Optimization
- **Buffered Invocation**: Optimal Lambda performance mode
- **Memory Management**: Intelligent token and memory tracking
- **Timeout Handling**: Configurable timeouts with retry logic
- **CORS Support**: Full cross-origin request support

## Multi-Search Enhancement Details

### How Comprehensive Search Works

1. **Broad Initial Strategy**: LLM analyzes query and provides 2-3 complementary searches:
   - Topic overview and definitions
   - Recent developments and current state  
   - Expert opinions and detailed analysis

2. **Parallel Execution**: Each search query runs independently against DuckDuckGo

3. **Thorough Analysis**: Each result set gets comprehensive 3-4 sentence summaries capturing:
   - ALL key information and facts
   - Important nuances and data points
   - Specific details, numbers, and dates

4. **Aggressive Continuation**: System evaluates if additional searches would improve answer quality by checking:
   - Multiple perspectives not yet covered
   - Recent developments or technical details missing
   - Expert opinions or case studies needed
   - Alternative approaches or counterarguments to explore

5. **Expert Synthesis**: Final response combines ALL research into authoritative answer ensuring:
   - Complete coverage of all important aspects
   - Synthesis from multiple source perspectives
   - Depth and nuance appropriate to question complexity
   - No important information left unaddressed

### Enhanced Response Format

```json
{
  "success": true,
  "query": "Your question",
  "answer": "Comprehensive, expertly-synthesized response from multiple searches",
  "searchSummaries": [
    {
      "searchQuery": "broad overview search terms",
      "summary": "Comprehensive findings with key details and insights"
    },
    {
      "searchQuery": "specific aspect search terms", 
      "summary": "Detailed analysis of specific aspects"
    },
    {
      "searchQuery": "expert opinions search terms",
      "summary": "Authority perspectives and expert analysis"
    }
  ],
  "links": [
    {
      "title": "Authoritative Source Title",
      "url": "https://example.com",
      "snippet": "Detailed description of source content"
    }
  ],
  "searchResults": [...], // Full JSON of all comprehensive search results
  "llmResponse": {
    "model": "gpt-4o",
    "usage": {...},
    "searchIterations": 2,
    "totalSearchQueries": 5
  },
  "mode": "multi-search"
}
```

## Authentication System

### Google OAuth Integration

The system includes comprehensive Google OAuth authentication:

**Frontend Features**:
- Login button with Google OAuth integration
- Profile picture display when authenticated
- Form disabled until user authentication
- Automatic token inclusion in all requests
- Logout functionality with session management

**Backend Validation**:
- JWT token verification with Google's certificates
- Email allowlist enforcement (`syntithenai@gmail.com` by default)
- Token expiration checking
- User profile extraction (email, name, picture)

**Configuration**:
- Google Client ID stored in environment variables
- Build process replaces template placeholders
- Cross-platform build support (bash and Node.js scripts)

### Setup Authentication

1. **Configure Google OAuth**:
```bash
# Add to .env file
GOOGLE_CLIENT_ID=your-google-client-id-here
```

2. **Build UI with Authentication**:
```bash
make build-docs  # Replaces {{GOOGLE_CLIENT_ID}} placeholder
```

3. **Test Authentication**:
- Open `docs/index.html` in browser
- Click "Sign in with Google" 
- Authenticate with allowed email address
- Submit requests through authenticated interface

## API Usage

### Basic Request Format

```bash
curl -X POST https://your-lambda-url.lambda-url.us-east-1.on.aws/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer google-jwt-token" \
  -d '{
    "query": "How does machine learning work?",
    "mode": "auto",
    "limit": 5,
    "model": "gpt-4o"
  }'
```

### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search query or question |
| `mode` | string | No | "auto" | Search mode: "auto", "search", "direct" |
| `limit` | number | No | 10 | Number of search results (1-50) |
| `model` | string | No | "gpt-4o" | LLM model selection |
| `max_tokens` | number | No | 2000 | Maximum response tokens |
| `temperature` | number | No | 0.7 | LLM creativity (0.0-1.0) |
| `access_secret` | string | Conditional | - | API access secret if configured |

### Search Modes

- **`auto`**: LLM intelligently decides whether to search or respond directly
- **`search`**: Forces comprehensive web search with multi-iteration loop  
- **`direct`**: Responds directly without web search

### Authentication Headers

When Google OAuth is enabled:
```bash
-H "Authorization: Bearer google-jwt-token-here"
```

### Basic Request

```bash
curl -X POST https://your-lambda-url.lambda-url.us-east-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the latest developments in AI?",
    "api_key": "your-openai-api-key",
    "access_secret": "your-access-secret"
  }'
```

### Request Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | Your question or request |
| `api_key` | Yes | OpenAI API key |
| `access_secret` | Yes | Function access secret |

| `model` | No | Model (default: "openai:gpt-4o-mini") |
| `limit` | No | Max search results (1-50, default: 5) |

### Response Format

```json
{
  "success": true,
  "query": "Your question",
  "answer": "Comprehensive response with citations",
  "searchResults": {
    "totalFound": 15,
    "returned": 5,
    "results": [...]
  },
  "llmResponse": {
    "model": "openai:gpt-4o-mini",
    "usage": {...},
    "processingTime": 2500
  },
  "processingTimeMs": 3200,
  "timestamp": "2025-09-21T15:45:23.456Z",
  "mode": "search"
}
```

## Environment Variables

All environment variables in the `.env` file are actively used in the application. The system has been optimized with no unused configuration variables:

### Lambda Handler Variables
- **`ALLOWED_EMAILS`** - Email allowlist for authentication validation
- **`ACCESS_SECRET`** - Secret for function access protection  
- **`LAMBDA_MEMORY`** - Memory tracking and optimization configuration
- **`SYSTEM_PROMPT_DIGEST_ANALYST`** - LLM system prompt for search result analysis
- **`SYSTEM_PROMPT_CONTINUATION_STRATEGIST`** - LLM system prompt for search continuation decisions
- **`DIGEST_TEMPLATE`** - Template for analyzing search results
- **`CONTINUATION_TEMPLATE`** - Template for deciding whether to continue searching
- **`FINAL_TEMPLATE`** - Template for generating final comprehensive answers

### Provider Configuration Variables
- **`OPENAI_API_KEY`** - OpenAI API authentication token
- **`GROQ_API_KEY`** - Groq API authentication token
- **`OPENAI_MODEL`** - OpenAI model selection (e.g., "gpt-4o")
- **`OPENAI_API_BASE`** - OpenAI API base URL (default: "https://api.openai.com/v1")
- **`GROQ_MODEL`** - Groq model selection (e.g., "llama-3.1-8b-instant")

### Deployment & UI Variables  
- **`LAMBDA_URL`** - AWS Lambda function URL for frontend integration
- **`LAMBDA_TIMEOUT`** - Lambda function timeout setting (seconds)
- **`GOOGLE_CLIENT_ID`** - Google OAuth client ID for authentication
- **`NODE_ENV`** - Environment mode (development/production)

### Variable Usage Analysis
✅ **All variables are actively used** - No dead configuration found  
✅ **Lambda Handler**: 8 variables for authentication, prompts, and templates  
✅ **Provider Config**: 5 variables for LLM API configuration  
✅ **Deployment**: 4 variables for UI build and Lambda deployment  
✅ **Development**: 1 variable for environment mode

## Deployment

### Prerequisites

- AWS CLI installed and configured
- Node.js 18+ (for Node.js deployment script)
- jq (for JSON parsing, optional but recommended)

### Deployment Options

1. **Bash Script**: `./deploy.sh` - Comprehensive with colorized output
2. **Node.js Script**: `./deploy.mjs` - Cross-platform compatibility  
3. **Makefile**: `make deploy` - Simple one-command deployment

### What Deployment Does

- ✅ Validates prerequisites and AWS configuration
- ✅ Creates deployment package with ES module support
- ✅ Updates Lambda function code
- ✅ Configures environment variables
- ✅ Verifies and sets CORS configuration
- ✅ Tests function deployment
- ✅ Cleans up temporary files

### CORS Configuration

Automatically configured for cross-origin requests:

- **AllowOrigins**: `*`
- **AllowMethods**: `*`  
- **AllowHeaders**: `content-type`, `authorization`, `origin`
- **InvokeMode**: `BUFFERED`
- **AllowCredentials**: `true`

## Testing Interface

Use the included `test.html` file for browser-based testing:

```bash
# Start local server
python3 -m http.server 8080

# Open in browser
open http://localhost:8080/test.html
```

The interface includes:
- Model selection dropdown
- Search mode radio buttons
- API key input
- Real-time response display

## Makefile Commands

```bash
make deploy          # Deploy using bash script
make deploy-node     # Deploy using Node.js script
make test           # Test the deployed function
make check          # Check prerequisites
make cors           # Check CORS configuration
make env            # Show environment variables
make info           # Show function information
make logs           # Show recent logs
make clean          # Clean temporary files
```

## Architecture

### Decision Flow

1. **Request Validation**: Validates API key, access secret, and parameters
2. **Search Mode Logic**:
   - **Auto**: LLM decides whether search is needed
   - **Search**: Forces web search with DuckDuckGo
   - **Direct**: Responds directly without search
3. **Content Processing**: Extracts and processes relevant content
4. **LLM Analysis**: Generates comprehensive response with citations
5. **Response Assembly**: Formats final response with metadata

### Performance Optimizations

- **Buffered Invocation**: Optimal Lambda performance mode
- **Intelligent Scoring**: Prioritizes Wikipedia and authoritative sources
- **Content Caching**: Efficient content extraction and processing
- **Retry Logic**: Automatic retry for transient failures
- **Timeout Management**: Configurable timeouts for all operations

## Error Handling

The function provides detailed error responses:

```json
{
  "success": false,
  "error": "Error description",
  "errorType": "ERROR_TYPE",
  "timestamp": "2025-09-21T15:45:23.456Z",
  "processingTimeMs": 500
}
```

### Common Error Types

- `INVALID_API_KEY` - OpenAI API key is invalid
- `UNAUTHORIZED` - Access secret is missing or invalid
- `SEARCH_FAILED` - Search operation failed
- `LLM_ERROR` - OpenAI API error
- `TIMEOUT` - Operation exceeded timeout limit

## Development

### Local Testing

```bash
# Test with curl
curl -X POST http://localhost:8080/test \
  -H "Content-Type: application/json" \
  -d '{"query":"test","api_key":"your-key"}'

# Check logs
make logs

# Validate deployment
make check
```

### File Structure

```
├── lambda_search_llm_handler.js    # Main Lambda function
├── deploy.sh                       # Bash deployment script
├── deploy.mjs                      # Node.js deployment script
├── Makefile                        # Deployment commands
├── test.html                       # Browser testing interface
├── package.json                    # Node.js configuration
└── README.md                       # This file
```

## Security

- API keys are never logged or stored
- Access secret validation prevents unauthorized use
- CORS configuration allows controlled cross-origin access
- Environment variables protect sensitive configuration
- Request validation prevents malicious inputs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with `make test`
5. Deploy and verify with `make deploy`
6. Submit a pull request

## Support

If you encounter issues:

1. Run `make check` to verify prerequisites
2. Check deployment output for specific errors
3. Review AWS CloudWatch logs with `make logs`
4. Verify CORS configuration with `make cors`
5. Test with the HTML interface

## License

MIT License - see LICENSE file for details.

---

**Live Function URL**: https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/
{
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "What is Node.js?"}
  ],
  "max_tokens": 500,
  "temperature": 0.7
}
```

### 2. Search Handler (`lambda_search_handler.js`)

#### GET Request
```
GET /search?query=nodejs&limit=5&content=true&timeout=15&access_secret=your_secret
```

#### POST Request
```json
{
  "query": "machine learning",
  "limit": 3,
  "content": true,
  "timeout": 15,
  "access_secret": "your_secret"
}
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search query string |
| `limit` | number | No | 10 | Number of results to return (1-50) |
| `content` | boolean | No | false | Whether to fetch full page content |
| `timeout` | number | No | 10 | Request timeout in seconds (1-60) |
| `access_secret` | string | Conditional* | - | Access secret for restricted deployments |

*Required only if ACCESS_SECRET environment variable is set

#### Response Format
```json
{
  "success": true,
  "query": "nodejs",
  "totalFound": 15,
  "returned": 5,
  "limit": 5,
  "fetchContent": false,
  "timeout": 10,
  "processingTimeMs": 2500,
  "timestamp": "2025-09-21T04:31:01.950Z",
  "results": [
    {
      "title": "Node.js - Wikipedia",
      "url": "https://en.wikipedia.org/wiki/Node.js",
      "description": "Node.js is a JavaScript runtime...",
      "score": 250,
      "duckduckgoScore": null,
      "state": ""
    }
  ],
  "metadata": {
    "query": "nodejs",
    "totalResults": 15,
    "searchTime": 1200,
    "parseTime": 4,
    "contentTime": 0,
    "totalTime": 2500,
    "timeoutMs": 10000,
    "timestamp": "2025-09-21T04:31:01.949Z"
  }
}
```

### 3. Combined Search + LLM Handler (`lambda_search_llm_handler.js`)

#### POST Request
```json
{
  "query": "How does machine learning work?",
  "limit": 3,
  "model": "gpt-4",
  "max_tokens": 1500,
  "temperature": 0.7,
  "access_secret": "your_secret"
}
```

#### Additional Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `model` | string | No | "gpt-4" | OpenAI model to use |
| `max_tokens` | number | No | 2000 | Maximum response tokens |
| `temperature` | number | No | 0.7 | LLM creativity (0.0-1.0) |

#### Response Format
```json
{
  "success": true,
  "query": "How does machine learning work?",
  "answer": "Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed...",
  "searchResults": {
    "totalFound": 12,
    "returned": 3,
    "results": [
      {
        "title": "Machine Learning - Wikipedia",
        "url": "https://en.wikipedia.org/wiki/Machine_learning",
        "content": "Full page content...",
        "score": 250
      }
    ]
  },
  "llmResponse": {
    "model": "gpt-4",
    "usage": {
      "prompt_tokens": 1200,
      "completion_tokens": 500,
      "total_tokens": 1700
    }
  },
  "processingTimeMs": 8500,
  "timestamp": "2025-09-21T04:31:01.950Z"
}
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "Missing or invalid query parameter",
  "message": "Query parameter is required and must be a non-empty string"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing access_secret"
}
```

### 408 Request Timeout
```json
{
  "success": false,
  "error": "Search request timed out",
  "message": "Request timeout after 10000ms",
  "timestamp": "2025-09-21T04:31:01.950Z"
}
```

## Local Testing

### Prerequisites
- Node.js installed
- Terminal/command line access
- Optional: OpenAI API key for full LLM testing

### Environment Variables
```bash
# Required for LLM functions
export OPENAI_API_KEY="your-openai-api-key-here"

# Optional: Add access control (all functions)
export ACCESS_SECRET="your-secret-password"
```

### Quick Tests

#### 1. LLM Proxy Test
```bash
node lambda_function_llmproxy.js
```

#### 2. Search Handler Test
```bash
node lambda_search_handler.js
```

#### 3. Combined Search + LLM Test
```bash
# Set API key and run test script
export OPENAI_API_KEY="your-key-here"
./searchllm.sh
```

### Custom Tests

#### Search Only
```bash
node -e "
const { handler } = require('./lambda_search_handler.js');

async function test() {
  const result = await handler({
    httpMethod: 'GET',
    queryStringParameters: {
      query: 'python programming',
      limit: '5'
    }
  }, {});
  
  const body = JSON.parse(result.body);
  console.log('Found:', body.totalFound, 'results');
  body.results.forEach((r, i) => {
    console.log(\`\${i+1}. \${r.title} (score: \${r.score})\`);
  });
}

test().catch(console.error);
"
```

#### Search + LLM
```bash
node -e "
const { handler } = require('./lambda_search_llm_handler.js');

async function test() {
  const result = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({
      query: 'What is Node.js and what is it used for?',
      limit: 3,
      model: 'gpt-4',
      max_tokens: 800
    })
  }, {});
  
  const body = JSON.parse(result.body);
  console.log('Status:', result.statusCode);
  console.log('Search found:', body.searchResults?.totalFound, 'results');
  console.log('\\nLLM Answer:');
  console.log(body.answer);
}

test().catch(console.error);
"
```

### HTML Test Interface

```bash
# Start a local server
npx serve

# Open browser to: http://localhost:3000/test.html
```

## Deployment

### AWS Lambda Deployment

1. **Package the function:**
```bash
# For search handler
zip -r lambda-search.zip lambda_search_handler.js

# For LLM handler  
zip -r lambda-llm.zip lambda_search_llm_handler.js

# For LLM proxy
zip -r lambda-proxy.zip lambda_function_llmproxy.js
```

2. **Deploy to AWS Lambda:**
```bash
aws lambda create-function \
  --function-name search-handler \
  --runtime nodejs18.x \
  --role arn:aws:iam::your-account:role/lambda-execution-role \
  --handler lambda_search_handler.handler \
  --zip-file fileb://lambda-search.zip \
  --timeout 60 \
  --memory-size 512
```

3. **Set environment variables:**
```bash
aws lambda update-function-configuration \
  --function-name search-handler \
  --environment Variables='{ACCESS_SECRET=your-secret,OPENAI_API_KEY=your-key}'
```

4. **Create function URL:**
```bash
aws lambda create-function-url-config \
  --function-name search-handler \
  --cors '{"AllowOrigins":["*"],"AllowMethods":["GET","POST"],"AllowHeaders":["content-type"]}' \
  --auth-type NONE
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for LLM functions | LLM functions only |
| `ACCESS_SECRET` | API access control secret | Optional |
| `MAX_TIMEOUT` | Maximum allowed timeout in seconds | No (default: 60) |
| `MAX_RESULTS` | Maximum allowed result limit | No (default: 50) |

## Performance & Security

### Performance Characteristics
- **Multi-search handler**: ~8-20 seconds per comprehensive research request
- **Direct response**: ~2-5 seconds without search
- **Memory usage**: 512MB recommended for optimal performance
- **Cold starts**: First request may take additional 2-3 seconds
- **Comprehensive coverage**: Multiple searches ensure thorough analysis

### Security Features
- **Google OAuth**: Secure user authentication with JWT validation
- **Email Allowlist**: Configurable authorized user restrictions
- **API Keys**: Never logged or stored in responses
- **Access Control**: Optional secret-based API protection
- **CORS**: Controlled cross-origin access configuration
- **Input Validation**: All parameters validated and sanitized

### Cost Optimization
- **Intelligent Scoring**: Prioritizes high-quality sources efficiently
- **Parallel Processing**: Multiple operations run simultaneously
- **Memory Management**: Optimized token usage and content processing
- **Timeout Controls**: Prevents runaway operations

## Monitoring & Troubleshooting

### CloudWatch Integration
- **Logs**: All requests and errors logged
- **Metrics**: Execution duration, error rates, memory usage
- **Alarms**: Set up alerts for high error rates or timeouts

### Common Issues
1. **"No results found"**: Try simpler search terms like "nodejs" or "python"
2. **"API key" errors**: Expected without OpenAI API key; search functionality still works
3. **Timeout errors**: Increase timeout parameter or check network connection
4. **Permission errors**: Set ACCESS_SECRET environment variable if required

### Debug Mode
Enable verbose logging by setting environment variables or adding debug flags in your test code.

## Dependencies

- **Zero external dependencies**: Uses only Node.js built-in modules
- **Self-contained**: All scraping and parsing logic included
- **AWS Lambda Runtime**: Node.js 18.x or later recommended

## Limitations

- **Search source**: Limited to DuckDuckGo search results
- **Content size**: Large pages may hit Lambda memory limits
- **Network dependencies**: Requires internet access for search and content fetching
- **Rate limiting**: DuckDuckGo may implement rate limiting for high-volume usage
- **LLM costs**: OpenAI API usage charges apply for LLM functionality