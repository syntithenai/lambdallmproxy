````markdown
# Lambda LLM Proxy - AI Research Agent with Deep Knowledge Integration

An advanced AI research assistant that combines comprehensive web scraping, agentic workflows, and knowledge management to deliver quality referenced, fact-checked, broad and deep knowledge tailored to your needs. Built for building large structured documents with confidence.

## 🎯 Core Mission

**Bringing quality referenced, fact-checked, broad and deep knowledge attuned to the audience, with the capacity to build large structured documents.**

This system goes beyond simple Q&A - it's designed for researchers, writers, and knowledge workers who need:
- **Comprehensive Research**: Multi-angle search with iterative refinement
- **Fact-Checked Answers**: Every claim backed by authoritative sources
- **Deep Context**: Integration with personal and organizational knowledge bases
- **Document Building**: Planning workflows with todos and structured snippets
- **Source Transparency**: Full citation trails and extraction metadata

## ✨ Defining Features

### 🌐 Live Recent Relevant Data with Tiered Scraping

Access the most current information from across the web with an intelligent scraping system:

- **Multi-Tier Content Extraction**: Falls back gracefully from lightweight to heavyweight methods
  - **Tier 1**: Direct HTTP fetch with intelligent HTML parsing
  - **Tier 2**: Reader mode extraction for article-focused sites
  - **Tier 3**: Browser automation via local Puppeteer service
- **Nearly Universal Compatibility**: Read content from almost all websites, including JavaScript-heavy SPAs
- **Local Puppeteer Service**: Run headless Chrome locally for scraping sites that block standard requests
  - Handles dynamic content, authentication walls, anti-scraping protections
  - Configurable via `PUPPETEER_ENDPOINT` environment variable
  - Optional - system degrades gracefully if unavailable
- **Smart Content Extraction**: Strips ads, navigation, and boilerplate to focus on main content
- **Fresh Data**: Always retrieve the latest information, not outdated cached results

**Key Technologies**: DuckDuckGo search, JSDOM parsing, Readability.js, optional Puppeteer integration

### 🤖 Agentic Workflows with Tool Calling

The AI doesn't just answer - it reasons and acts:

- **Intelligent Tool Selection**: AI autonomously decides which tools to use and when
- **Iterative Refinement**: Multiple search passes to ensure comprehensive coverage
- **Self-Evaluation**: Assesses response quality and decides if more research is needed
- **Available Tools**:
  - `search_web`: Multi-query web search with content extraction
  - `scrape_url`: Direct page scraping with fallback tiers
  - `execute_js`: Safe JavaScript execution for data manipulation
  - `generate_chart`: Create visualizations from data
  - `generate_image`: AI image generation via multiple providers
  - `transcribe_url`: Audio/video transcription with timestamp support
  - `search_knowledge_base`: Query internal documentation
  - `manage_todos`: Backend todo queue management
  - `manage_snippets`: Google Sheets snippet storage
  - `ask_llm`: **⚠️ HIGH TOKEN USAGE** - Recursive LLM agent for complex multi-step queries
    - Spawns sub-agent with full tool access
    - Iterates up to 5 times for comprehensive answers
    - Consumes 5-10x more tokens than direct responses
    - Use for: deep research, multi-tool workflows, complex analysis
  - `generate_reasoning_chain`: **⚠️⚠️ EXTREME TOKEN USAGE** - Advanced reasoning with transparency
    - Uses o1-preview or DeepSeek-R1 with maximum reasoning depth
    - Generates explicit step-by-step reasoning chains
    - May trigger parallel asynchronous tool calls
    - Consumes 10-50x more tokens than normal responses
    - Charges for both reasoning AND output tokens
    - Use for: mathematical proofs, logical analysis, strategic planning, debugging complex problems
- **Continuation Logic**: Automatically continues research if initial results are insufficient
- **Transparency**: Full tool execution logs and reasoning chains visible to users

**Key Technologies**: OpenAI function calling, Groq models, multi-provider fallback

### 📝 Document Building Workflows

Transform research into structured documents with planning tools:

- **Planning Page**: Visual todo management system
  - Create, organize, and track research tasks
  - Priority management and status tracking (not started, in progress, complete)
  - Backend persistence with Google Sheets sync
- **Snippet Management**: Save and organize key findings
  - Tag and categorize research snippets
  - Full-text search across saved content
  - Export to structured document formats
  - Sync with Google Sheets for backup and sharing
- **Todo Integration**: Link todos to snippets for organized workflow
- **Citation Tracking**: Automatic source attribution for every snippet

**Key Technologies**: React-based planning UI, Google Sheets API, IndexedDB local storage

### 🧠 Browser-Based RAG (Retrieval-Augmented Generation)

Inject your own content into AI queries automatically:

- **Client-Side Knowledge Base**: Store documents, PDFs, notes in browser IndexedDB
- **Automatic Context Injection**: AI automatically searches your knowledge base when relevant
- **Explicit Reference**: Users can explicitly trigger knowledge base searches
- **Swag Snippets**: Save important findings directly into your personal knowledge base
  - Organize by tags, categories, projects
  - Full-text search across all snippets
  - Sync to Google Drive for backup and sharing
- **Privacy-First**: All data stored locally in browser, no server upload required
- **Multi-Format Support**: Markdown, PDF, TXT, HTML, CSV, JSON

**Key Technologies**: IndexedDB, LangChain.js, OpenAI embeddings (client-side), vector search

### 🗄️ Server-Based RAG for Team Knowledge

Scale knowledge sharing across your organization:

- **Centralized Knowledge Base**: libSQL database with vector extension
- **Team Documentation**: Ingest project docs, API references, best practices
- **Fast Retrieval**: Sub-second searches with embedding cache (3ms for cached queries)
- **Cost-Effective**: Query caching eliminates redundant embedding API calls
- **CLI Tools**: Ingest, search, and manage documentation via command line
- **Automatic Integration**: AI automatically searches server knowledge base when needed
- **Source Attribution**: Full citation trails with document excerpts

**Key Technologies**: libSQL with vector extension, OpenAI text-embedding-3-small, cosine similarity search

### ☁️ Google Drive Integration

Seamless sync and backup of your AI workspace:

- **UI State Sync**: Preserve chat history, settings, and preferences across devices
- **API Key Management**: Securely store provider API keys in your Google Drive
  - OpenAI, Groq, Together AI, Replicate, Gemini
  - Per-provider configuration (base URLs, models, quotas)
  - Automatic sync on settings changes
- **Local RAG Sync**: Backup swag snippets to Google Sheets
  - Full-text search across synced snippets
  - Tag-based organization
  - Export to CSV/JSON for analysis
- **Personal Billing Sheet**: Track your LLM usage in your own Google Sheet
  - Detailed cost breakdown by provider, model, type
  - Token usage analytics (input/output/total)
  - Filter by date range, provider, or operation type
  - Export for budgeting and analysis
- **Privacy Control**: You control access - data stays in your Google Drive
- **Automatic Backup**: Changes sync automatically when online

**Key Technologies**: Google Drive API, Google Sheets API, OAuth 2.0, incremental sync

### ⚖️ Provider Load Balancing with Fine-Grained Access Control

Advanced multi-provider management with intelligent load distribution:

- **Multi-Provider Pool**: Configure multiple LLM providers simultaneously
  - OpenAI (GPT-4o, GPT-4o-mini, o1, o1-mini)
  - Groq (Llama 3.1, Llama 3.3, Mixtral, Gemma, DeepSeek-R1)
  - Google Gemini (Gemini 2.0 Flash, Gemini 2.5 Pro/Flash)
  - Together AI, Replicate, Anthropic Claude
  - 13+ provider configurations supported

- **Automatic Load Balancing**: System intelligently distributes requests
  - Round-robin selection within model categories
  - Rate limit detection and automatic failover
  - Health tracking with circuit breaker pattern
  - Speed-based routing for fastest response times

- **Fine-Grained Capability Control**: Per-provider feature flags
  - **Chat**: Enable/disable providers for conversational AI
  - **Embeddings**: Control which providers can generate embeddings
  - **Image Generation**: Manage image model access (DALL-E, Flux, Stable Diffusion)
  - **Transcription**: Configure audio/video transcription providers (Whisper variants)
  - Independent capability control - disable chat but keep embeddings enabled

- **Model Allowlists**: Restrict access to specific models per provider
  - Security: Prevent expensive model usage (e.g., block o1-preview, allow only o1-mini)
  - Cost Control: Limit to cheaper models (gpt-4o-mini only, no gpt-4o)
  - Compliance: Enforce organizational model policies
  - Example: Allow only `["gpt-4o-mini", "gpt-3.5-turbo"]` from OpenAI provider

- **Rate Limit Management**: Intelligent throttling and recovery
  - Per-model rate limit tracking (RPM, TPM, RPD)
  - Automatic backoff with exponential retry
  - Real-time availability checking before selection
  - Proactive rate limit avoidance (checks before request)

- **Circuit Breaker Protection**: Automatic unhealthy provider isolation
  - Tracks consecutive failures per provider
  - Temporary removal after threshold (default: 5 failures)
  - Automatic recovery after timeout (default: 10 minutes)
  - Prevents cascading failures across providers

- **Cost Optimization**: Smart provider selection based on pricing
  - Free tier prioritization (Groq, Gemini free)
  - Cost-per-quality ratio analysis
  - Automatic fallback to paid when free tier exhausted
  - Transparent billing by provider and model

**Configuration Example**:
```javascript
// Provider with fine-grained capabilities
{
  type: 'openai',
  apiKey: 'sk-...',
  capabilities: {
    chat: true,           // Enable for chat
    embeddings: true,     // Enable for RAG embeddings
    imageGeneration: false, // Disable image generation
    transcription: false  // Disable audio transcription
  },
  allowedModels: ['gpt-4o-mini', 'gpt-3.5-turbo'], // Only these models
  enabled: true
}
```

**Benefits**:
- ✅ **No Single Point of Failure**: Automatic failover between providers
- ✅ **Cost Control**: Free tier maximization + model restrictions
- ✅ **Flexibility**: Mix and match provider strengths (Groq for speed, OpenAI for quality)
- ✅ **Security**: Fine-grained access prevents unauthorized model usage
- ✅ **Reliability**: Circuit breaker and health tracking ensure stability

**Key Technologies**: Round-robin scheduling, circuit breaker pattern, rate limit tracking, provider health monitoring

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** (required for ES modules)
- **AWS Account** with Lambda access
- **Google Cloud Project** for OAuth and Drive API
- **API Keys** (at least one):
  - OpenAI API key (recommended)
  - Groq API key (free tier available)
  - Together AI, Replicate, or Gemini (optional)

### Installation

**Complete setup in 3 commands:**

```bash
# 1. Clone the repository
git clone https://github.com/syntithenai/lambdallmproxy.git
cd lambdallmproxy

# 2. Run automated setup (installs dependencies, creates .env)
make install

# 3. Configure your credentials (see below)
nano .env
```

### Configuration

#### Required Environment Variables

Edit the `.env` file created by `make install`:

```bash
# Google OAuth (REQUIRED for authentication)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
ALLOWED_EMAILS=your-email@example.com,teammate@example.com

# LLM Provider API Keys (at least one required)
OPENAI_API_KEY=sk-proj-...
GROQ_API_KEY=gsk_...

# AWS Configuration (for deployment)
AWS_REGION=us-east-1
LAMBDA_FUNCTION_NAME=llmproxy
```

#### Getting Google Credentials

1. **Create Google Cloud Project**:
   - Visit [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable APIs:
     - Google Drive API
     - Google Sheets API
     - Google Identity Services

2. **Create OAuth 2.0 Client ID**:
   - Navigate to "Credentials" → "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Authorized JavaScript origins: `http://localhost:8081`, your deployed URL
   - Authorized redirect URIs: `http://localhost:8081/callback`
   - Copy the **Client ID** to `GOOGLE_CLIENT_ID` in `.env`

3. **Create Service Account** (for backend Google Sheets logging):
   - Navigate to "Credentials" → "Create Credentials" → "Service Account"
   - Download JSON key file
   - Add path to `.env`:
     ```bash
     GOOGLE_SERVICE_ACCOUNT_JSON=/path/to/service-account-key.json
     ```

#### Getting AWS Credentials

1. **Install AWS CLI**: https://aws.amazon.com/cli/

2. **Configure AWS Profile**:
   ```bash
   aws configure
   # Enter your Access Key ID, Secret Access Key, Region (us-east-1)
   ```

3. **Create Lambda Execution Role**:
   ```bash
   aws iam create-role --role-name lambda-llmproxy-role \
     --assume-role-policy-document '{
       "Version": "2012-10-17",
       "Statement": [{
         "Effect": "Allow",
         "Principal": {"Service": "lambda.amazonaws.com"},
         "Action": "sts:AssumeRole"
       }]
     }'
   
   # Attach basic execution policy
   aws iam attach-role-policy --role-name lambda-llmproxy-role \
     --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
   ```

4. **Add role ARN to `.env`**:
   ```bash
   AWS_LAMBDA_ROLE=arn:aws:iam::123456789012:role/lambda-llmproxy-role
   ```

### Development Workflow

```bash
# Start local development servers (backend + frontend)
make dev
```

This starts:
- **Backend**: `http://localhost:3000` (Lambda proxy with hot reload)
- **Frontend**: `http://localhost:8081` (Vite dev server with HMR)

**Development cycle:**
1. Edit code in `src/` (backend) or `ui-new/src/` (frontend)
2. Changes auto-reload via nodemon (backend) or Vite HMR (frontend)
3. Test at `http://localhost:8081`
4. Deploy only when ready for production

### Production Deployment

**Deploy to AWS Lambda:**

```bash
# First-time: Create Lambda Layer with dependencies (~2 min, one-time)
make setup-layer

# Deploy backend code only (~10 seconds)
make deploy-lambda-fast

# Deploy environment variables to Lambda
make deploy-env

# Deploy frontend to GitHub Pages
make deploy-ui
```

**Deployment targets:**
- **Backend**: AWS Lambda Function URL
- **Frontend**: GitHub Pages (free static hosting)

## 📚 Common Commands

```bash
# Installation & Setup
make install             # Install all dependencies
make setup-layer         # Create Lambda Layer (one-time, ~2 min)

# Local Development (Primary Workflow)
make dev                 # Start backend + frontend with hot reload
make run-lambda-local    # Start backend only (port 3000)
make serve-ui            # Start frontend only (port 8081)

# Production Deployment
make deploy-lambda-fast  # Deploy backend code (~10 sec)
make deploy-lambda       # Full backend deploy with deps (~3 min)
make deploy-ui           # Build and deploy UI to GitHub Pages
make deploy-env          # Sync .env variables to Lambda

# Knowledge Base (RAG)
make rag-ingest          # Ingest docs from knowledge-base/
make rag-search QUERY="how to deploy"  # Search knowledge base
make rag-stats           # Show database statistics
make rag-list            # List all documents

# Debugging & Monitoring
make logs                # View recent Lambda logs
make logs-tail           # Tail Lambda logs in real-time
make test                # Run test suite
make help                # Show all commands
```

## 🏗️ Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend (UI)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │   Chat   │  │ Planning │  │   Swag   │  │ Billing │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│         │              │            │            │       │
│         └──────────────┴────────────┴────────────┘       │
│                        │                                 │
│                 ┌──────▼──────┐                          │
│                 │ IndexedDB    │ (Local RAG)             │
│                 │ Knowledge    │                         │
│                 └──────────────┘                         │
└─────────────────────────┬───────────────────────────────┘
                          │
                          │ HTTPS/SSE
                          │
┌─────────────────────────▼───────────────────────────────┐
│              AWS Lambda Backend (Serverless)             │
│  ┌──────────────────────────────────────────────────┐  │
│  │            Agentic Workflow Engine                │  │
│  │  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │  │
│  │  │ Search │ │  Scrape  │ │   LLM    │ │  Tools │ │  │
│  │  └────────┘ └──────────┘ └──────────┘ └────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │      Provider Load Balancer & Health Monitor     │  │
│  │  ┌──────────┐ ┌────────────┐ ┌──────────────┐  │  │
│  │  │ Round    │ │ Rate Limit │ │  Circuit     │  │  │
│  │  │ Robin    │ │ Tracker    │ │  Breaker     │  │  │
│  │  └──────────┘ └────────────┘ └──────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Server-Side RAG (libSQL)                │  │
│  │  ┌────────────┐  ┌─────────────┐  ┌───────────┐ │  │
│  │  │ Vector DB  │  │  Embeddings │  │   Cache   │ │  │
│  │  └────────────┘  └─────────────┘  └───────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          │ API Calls (Load Balanced)
                          │
┌─────────────────────────▼───────────────────────────────┐
│                  External Services                       │
│  ┌────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ OpenAI │ │  Groq   │ │ Together │ │ Google APIs  │  │
│  └────────┘ └─────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────────┐  │
│  │Replicate│ │Anthropic│ │   DuckDuckGo Search    │  │
│  └──────────┘ └──────────┘ └───────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │        Puppeteer Service (Local/Optional)        │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Provider Load Balancing Flow

```
Request → Request Analysis → Model Selection Strategy
                                      ↓
                    ┌─────────────────┴─────────────────┐
                    │   Filter by Capabilities          │
                    │   (chat/embeddings/image/etc)     │
                    └─────────────────┬─────────────────┘
                                      ↓
                    ┌─────────────────┴─────────────────┐
                    │   Apply Model Allowlist           │
                    │   (per-provider restrictions)     │
                    └─────────────────┬─────────────────┘
                                      ↓
                    ┌─────────────────┴─────────────────┐
                    │   Check Rate Limits               │
                    │   (RPM/TPM/RPD tracking)          │
                    └─────────────────┬─────────────────┘
                                      ↓
                    ┌─────────────────┴─────────────────┐
                    │   Check Health Status             │
                    │   (circuit breaker state)         │
                    └─────────────────┬─────────────────┘
                                      ↓
                    ┌─────────────────┴─────────────────┐
                    │   Round-Robin Selection           │
                    │   (distribute load evenly)        │
                    └─────────────────┬─────────────────┘
                                      ↓
                              Selected Provider/Model
                                      ↓
                        ┌─────────────┴─────────────┐
                        │  If Fails → Automatic     │
                        │  Failover to Next Provider│
                        └───────────────────────────┘
```

### Key Design Principles

1. **Local-First Development**: Test everything locally before deploying
2. **Serverless Architecture**: Zero server management, automatic scaling
3. **Privacy-Preserving**: Client-side RAG, optional Google Drive sync
4. **Cost-Optimized**: Free tier prioritization, aggressive caching
5. **Multi-Provider Resilience**: No single point of failure with automatic failover
6. **Fine-Grained Control**: Per-provider capability and model restrictions
7. **Extensible**: Modular tool system, easy to add new capabilities

## 📖 Documentation

- **[INSTALLATION.md](INSTALLATION.md)** - Detailed setup guide
- **[MODEL_SELECTION.md](MODEL_SELECTION.md)** - Intelligent model selection system
- **[GUARDRAILS_GROQ_SETUP.md](GUARDRAILS_GROQ_SETUP.md)** - Content moderation setup
- **[GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md)** - Google API configuration
- **[BROWSER_FEATURES_INTEGRATION_GUIDE.md](developer_logs/BROWSER_FEATURES_INTEGRATION_GUIDE.md)** - Browser tools integration
- **[RAG_FINAL_STATUS.txt](RAG_FINAL_STATUS.txt)** - RAG system overview
- **[developer_logs/](developer_logs/)** - Complete development history

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes with tests
4. Test locally: `make dev`
5. Deploy to your Lambda: `make deploy-lambda-fast`
6. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Live Demo**: https://syntithenai.github.io/lambdallmproxy/  
**Repository**: https://github.com/syntithenai/lambdallmproxy  
**Issues**: https://github.com/syntithenai/lambdallmproxy/issues
````

## 🧠 Intelligent Model Selection

The proxy features a **sophisticated model selection system** that automatically chooses the best LLM model for each request based on:

- **Request complexity** (simple facts vs. complex reasoning)
- **Cost optimization** (free tier prioritization, cost-per-quality scoring)
- **Rate limiting** (proactive checking, automatic failover)
- **Model health** (tracks reliability, avoids consistently failing models)
- **Performance** (historical latency tracking for speed optimization)

**Optimization Modes:**
- 💰 **Cheap** (default): Free providers first, minimal token usage
- ⚖️ **Balanced**: Cost-per-quality optimization
- 💪 **Powerful**: Best available models for complex tasks
- ⚡ **Fastest**: Historical performance-based selection (Groq typically 50-100ms TTFT)

📖 **[Read the complete Model Selection Documentation →](MODEL_SELECTION.md)**

## Quick Start - Installation

**⚡ First-time setup (one command):**

```bash
# Clone the repository
git clone https://github.com/syntithenai/lambdallmproxy.git
cd lambdallmproxy

# Complete automated setup (checks Node.js 20+, installs dependencies, creates .env)
make setup

# Edit your API keys
nano .env

# Start local development
make dev
```

**📖 For detailed installation instructions, see [INSTALLATION.md](INSTALLATION.md)**

### Common Commands

```bash
# Installation & Setup
make setup               # Complete first-time setup
make install             # Install all dependencies
make check-node          # Verify Node.js version (requires 20+)

# Local Development (Primary Workflow)
make dev                 # Start backend + UI with hot reload
make run-lambda-local    # Start backend only on port 3000
make serve-ui            # Start UI only on port 8081

# Production Deployment (Only When Ready)
make deploy-lambda-fast  # Deploy backend code (~10 sec)
make deploy-lambda       # Full backend deploy with dependencies
make deploy-ui           # Build and deploy UI to GitHub Pages
make deploy-env          # Sync .env variables to Lambda

# Utilities
make logs                # View recent Lambda logs
make logs-tail           # Tail Lambda logs in real-time
make help                # Show all available commands
```

**The Makefile is your single interface for all operations - it ensures consistent, reliable deployments and builds.**

## 💻 Local Development

**Development is local-first!** Test all changes locally before deploying to production.

### Start Local Development Server

```bash
# Start both backend (localhost:3000) and frontend (localhost:5173)
make dev
```

This command starts:
- **Backend**: Express server on `http://localhost:3000` (proxies Lambda function)
- **Frontend**: Vite dev server on `http://localhost:5173` (hot-reload UI)

### Development Workflow

1. **Edit code** in `src/` (backend) or `ui-new/src/` (frontend)
2. **Run `make dev`** to start local servers
3. **Test** by visiting `http://localhost:5173`
4. **Verify changes** work locally
5. **Deploy to production** only when ready:
   - Backend: `make deploy-lambda-fast` (10 seconds)
   - Frontend: `make deploy-ui` (builds docs + pushes to GitHub Pages)

### Local Sample Files

Sample audio files for testing transcription are available at:
- `ui-new/public/samples/long-form-ai-speech.mp3` (~4 min AI discussion)

The local Lambda server (port 3000) serves these files at: `http://localhost:3000/samples/`

**Example transcription query (LOCAL DEVELOPMENT ONLY):**
```
Transcribe this: http://localhost:3000/samples/long-form-ai-speech.mp3
```

> **⚠️ Important**: Local file transcription only works when running `make dev`. When using the deployed Lambda function (production), you must use publicly accessible URLs (S3, HTTP, HTTPS) because the backend reads the file from the filesystem in local mode, but production Lambda cannot access localhost.

**For production/deployed testing**, use the S3 URL instead:
```
Transcribe this: https://llmproxy-media-samples.s3.amazonaws.com/audio/long-form-ai-speech.mp3
```

### When to Deploy vs. Develop Locally

| Scenario | Use | Why |
|----------|-----|-----|
| **Making code changes** | `make dev` | Test immediately, fast iteration |
| **Testing new features** | `make dev` | No Lambda deployment needed |
| **Debugging issues** | `make dev` | See console logs directly |
| **Ready for production** | `make deploy-lambda-fast` | Share with others, production use |
| **UI changes final** | `make deploy-ui` | Publish to GitHub Pages |

## ⚡ Optimized Deployment Workflow (Lambda Layers)

**NEW: Ultra-fast deployment for rapid development iteration!**

### First-Time Setup (One-Time)

```bash
# Create Lambda Layer with all dependencies (27MB)
make setup-layer
```

This command:
- Creates S3 bucket for deployments
- Installs and packages all dependencies (ytdl-core, ffmpeg, form-data, etc.)
- Publishes Lambda Layer
- Saves configuration to `.deployment-config`

### Fast Code-Only Deployment (10 seconds!)

```bash
# Deploy code changes only (89KB package vs 27MB)
make fast
```

**Speed Comparison:**
- **Full Deploy**: 2-3 minutes (includes 27MB dependencies)
- **Fast Deploy**: ~10 seconds (code only, uses existing layer)
- **Speedup**: 10x faster! 🚀

### When to Use Each Command

| Scenario | Command | Time | Use Case |
|----------|---------|------|----------|
| **First time setup** | `make setup-layer` | 2 min | Create Lambda Layer (once) |
| **Code changes** | `make fast` | 10 sec | Day-to-day development |
| **Dependency updates** | `make setup-layer` then `make fast` | 2 min | When package.json changes |
| **Full deployment** | `make deploy` | 3 min | Legacy/backup option |

### Benefits

- ✅ **10x faster deployments** - 10 seconds vs 2-3 minutes
- ✅ **99.7% size reduction** - 89KB code vs 27MB full package
- ✅ **No timeout issues** - S3 upload is reliable
- ✅ **Reliable deployments** - Consistent layer versioning
- ✅ **Cost efficient** - Deploy dependencies once, reuse many times

### Troubleshooting

**Issue**: `make fast` fails with "Layer ARN not found"
```bash
# Solution: Run setup-layer first
make setup-layer
```

**Issue**: Need to update dependencies (package.json changed)
```bash
# Re-create layer with new dependencies
make setup-layer
# Then deploy code
make fast
```

**Issue**: Want to verify layer is attached
```bash
aws lambda get-function --function-name llmproxy --region us-east-1 --query 'Configuration.Layers'
```

## 🤖 AI Agent Workflow

**For AI agents making code changes (per instructions.md):**

1. **Make Lambda code changes** in `src/` → **Recommended: `make fast`** (10 sec) or `make dev` (3 min)
   - **First time?** Run `make setup-layer` once, then use `make fast` for all future changes
2. **🚨 CRITICAL: Make UI changes** in `ui/` subdirectory files → **Always run `make deploy-docs`**
3. **Test immediately**: Visit https://lambdallmproxy.pages.dev
4. **Check output**: All commands pipe to `output.txt` for Copilot to read

**📖 Documentation for AI Agents:**
- [COPILOT_UI_WORKFLOW.md](COPILOT_UI_WORKFLOW.md) - **ESSENTIAL UI development workflow** 
- [AI_AGENT_WORKFLOW.md](AI_AGENT_WORKFLOW.md) - General AI agent instructions
- [instructions.md](instructions.md) - Project-specific requirements

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

### 🛡️ Content Guardrails (Optional)
- **Automatic Content Moderation**: Optional input/output filtering using fast LLM models
- **Groq Integration**: Ultra-fast content checking (<100ms) with free tier support
- **Policy Enforcement**: Blocks hate speech, violence, illegal activities, and other harmful content
- **Cost Tracking**: Separate billing for guardrail operations
- **Fail-Safe Design**: System blocks content if guardrails encounter errors

📖 **[Complete Guardrails Setup Guide →](GUARDRAILS_GROQ_SETUP.md)**  
📋 **[Quick Configuration Examples →](guardrails.env.example)**

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

## 🔒 Authentication System

⚠️ **IMPORTANT**: As of October 2025, **ALL API endpoints require authentication** (except the public web UI).

### Authentication Requirements

**All API endpoints** (`/planning`, `/search`, `/proxy`) require:

1. **Valid JWT Token**: Google OAuth token in `Authorization` header
2. **Email Whitelist**: Email must be in `ALLOWED_EMAILS` environment variable
3. **Token Verification**: Backend validates token using `GOOGLE_CLIENT_ID`

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
- Email allowlist enforcement (configurable via `ALLOWED_EMAILS`)
- Token expiration checking
- User profile extraction (email, name, picture)

**Public Access**:
- Static file server (web UI) remains publicly accessible
- No authentication required for `GET /`, `/index.html`, `/css/*`, `/js/*`, etc.

### Setup Authentication

1. **Configure Google OAuth**:
```bash
# Add to .env file
GOOGLE_CLIENT_ID=your-google-client-id-here
ALLOWED_EMAILS=user1@example.com,user2@example.com,user3@example.com
```

2. **Setup YouTube Data API** (Required for YouTube search tool):

   See [GOOGLE_CLOUD_SETUP.md](GOOGLE_CLOUD_SETUP.md) for detailed instructions on:
   - Creating a Google Cloud project
   - Enabling YouTube Data API v3
   - Creating and configuring an API key
   - Setting up referrer restrictions
   - Managing API quotas

3. **Build UI with Authentication**:
```bash
make build-docs  # Replaces {{GOOGLE_CLIENT_ID}} placeholder
```

4. **Deploy Lambda with Environment Variables**:
```bash
make deploy  # Automatically includes GOOGLE_CLIENT_ID and ALLOWED_EMAILS
```

4. **Test Authentication**:
- Open `https://your-lambda-url.amazonaws.com/` in browser
- Click "Sign in with Google" 
- Authenticate with allowed email address
- Submit requests through authenticated interface

### API Authentication

All API requests must include the `Authorization` header:

```bash
curl -X POST https://your-lambda-url.amazonaws.com/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{"query": "your search query"}'
```

**401 Unauthorized Response**:
```json
{
  "error": "Authentication required. Please provide a valid JWT token in the Authorization header.",
  "code": "UNAUTHORIZED"
}
```

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

### 🔒 Authentication Variables (REQUIRED)
- **`GOOGLE_CLIENT_ID`** - **REQUIRED** - Google OAuth client ID for JWT token verification
- **`ALLOWED_EMAILS`** - **REQUIRED** - Comma-separated list of authorized email addresses
  - Example: `user1@example.com,user2@example.com,admin@company.com`
  - All API endpoints check if the JWT token's email is in this list

### Lambda Handler Variables
- **`ACCESS_SECRET`** - Secret for function access protection (legacy, may be deprecated)
- **`LAMBDA_MEMORY`** - Memory tracking and optimization configuration
- **`SYSTEM_PROMPT_DIGEST_ANALYST`** - LLM system prompt for search result analysis
- **`SYSTEM_PROMPT_CONTINUATION_STRATEGIST`** - LLM system prompt for search continuation decisions
- **`DIGEST_TEMPLATE`** - Template for analyzing search results
- **`CONTINUATION_TEMPLATE`** - Template for deciding whether to continue searching
- **`FINAL_TEMPLATE`** - Template for generating final comprehensive answers

### Provider Configuration Variables
- **`OPENAI_API_KEY`** - OpenAI API authentication token (used for authenticated proxy requests)
- **`GROQ_API_KEY`** - Groq API authentication token (used for authenticated proxy and planning requests)
- **`OPENAI_MODEL`** - OpenAI model selection (e.g., "gpt-4o")
- **`OPENAI_API_BASE`** - OpenAI API base URL (default: "https://api.openai.com/v1")
- **`GROQ_MODEL`** - Groq model selection (e.g., "llama-3.1-8b-instant")

### Deployment & UI Variables  
- **`LAMBDA_URL`** - AWS Lambda function URL for frontend integration
- **`LAMBDA_TIMEOUT`** - Lambda function timeout setting (seconds)
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

1. **⚡ Fast Deploy** (Recommended): `make fast` - Ultra-fast code-only deployment (~10 seconds)
   - Requires: `make setup-layer` (one-time setup)
   - Uses: Lambda Layers + S3 upload
   - Best for: Day-to-day development
2. **Bash Script**: `./scripts/deploy.sh` - Full deployment with dependencies (2-3 minutes)
3. **Makefile**: `make dev` - Simple one-command deployment (uses deploy.sh)

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

## 📚 RAG (Retrieval-Augmented Generation)

The Lambda LLM Proxy includes a **complete RAG system** for searching and retrieving internal documentation during AI conversations.

### Overview

The RAG system allows the AI to automatically search your ingested documentation and knowledge base to answer questions about:
- Project architecture and design
- API documentation and endpoints  
- Configuration and deployment
- Implementation guides and examples
- Best practices and troubleshooting

### Quick Start

**1. Ingest Documentation:**
```bash
# Add files to knowledge-base/ directory
cp my-docs.md knowledge-base/

# Ingest with embeddings
make rag-ingest
```

**2. View Database Stats:**
```bash
make rag-stats
```

**3. Search from CLI:**
```bash
make rag-search QUERY="How do I deploy?"
```

**4. Use in Conversations:**

The AI automatically has access to the `search_knowledge_base` tool and will use it when you ask about topics in your documentation:

> **User:** "How do I configure OpenAI embeddings?"  
> **AI:** *[Searches knowledge base automatically]* "Based on the documentation, here's how to configure OpenAI embeddings..."

### RAG CLI Commands

| Command | Description | Example |
|---------|-------------|---------|
| `make rag-ingest` | Ingest documents from knowledge-base/ | `make rag-ingest` |
| `make rag-stats` | Show database statistics | `make rag-stats` |
| `make rag-list` | List all ingested documents | `make rag-list` |
| `make rag-search QUERY="..."` | Search knowledge base | `make rag-search QUERY="deployment"` |
| `make rag-delete ID="..."` | Delete document by ID | `make rag-delete ID="file:doc.md"` |

### RAG Architecture

**Components:**
- **Vector Database**: libSQL with vector extension for similarity search
- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions)
- **Chunking**: LangChain RecursiveCharacterTextSplitter (512 tokens, 20% overlap)
- **Search**: Cosine similarity with configurable threshold (default 0.5)
- **Storage**: Server-side libSQL, client-side IndexedDB fallback

**Supported File Formats:**
- Markdown (.md)
- PDF (.pdf)
- Word documents (.docx)
- HTML (.html)
- Plain text (.txt)
- CSV (.csv)
- JSON (.json)

### Environment Variables for RAG

```bash
# Required for ingestion and search
OPENAI_API_KEY=sk-proj-...

# Optional configurations
RAG_EMBEDDING_PROVIDER=openai          # Default: openai
RAG_EMBEDDING_MODEL=text-embedding-3-small  # Default: text-embedding-3-small
LIBSQL_URL=file:///path/to/rag-kb.db  # Default: file:///tmp/rag.db
LIBSQL_AUTH_TOKEN=...                  # Only for remote Turso databases
```

### LLM Tool Integration

The RAG system is exposed to AI through the `search_knowledge_base` tool:

**Tool Parameters:**
- `query` (required): Natural language search query
- `top_k` (optional): Number of results (1-20, default 5)
- `threshold` (optional): Minimum similarity score (0-1, default 0.5)
- `source_type` (optional): Filter by 'file', 'url', or 'text'

**Example Tool Call:**
```json
{
  "name": "search_knowledge_base",
  "arguments": {
    "query": "How do I configure embeddings?",
    "top_k": 5,
    "threshold": 0.5
  }
}
```

**Tool Response:**
```json
{
  "success": true,
  "query": "How do I configure embeddings?",
  "result_count": 3,
  "results": [
    {
      "rank": 1,
      "similarity_score": "0.7234",
      "source": "rag-guide.md",
      "source_type": "file",
      "source_path": "knowledge-base/llm/rag-guide.md",
      "text": "## Embedding Configuration\n\n..."
    }
  ],
  "summary_markdown": "# Knowledge Base Search Results\n\n..."
}
```

### Performance

**Search Speed (without cache):**
- Embedding generation: ~200ms
- Vector search: ~100ms  
- Total: ~300ms per search

**Search Speed (with cache):**
- Cache hit: **~3ms** (370x faster!)
- Embedding cache hit: ~10ms (30x faster)
- Cost savings: $0.000004 per cached query

**Cost:**
- ~$0.000004 per search (embedding generation only)
- Vector search is free (local database)
- **Cached queries: FREE** (no API calls)

**Accuracy:**
- Relevance: 90%+ for top results
- Coverage: 85% of technical questions answered
- Precision: Similarity scores 0.55-0.75 for good matches

### Result Caching

The RAG system automatically caches query results and embeddings for improved performance:

**Cache Types:**
- **Query Cache** (`rag_queries`): Full search results (TTL: 1 hour)
  - Keys: Query text + parameters (topK, threshold, sourceType)
  - Speeds up identical queries by 370x (300ms → 3ms)
  
- **Embedding Cache** (`rag_embeddings`): Query embeddings (TTL: 24 hours)
  - Keys: Query text + model
  - Reuses embeddings across different search parameters
  - Speeds up similar queries by 30x (200ms → 10ms)

**Cache Configuration:**
```bash
# Optional: Customize cache TTL (seconds)
CACHE_TTL_RAG_QUERIES=3600      # Default: 1 hour
CACHE_TTL_RAG_EMBEDDINGS=86400  # Default: 24 hours
```

**Cache Benefits:**
- ✅ 99.7% faster for repeat queries (1112ms → 3ms)
- ✅ No API costs for cached results
- ✅ Automatic eviction when /tmp reaches 80% capacity (Lambda)
- ✅ LRU (Least Recently Used) eviction policy
- ✅ Separate TTL for queries vs embeddings

**Cache Behavior:**
- Same query + parameters → Full cache hit (3ms)
- Same query, different parameters → Embedding cache hit (10ms)
- Different query → Full search (~300ms)

### Advanced Usage

**Script-based Ingestion:**
```bash
# Ingest with custom options
node scripts/ingest-documents.js ./docs \
  --db-path ./my-kb.db \
  --batch-size 20 \
  --force

# Get detailed statistics
node scripts/db-stats.js --db-path ./my-kb.db

# Export results as JSON
node scripts/search-documents.js "deployment" --format json > results.json
```

**Database Management:**
```bash
# List all documents
node scripts/list-documents.js --format table

# Delete specific document
node scripts/delete-document.js "file:old-doc.md" --yes

# Filter by source type
node scripts/list-documents.js --type file --limit 10
```

### Lambda Deployment

**Option 1: Include in Lambda package**
```bash
# Database is automatically included
make rag-ingest   # Build knowledge base
make fast         # Deploy with database
```

**Option 2: Use Lambda Layer**
```bash
# Create layer with database
mkdir -p layer/rag
cp rag-kb.db layer/rag/
cd layer && zip -r ../rag-layer.zip .

# Publish layer
aws lambda publish-layer-version \
  --layer-name rag-knowledge-base \
  --zip-file fileb://../rag-layer.zip

# Update Lambda to use layer
aws lambda update-function-configuration \
  --function-name llmproxy \
  --layers arn:aws:lambda:region:account:layer:rag-knowledge-base:1
```

**Environment in Lambda:**
```bash
LIBSQL_URL=file:///var/task/rag-kb.db  # Or /opt/rag/rag-kb.db if using layer
OPENAI_API_KEY=sk-proj-...
RAG_EMBEDDING_MODEL=text-embedding-3-small
```

### Troubleshooting

**Issue: "OpenAI API key required"**
```bash
# Solution: Set API key
export OPENAI_API_KEY="sk-proj-..."
```

**Issue: "Database not found"**
```bash
# Solution: Run ingestion first
make rag-ingest
```

**Issue: "No results found"**
```bash
# Check if documents are ingested
make rag-list

# Try lower threshold
make rag-search QUERY="your query" --threshold 0.3

# Check database stats
make rag-stats
```

### Documentation

For complete RAG documentation, see:
- `RAG_IMPLEMENTATION_PLAN.md` - Full implementation plan
- `RAG_PHASE3_3_COMPLETE.md` - libSQL integration details
- `RAG_PHASE4_COMPLETE.md` - CLI tools documentation
- `RAG_PHASE5_COMPLETE.md` - LLM tool integration
- `knowledge-base/llm/rag-guide.md` - User guide and best practices

## Performance & Security

### Performance Characteristics
- **Multi-search handler**: ~8-20 seconds per comprehensive research request
- **Direct response**: ~2-5 seconds without search
- **RAG search**: ~300ms per knowledge base query
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

## 💰 Pricing & Cost Structure

### Understanding Your Costs

Research Agent uses a transparent, usage-based pricing model with two cost components:

#### 1. AWS Infrastructure Costs (Always Charged)

Every request incurs a small infrastructure fee to cover AWS Lambda hosting:

- **Lambda Compute**: Execution time × memory allocation
- **Lambda Requests**: $0.20 per million requests
- **CloudWatch Logs**: ~$0.50/GB ingestion + $0.03/GB storage
- **Data Transfer**: $0.09/GB for streaming responses
- **S3 Storage**: Minimal cost for deployment packages

**Markup**: 6x on total AWS infrastructure costs (industry standard: 3-10x)

**Example Cost** (512MB memory, 800ms execution):
```
AWS Cost Breakdown:
- Lambda Compute:  $0.00000667
- Lambda Request:  $0.00000020
- CloudWatch Logs: $0.00000102
- Data Transfer:   $0.00000036
- S3 Storage:      $0.00000003
------------------------
Total AWS Cost:    $0.00001087
With 6x markup:    $0.00006522

Cost to user: $0.065 per 1,000 requests
```

**Why 6x markup?** This is competitive with industry standards:
- AWS API Gateway: 3-6x markup
- Twilio SMS: 1.3x markup  
- SendGrid Email: 3x markup
- Stripe Payments: 1.6x markup

#### 2. LLM API Costs (Depends on Configuration)

##### Option A: Server-Provided API Keys
- **LLM Cost**: Provider pricing + 25% surcharge
- **Example**: $0.10 LLM call → $0.125 charged
- **Use Case**: Convenient for occasional use, no setup required

##### Option B: Bring Your Own Keys (BYOK) - **RECOMMENDED**
- **LLM Cost**: $0.00 (you pay provider directly!)
- **Only Pay**: Infrastructure fee (~$0.0001-0.0005/request)
- **Use Case**: Regular users, cost-conscious users, free tier access

**Cost Comparison Example** (100 requests/month, GPT-4o-mini):

| Configuration | LLM Cost | Infrastructure | Total Monthly |
|---------------|----------|----------------|---------------|
| **Server Keys** | $10.00 + 25% = $12.50 | $0.065 | **$12.57** |
| **BYOK** | $0.00 (direct to OpenAI) | $0.065 | **$0.065** |
| **BYOK (Groq Free)** | $0.00 (free tier!) | $0.065 | **$0.065** |

**Savings with BYOK**: 99.5% reduction in costs!

### Free Tier Options with BYOK

When you bring your own API keys, you can access generous free tiers:

- **Groq**: Unlimited free tier (rate-limited, perfect for most users)
- **Google Gemini**: 15 requests/minute, 1500 requests/day free
- **Together AI**: Free trial credits for new accounts
- **OpenAI**: Pay-as-you-go (no free tier, but you control costs)

**Setup**: Settings → Providers → Add Provider → Enter your API key

### Where to Get API Keys

- **Groq** (Free): https://console.groq.com/
- **Google Gemini** (Free tier): https://aistudio.google.com/app/apikey
- **Together AI** (Trial credits): https://api.together.xyz/
- **OpenAI** (Paid): https://platform.openai.com/

### Transparent Billing

Every request is logged with detailed cost breakdown:
- Provider and model used
- Input/output token counts
- LLM API cost (if applicable)
- Infrastructure fee
- Total cost charged

**View your costs**: Settings → Billing → Transaction History

### Cost Optimization Tips

1. **Use BYOK** (#1 recommendation): Save 99.5% on LLM costs
2. **Choose cheaper models**: GPT-4o-mini vs GPT-4o, Gemini Flash vs Pro
3. **Disable expensive tools**: `ask_llm` and `generate_reasoning_chain` consume 10-50x more tokens
4. **Monitor usage**: Check LLM API Transparency panel for real-time costs
5. **Use planning mode strategically**: Only for complex queries where planning saves overall tokens

## Limitations

- **Search source**: Limited to DuckDuckGo search results
- **Content size**: Large pages may hit Lambda memory limits
- **Network dependencies**: Requires internet access for search and content fetching
- **Rate limiting**: DuckDuckGo may implement rate limiting for high-volume usage
- **LLM costs**: OpenAI/other provider API usage charges apply (see Pricing section above)