# Lambda Function Endpoints Reference

**Generated:** October 21, 2025  
**Function:** llmproxy  
**Total Endpoints:** 21 named endpoints + 1 wildcard

---

## Overview

This document provides a comprehensive list of all endpoints available in the Lambda function, their purpose, authentication requirements, and usage statistics.

### Architecture

- **Routing:** Custom routing in `src/index.js`
- **Handlers:** Individual endpoint modules in `src/endpoints/`
- **Response Type:** All handlers wrapped with `awslambda.streamifyResponse`
- **Authentication:** JWT-based (Google ID token) for protected endpoints

---

## Endpoint Categories

### 1. Core Chat & AI (3 endpoints)

#### POST `/chat` 🔒 **STREAMING**
- **Purpose:** Main chat interface with streaming responses
- **Features:**
  - Tool execution (search, scrape, transcribe, etc.)
  - Multi-turn conversation support
  - Provider rotation and fallback
  - Cost tracking and logging
  - RAG context integration
- **Authentication:** Required (authorized users)
- **Handler:** `src/endpoints/chat.js`
- **Frontend Calls:** 2 (ChatTab.tsx, PlanningTab.tsx)

#### POST `/planning` **STREAMING**
- **Purpose:** Multi-step planning and research with streaming progress
- **Features:**
  - Iterative search refinement
  - Per-search digest generation
  - Final comprehensive synthesis
  - Real-time progress updates
- **Authentication:** Optional (better results for authorized users)
- **Handler:** `src/endpoints/planning.js`
- **Frontend Calls:** 0 (not currently used in UI)

#### POST `/search` **STREAMING**
- **Purpose:** DuckDuckGo web search with streaming results
- **Features:**
  - Real-time search results streaming
  - Image and video search support
  - Query expansion
  - Result deduplication
- **Authentication:** Optional
- **Handler:** `src/endpoints/search.js`
- **Frontend Calls:** 0 (planning uses it internally)

---

### 2. Media & Transcription (4 endpoints)

#### POST `/transcribe`
- **Purpose:** Audio/video transcription using OpenAI Whisper
- **Features:**
  - YouTube video support (download + transcribe)
  - Direct audio/video URL support
  - Multiple audio formats (mp3, wav, m4a, etc.)
  - Automatic audio extraction from video
- **Authentication:** Optional
- **Handler:** `src/endpoints/transcribe.js`
- **Frontend Calls:** 0 (called via tool)

#### POST `/stop-transcription`
- **Purpose:** Cancel ongoing transcription job
- **Authentication:** Optional
- **Handler:** `src/endpoints/transcribe.js`
- **Frontend Calls:** 1 (ChatTab.tsx)

#### POST `/convert-to-markdown`
- **Purpose:** Convert HTML/rich text to clean markdown
- **Features:**
  - Preserves structure (headings, lists, tables)
  - Removes scripts and styles
  - Link preservation
  - Image alt text extraction
- **Authentication:** None
- **Handler:** `src/endpoints/convert-to-markdown.js`
- **Frontend Calls:** 2 (used by scraping tools)

#### GET `/proxy`
- **Purpose:** CORS-free proxy for external resources
- **Features:**
  - Image proxying
  - External API calls
  - Custom headers support
- **Authentication:** None
- **Handler:** `src/endpoints/proxy.js`
- **Frontend Calls:** 2 (image loading, external resources)

---

### 3. Image Generation (2 endpoints)

#### POST `/generate-image` 🔒
- **Purpose:** Generate images using various AI providers
- **Supported Providers:**
  - OpenAI (DALL-E 3)
  - FAL.ai (Flux models)
  - Together.ai (Flux models)
  - Stability.ai (Stable Diffusion)
- **Features:**
  - Multiple quality tiers (fast/balanced/quality)
  - Automatic provider fallback
  - Cost tracking
  - Base64 or URL response
- **Authentication:** Required
- **Handler:** `src/endpoints/generate-image.js`
- **Frontend Calls:** 1 (ChatTab.tsx via tool)

#### POST `/fix-mermaid-chart` 🔒
- **Purpose:** Fix and validate Mermaid diagram syntax
- **Features:**
  - Syntax error detection
  - Automatic correction suggestions
  - LLM-powered fixes
  - Validation against Mermaid spec
- **Authentication:** Required
- **Handler:** `src/endpoints/fix-mermaid-chart.js`
- **Frontend Calls:** 1 (ChatTab.tsx)

---

### 4. RAG/Knowledge Base (8 endpoints)

#### POST `/rag/embed-query`
- **Purpose:** Generate embedding vector for a query string
- **Features:**
  - OpenAI embeddings (text-embedding-3-small)
  - 1536-dimensional vectors
  - Used for semantic search
- **Authentication:** None
- **Handler:** `src/endpoints/rag.js`
- **Frontend Calls:** 3 (ChatTab.tsx, SnippetSelector.tsx, SwagPage.tsx)

#### POST `/rag/embed-document`
- **Purpose:** Generate embedding for a document chunk
- **Authentication:** None
- **Handler:** `src/endpoints/rag.js`
- **Frontend Calls:** 1 (document ingestion)

#### POST `/rag/search`
- **Purpose:** Vector similarity search in knowledge base
- **Features:**
  - Cosine similarity matching
  - Top-K results
  - Metadata filtering
  - Score thresholding
- **Authentication:** None
- **Handler:** `src/endpoints/rag.js`
- **Frontend Calls:** 2 (ChatTab.tsx, SwagPage.tsx)

#### POST `/rag/insert`
- **Purpose:** Add document chunks to knowledge base
- **Authentication:** None
- **Handler:** `src/endpoints/rag.js`
- **Frontend Calls:** 1 (SwagPage.tsx)

#### GET `/rag/list`
- **Purpose:** List all documents in knowledge base
- **Authentication:** None
- **Handler:** `src/endpoints/rag.js`
- **Frontend Calls:** 1 (SwagPage.tsx)

#### DELETE `/rag/delete`
- **Purpose:** Remove document from knowledge base
- **Authentication:** None
- **Handler:** `src/endpoints/rag.js`
- **Frontend Calls:** 1 (SwagPage.tsx)

#### POST `/rag/sync`
- **Purpose:** Sync knowledge base with Google Sheets
- **Features:**
  - Bi-directional sync
  - Conflict resolution
  - Batch operations
- **Authentication:** Required
- **Handler:** `src/endpoints/rag.js`
- **Frontend Calls:** 1 (SwagPage.tsx)

#### GET `/rag/user-spreadsheet`
- **Purpose:** Get user's Google Sheets ID for RAG sync
- **Authentication:** Required
- **Handler:** `src/endpoints/rag.js`
- **Frontend Calls:** 0

---

### 5. Billing & Usage (3 endpoints)

#### GET `/billing`
- **Purpose:** Get current billing period usage statistics
- **Features:**
  - Per-provider breakdown
  - Cost calculations
  - Token usage tracking
  - Billing period dates
- **Authentication:** Required
- **Handler:** `src/endpoints/billing.js`
- **Frontend Calls:** 1 (BillingPage.tsx)

#### GET `/usage`
- **Purpose:** Real-time usage polling for active requests
- **Features:**
  - Current token counts
  - Estimated costs
  - Provider information
- **Authentication:** Required
- **Handler:** `src/endpoints/usage.js`
- **Frontend Calls:** 1 (ChatTab.tsx - polling)

#### DELETE `/billing/clear`
- **Purpose:** Clear billing data (admin only)
- **Authentication:** Required
- **Handler:** `src/endpoints/billing.js`
- **Frontend Calls:** 0

---

### 6. OAuth (3 endpoints)

#### GET `/oauth/callback`
- **Purpose:** Handle Google OAuth redirect
- **Features:**
  - Exchange authorization code for tokens
  - Store refresh token
  - Redirect to frontend
- **Authentication:** None (OAuth flow)
- **Handler:** `src/endpoints/oauth.js`
- **Frontend Calls:** 0 (browser redirect)

#### POST `/oauth/refresh`
- **Purpose:** Refresh expired Google access token
- **Authentication:** None (requires refresh token)
- **Handler:** `src/endpoints/oauth.js`
- **Frontend Calls:** 1 (automatic token refresh)

#### POST `/oauth/revoke`
- **Purpose:** Revoke Google OAuth tokens
- **Authentication:** None
- **Handler:** `src/endpoints/oauth.js`
- **Frontend Calls:** 1 (user logout)

---

### 7. Utility & Diagnostic (5 endpoints)

#### GET `/health`
- **Purpose:** Health check endpoint
- **Response:** `{ status: 'ok', timestamp: '...' }`
- **Authentication:** None
- **Handler:** `src/index.js`
- **Frontend Calls:** 0 (infrastructure monitoring)

#### POST `/proxy-image`
- **Purpose:** Proxy and cache images with CORS support
- **Authentication:** None
- **Handler:** `src/endpoints/proxy-image.js`
- **Frontend Calls:** 1 (image loading)

#### GET `/health-check/image-providers`
- **Purpose:** Check availability of image generation providers
- **Features:**
  - Tests each provider's API
  - Returns status for OpenAI, FAL, Together, Stability
- **Authentication:** None
- **Handler:** `src/endpoints/health-check-image-providers.js`
- **Frontend Calls:** 1 (SettingsPage.tsx)

#### GET `/cache-stats`
- **Purpose:** Get cache statistics and metrics
- **Features:**
  - Hit/miss ratios
  - Cache size
  - Eviction stats
- **Authentication:** None
- **Handler:** `src/endpoints/cache-stats.js`
- **Frontend Calls:** 0

#### GET `/*` (wildcard)
- **Purpose:** Serve static files from `/docs` directory
- **Features:**
  - index.html default
  - Content-Type detection
  - 404 handling
- **Authentication:** None
- **Handler:** `src/index.js`
- **Frontend Calls:** N/A (static hosting)

---

## Response Types

### Streaming Endpoints (3)
Use `awslambda.streamifyResponse` for real-time data streaming:
- `/chat`
- `/planning`
- `/search`

### Buffered Endpoints (18)
Standard request/response pattern:
- All other endpoints

---

## Authentication

### Authentication Methods

1. **JWT (Google ID Token)** - Primary method
   - Token passed in `Authorization: Bearer <token>` header
   - Validated against Google's public keys
   - Email checked against `ALLOWED_EMAILS` environment variable

2. **Legacy Access Secret** (deprecated)
   - `accesssecret` query parameter
   - Only for backward compatibility

### Protected Endpoints (8)
Require authentication:
- `/chat`
- `/generate-image`
- `/fix-mermaid-chart`
- `/billing`
- `/billing/clear`
- `/usage`
- `/rag/sync`
- `/rag/user-spreadsheet`

### Public Endpoints (13)
No authentication required:
- `/planning` (optional auth for better results)
- `/search` (optional auth)
- `/transcribe` (optional auth)
- `/stop-transcription`
- `/convert-to-markdown`
- `/proxy`
- `/proxy-image`
- `/health`
- `/health-check/image-providers`
- `/cache-stats`
- `/rag/embed-query`
- `/rag/embed-document`
- `/rag/search`
- `/rag/insert`
- `/rag/list`
- `/rag/delete`
- `/oauth/*`
- `/*` (static files)

---

## Tool Integration

The following endpoints are called automatically by the chat tool system:

### Available Tools
1. **web_search** → `/search`
2. **scrape_web_content** → Direct scraping + Puppeteer Lambda (fallback)
3. **transcribe_audio** → `/transcribe`
4. **generate_image** → `/generate-image`
5. **manage_snippets** → `/rag/*` endpoints
6. **get_youtube_transcript** → YouTube API + `/transcribe` (fallback)

---

## Usage Statistics

### Frontend Call Frequency
Based on analysis of `ui-new/src/**/*.{ts,tsx}`:

| Endpoint | Calls | Primary Files |
|----------|-------|---------------|
| `/rag/*` (all) | 10 | ChatTab, SnippetSelector, SwagPage |
| `/oauth/*` | 3 | OAuth flow, token refresh |
| `/chat` | 2 | ChatTab, PlanningTab |
| `/convert-to-markdown` | 2 | Scraping tools |
| `/proxy` | 2 | Image loading, resources |
| `/billing` | 1 | BillingPage |
| `/usage` | 1 | ChatTab (polling) |
| `/stop-transcription` | 1 | ChatTab |
| `/generate-image` | 1 | ChatTab (via tool) |
| `/fix-mermaid-chart` | 1 | ChatTab |
| `/proxy-image` | 1 | Image display |
| `/health-check` | 1 | SettingsPage |

### Tool-Only Endpoints
Not called directly from frontend:
- `/planning` (0 calls)
- `/search` (0 calls - used by planning tool)
- `/transcribe` (0 calls - called via tool)
- `/cache-stats` (0 calls - monitoring)

---

## Environment Variables

### Required for Endpoints

**Puppeteer Configuration:**
- `PUPPETEER_LAMBDA_ARN` - ARN of Puppeteer Lambda function
- `USE_PUPPETEER` - Enable/disable Puppeteer fallback (default: true)

**Authentication:**
- `ALLOWED_EMAILS` - Comma-separated list of authorized emails
- `ACCESS_SECRET` - Legacy access secret (deprecated)

**Google OAuth:**
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth client secret
- `OAUTH_REDIRECT_URI` - OAuth callback URL

**API Keys:**
- `OPENAI_API_KEY` - For embeddings and Whisper
- Provider keys (configured per user or in environment)

**Database:**
- `LIBSQL_URL` - LibSQL database URL for RAG

**Google Sheets Logging:**
- `GOOGLE_SHEETS_LOG_SPREADSHEET_ID`
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY`

---

## Deployment

### Main Lambda
```bash
make deploy          # Full deployment
make deploy-fast     # Code only (skip layer)
make deploy-env      # Environment variables only
```

### Puppeteer Lambda
```bash
bash scripts/setup-puppeteer-function.sh    # Initial setup
bash scripts/deploy-puppeteer-lambda.sh     # Deploy code
bash scripts/setup-main-lambda-permissions.sh  # Setup permissions
```

---

## Monitoring

### CloudWatch Logs
```bash
# Main Lambda
aws logs tail /aws/lambda/llmproxy --follow --region us-east-1

# Puppeteer Lambda
aws logs tail /aws/lambda/llmproxy-puppeteer --follow --region us-east-1
```

### Metrics to Monitor
- Request latency (especially streaming endpoints)
- Error rates
- Token usage and costs
- Cache hit/miss ratios
- Puppeteer fallback frequency

---

## Cost Optimization

### Puppeteer Strategy
- **Direct scraping first** (main Lambda, low memory)
- **Puppeteer fallback** (dedicated Lambda, high memory)
- **Estimated savings:** 60% on scraping operations

### Caching
- Query embeddings cached in browser IndexedDB
- Search results cached server-side
- Static assets served from `/docs` (no Lambda invocation)

---

## Future Improvements

### Potential Additions
1. WebSocket support for chat (reduce polling)
2. Batch embedding generation
3. Result pagination for large datasets
4. GraphQL endpoint as alternative to REST
5. Enhanced caching with Redis/ElastiCache
6. Rate limiting per user/endpoint

---

**Last Updated:** October 21, 2025  
**Maintained by:** System Architecture Team
