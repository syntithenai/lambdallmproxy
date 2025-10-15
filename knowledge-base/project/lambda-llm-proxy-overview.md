# Lambda LLM Proxy - Project Documentation

## Overview

Lambda LLM Proxy is an AWS Lambda-based service that provides intelligent routing and management for multiple Large Language Model (LLM) providers. The system combines comprehensive web search capabilities with RAG (Retrieval-Augmented Generation) to deliver well-researched, cited responses.

## Core Features

### 1. Multi-Provider LLM Support

The proxy supports multiple LLM providers with automatic failover and intelligent routing:

- **OpenAI**: GPT-4, GPT-3.5-turbo, GPT-4-turbo
- **Anthropic**: Claude 3 (Opus, Sonnet, Haiku)
- **Groq**: Fast inference with Mixtral, Llama models
- **Google**: Gemini Pro, Gemini Flash
- **Cohere**: Command models
- **Mistral**: Mistral Large, Medium, Small

### 2. Intelligent Model Selection

Automatic model selection based on:
- Request complexity analysis
- Cost optimization (free tier prioritization)
- Rate limit awareness
- Model health tracking
- Historical performance metrics

**Optimization Modes:**
- **Cheap**: Free providers first, minimal cost
- **Balanced**: Cost-per-quality optimization
- **Powerful**: Best models for complex tasks
- **Fastest**: Performance-based selection (Groq typically 50-100ms TTFT)

### 3. RAG System

Retrieval-Augmented Generation with:
- Vector database storage (libSQL)
- Multiple file format support (PDF, DOCX, HTML, TXT, MD, CSV, JSON)
- Intelligent chunking with LangChain
- Source metadata tracking
- Semantic search with embeddings
- File upload and URL ingestion

### 4. Web Search Integration

Comprehensive search capabilities:
- YouTube video transcripts
- Google search results
- Web page scraping
- Source citation
- Result ranking and filtering

## Architecture

### Lambda Function

- **Runtime**: Node.js 20.x
- **Memory**: 1024-3008 MB (configurable)
- **Timeout**: 5 minutes (API Gateway) / 15 minutes (direct invoke)
- **Storage**: 512 MB ephemeral (/tmp)

### Lambda Layers

**Dependencies Layer** (27 MB):
- ytdl-core, ffmpeg, puppeteer, chromium
- form-data, google-auth-library, jsonwebtoken
- LangChain, pdf-parse, mammoth, cheerio

**Knowledge Base Layer** (future):
- Pre-populated vector database
- ~13-17 MB for 1,000-2,000 documents

### Storage

- **Google Sheets**: Document metadata, RAG files, usage logs
- **libSQL Database**: Vector embeddings, chunk storage
- **S3**: Lambda deployment packages, layers

## Deployment

### Quick Start (Makefile)

```bash
# First-time setup - create Lambda layer
make setup-layer

# Fast deployment (code only, 10 seconds)
make fast

# Full deployment (code + dependencies, 3 minutes)
make deploy

# Deploy UI
make deploy_ui

# Test function
make test
```

### Manual Deployment

```bash
# Install dependencies
npm install

# Deploy with Serverless
npx serverless deploy

# Or use deployment script
./scripts/deploy-fast.sh
```

### Environment Variables

Required:
- `OPENAI_API_KEY` - OpenAI API key
- `GOOGLE_SHEETS_CREDENTIALS` - Service account credentials JSON
- `GOOGLE_SHEETS_SPREADSHEET_ID` - Target spreadsheet ID

Optional:
- `ANTHROPIC_API_KEY` - Anthropic API key
- `GROQ_API_KEY` - Groq API key
- `GOOGLE_AI_API_KEY` - Google AI API key
- `LIBSQL_URL` - Database URL (default: file:///tmp/rag.db)

## RAG System Usage

### Ingesting Documents

```bash
# Ingest entire directory
node scripts/ingest-documents.js ./knowledge-base

# With custom settings
node scripts/ingest-documents.js ./docs \
  --db-path ./custom.db \
  --chunk-size 1024 \
  --batch-size 50

# Dry run to preview
node scripts/ingest-documents.js ./docs --dry-run

# Resume interrupted ingestion
node scripts/ingest-documents.js ./docs --resume
```

### File Upload API

```javascript
POST /file
Content-Type: multipart/form-data

{
  file: <binary>,
  metadata: {
    name: "document.pdf",
    mimeType: "application/pdf",
    source_type: "file"
  }
}
```

### Search API

```javascript
POST /rag-search
Content-Type: application/json

{
  query: "How do I use RAG?",
  topK: 5,
  threshold: 0.7,
  filters: {
    source_type: "file"
  }
}
```

## API Endpoints

### Chat Completion

```
POST /v1/chat/completions
```

OpenAI-compatible chat completion with:
- Streaming support
- Function calling
- Model selection
- RAG integration

### Embeddings

```
POST /v1/embeddings
```

Generate embeddings for text with various models.

### RAG Operations

```
POST /rag-search      - Search vector database
POST /rag-ingest      - Ingest new document
POST /file            - Upload file
GET /file/:id         - Retrieve file
DELETE /file/:id      - Delete file
```

### YouTube Operations

```
POST /youtube-search    - Search YouTube videos
POST /youtube-transcript - Get video transcript
POST /youtube-cast      - Cast to Chromecast
```

## Model Selection

### How It Works

1. **Request Analysis**
   - Extract complexity signals (length, technical terms, questions)
   - Classify as simple/medium/complex
   - Determine required capabilities (streaming, functions, etc.)

2. **Provider Selection**
   - Check rate limits for each provider
   - Calculate cost-per-quality scores
   - Apply optimization mode preferences
   - Select best available model

3. **Execution**
   - Send request to selected provider
   - Track performance metrics
   - Handle errors with automatic failover
   - Update model health scores

### Configuration

```javascript
{
  optimizationMode: 'balanced',  // cheap, balanced, powerful, fastest
  maxTokens: 4000,
  temperature: 0.7,
  allowedProviders: ['openai', 'anthropic', 'groq'],
  requireStreaming: false
}
```

## Monitoring

### Google Sheets Logging

Automatic logging to Google Sheets:
- **RAG_Searches**: Search queries, results, timestamps
- **RAG_Files**: Uploaded files, metadata, storage info
- **Usage**: API calls, tokens, costs, latency

### Metrics Tracked

- Request count by provider
- Token usage (prompt + completion)
- Cost per request
- Latency (TTFT, total time)
- Error rates
- Rate limit hits

## Performance

### Benchmarks

- **Fast deployment**: 10 seconds (code only)
- **Full deployment**: 2-3 minutes (with dependencies)
- **Cold start**: 2-5 seconds
- **Warm request**: 50-200 ms overhead
- **Groq TTFT**: 50-100 ms (fastest)
- **Vector search**: <15 ms for 1,000 chunks

### Optimization Tips

1. **Use Lambda layers**: 10x faster deployments
2. **Keep functions warm**: Scheduled pings
3. **Optimize bundle size**: Tree shaking, minification
4. **Cache embeddings**: Reuse for repeated content
5. **Batch operations**: Process multiple items together
6. **Use Groq for speed**: When latency critical

## Development

### Local Testing

```bash
# Test RAG ingestion
node tests/test-libsql-storage.js

# Test file loaders
node tests/test-file-loaders.js

# Test LangChain chunking
node tests/test-chunker-langchain.js

# Test model selection
node test-model-selection.js
```

### Building UI

```bash
cd ui-new
npm install
npm run dev    # Development server
npm run build  # Production build
```

### Debugging

Enable debug logging:
```javascript
process.env.DEBUG = 'llm:*,rag:*'
```

View CloudWatch logs:
```bash
npx serverless logs -f proxy -t
```

## Troubleshooting

### Common Issues

**Issue**: Lambda timeout
- **Solution**: Increase timeout in serverless.yml
- **Alternative**: Use streaming to return partial results

**Issue**: Layer size limit exceeded
- **Solution**: Split into multiple layers or deploy with function code

**Issue**: Rate limit errors
- **Solution**: Enable automatic failover, use multiple providers

**Issue**: Empty search results
- **Solution**: Check embedding model consistency, verify database populated

**Issue**: High costs
- **Solution**: Use "cheap" optimization mode, cache results, batch requests

## Security

### API Keys

- Store in AWS Secrets Manager or SSM Parameter Store
- Never commit to version control
- Rotate regularly

### Access Control

- Use IAM roles for Lambda execution
- Implement API Gateway authentication
- Restrict CORS origins

### Data Privacy

- Encrypt data at rest (S3, database)
- Use HTTPS for all API calls
- Sanitize user inputs
- Comply with data retention policies

## Roadmap

### Completed
- ✅ Multi-provider LLM support
- ✅ Intelligent model selection
- ✅ RAG with libSQL vector database
- ✅ File upload and processing
- ✅ LangChain integration
- ✅ Fast Lambda layer deployment

### In Progress
- 🔄 Knowledge base pre-population
- 🔄 RAG system integration with search

### Planned
- 📋 Makefile commands for RAG operations
- 📋 LLM snippet tool for document retrieval
- 📋 Multi-modal RAG (images, tables)
- 📋 Agentic workflows
- 📋 Conversation history
- 📋 User preference learning

## Resources

- [README.md](../README.md) - Main project README
- [MODEL_SELECTION.md](../MODEL_SELECTION.md) - Model selection details
- [RAG_ENHANCEMENT_PLAN.md](../RAG_ENHANCEMENT_PLAN.md) - RAG implementation plan
- [TESTING.md](../TESTING.md) - Testing documentation
- [Serverless Framework Docs](https://www.serverless.com/framework/docs/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [LangChain Docs](https://js.langchain.com/docs/)

## Contributing

1. Create feature branch from `agent`
2. Make changes with tests
3. Update documentation
4. Deploy and test on AWS
5. Create pull request
6. Update CHANGELOG.md

## License

MIT License - See LICENSE file for details

## Support

- GitHub Issues: Report bugs and request features
- Documentation: See docs/ directory
- Developer logs: See developer_logs/ directory
