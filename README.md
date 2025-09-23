# Lambda LLM Proxy & Search Functions

An intelligent AWS Lambda function that combines web search with LLM processing to provide comprehensive answers with citations and source references.

## Features

- 🔍 **Intelligent Search Decision Making**: AI determines whether to search or respond directly
- 🔄 **Multi-Search Loop**: Iterative search refinement with up to 3 search cycles
- 🌐 **DuckDuckGo Integration**: High-quality search results with sophisticated scoring  
- 🤖 **Multiple OpenAI Models**: Support for GPT-5, GPT-4, and other models
- 📱 **Multiple Search Modes**: Auto-detect, Force Search, or Direct Response
- 🔒 **Secure Access**: Environment-based API key and access secret protection
- ⚡ **Optimized Performance**: Buffered invocation and intelligent caching
- 🌍 **CORS Enabled**: Ready for browser-based cross-origin requests
- 📄 **Content Extraction**: Full page content fetching and analysis
- 📊 **Comprehensive Logging**: Detailed processing metrics and debugging
- 🔗 **Enhanced Response Format**: Search summaries, source links, and full JSON results

## Multi-Search Enhancement

The system now supports intelligent multi-search loops that can perform up to 3 iterations of searching:

### How It Works

1. **Initial Decision**: LLM analyzes the query and determines if it needs search, providing 1-3 optimized search queries
2. **Search Execution**: Each search query is executed independently against DuckDuckGo
3. **Result Digestion**: Each set of search results is processed and summarized by the LLM
4. **Continuation Decision**: LLM analyzes gathered information to determine if additional searches are needed
5. **Final Synthesis**: All information is combined into a comprehensive, well-cited response

### Enhanced Response Format

```json
{
  "success": true,
  "query": "Your question",
  "answer": "Comprehensive response synthesized from multiple searches",
  "searchSummaries": [
    {
      "searchQuery": "search terms used",
      "summary": "Key findings from this search"
    }
  ],
  "links": [
    {
      "title": "Source Title",
      "url": "https://example.com",
      "snippet": "Brief description..."
    }
  ],
  "searchResults": [...], // Full JSON of all search results
  "llmResponse": {
    "model": "gpt-5-nano",
    "usage": {...},
    "searchIterations": 2,
    "totalSearchQueries": 3
  },
  "mode": "multi-search"
}
```

### Benefits

- **Comprehensive Coverage**: Multiple targeted searches cover different aspects of complex questions
- **Iterative Refinement**: Follow-up searches fill knowledge gaps identified in initial results
- **Better Source Coverage**: Diverse search queries lead to more comprehensive source material
- **Intelligent Stopping**: System stops when sufficient information is gathered, avoiding unnecessary API calls

## Quick Start

### Option 1: Using Makefile (Recommended)

```bash
# Check prerequisites
make check

# Deploy the function
make deploy

# Test the deployment
make test
```

### Option 2: Manual Deployment

```bash
# Using bash script
./deploy.sh

# Using Node.js script
./deploy.mjs
```

## API Usage

### Basic Request

```bash
curl -X POST https://your-lambda-url.lambda-url.us-east-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the latest developments in AI?",
    "api_key": "your-openai-api-key",
    "access_secret": "your-access-secret",
    "search_mode": "auto"
  }'
```

### Search Modes

- **`auto`** - Let AI decide whether to search or respond directly (default)
- **`search`** - Always search for current information
- **`direct`** - Answer directly without searching

### Request Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | Your question or request |
| `api_key` | Yes | OpenAI API key |
| `access_secret` | Yes | Function access secret |
| `search_mode` | No | Search behavior: "auto", "search", or "direct" |
| `model` | No | OpenAI model (default: "gpt-5-nano") |
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
    "model": "gpt-5-nano",
    "usage": {...},
    "processingTime": 2500
  },
  "processingTimeMs": 3200,
  "timestamp": "2025-09-21T15:45:23.456Z",
  "mode": "search"
}
```

## Environment Variables

- **`OPENAI_API_URL`** - OpenAI API hostname (default: "api.openai.com")
- **`ACCESS_SECRET`** - Secret for function access protection

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

## Performance & Costs

### Performance Characteristics
- **Search handler**: ~2-5 seconds per request
- **Combined handler**: ~5-15 seconds per request (includes LLM processing)
- **Memory usage**: 512MB recommended for content fetching
- **Cold starts**: First request may take 2-3 seconds longer
- **10x scraping**: Better result quality through extensive initial scraping

### Cost Estimation
- **Execution time**: $0.000001 per request + execution time charges
- **Memory**: 128-512MB depending on configuration
- **LLM costs**: Separate OpenAI API charges apply

## Advanced Features

### Intelligent Scoring System
- **Wikipedia priority**: Highest scores for authoritative sources
- **Domain authority**: News organizations, academic sites prioritized
- **Query relevance**: Advanced token matching in titles and descriptions
- **Content quality**: Longer, more detailed descriptions scored higher

### Content Fetching
- **Parallel processing**: Multiple URLs fetched simultaneously
- **Timeout handling**: Individual timeouts per URL
- **Content extraction**: HTML parsed to clean text for LLM processing
- **Size limits**: 50KB limit per page to avoid memory issues

### LLM Integration
- **Automatic content**: Search+LLM handler always fetches content regardless of parameter
- **Source citations**: LLM responses reference specific search results
- **Model flexibility**: Support for GPT-4, GPT-3.5-turbo, and other OpenAI models
- **Parameter control**: Temperature, max_tokens, and other settings configurable

## Security

- **CORS**: Configured for cross-origin requests
- **Input validation**: All parameters validated and sanitized
- **Error handling**: Sensitive information not exposed in error messages
- **Access control**: Optional ACCESS_SECRET for API protection
- **Rate limiting**: Consider implementing API Gateway throttling for production

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