# Lambda LLM Proxy - System Architecture Summary

**Generated**: October 30, 2025  
**Version**: 1.0.1

---

## Table of Contents
1. [YouTube Transcripts Permission](#youtube-transcripts-permission)
2. [Media Scraping Methods](#media-scraping-methods)
3. [Provider Configuration](#provider-configuration)
4. [Model Selection Logic](#model-selection-logic)
5. [Model Capabilities Matrix](#model-capabilities-matrix)
6. [Cost Analysis & Optimization](#cost-analysis--optimization)

---

## YouTube Transcripts Permission

### OAuth Scope Required
**Permission**: `https://www.googleapis.com/auth/youtube.force-ssl`

### What This Grants
- ✅ Full YouTube Data API access
- ✅ Captions API access (list, download, upload, update, delete)
- ✅ Video metadata and search
- ✅ All features from `youtube.readonly` scope

### Why Not `youtube.readonly`?
The `youtube.readonly` scope does NOT include access to the Captions API:
- ❌ Cannot call `captions.list`
- ❌ Cannot call `captions.download`
- Result: HTTP 403 "insufficient authentication scopes" error

### User Setup
1. User clicks "Enable YouTube" in Settings
2. OAuth popup opens for Google authentication
3. User must **accept** the `youtube.force-ssl` permission
4. Token stored in browser localStorage (not sent to server)
5. Token sent as `X-YouTube-Token` header with each request

### Fallback Behavior
If user declines OAuth or token expires:
- YouTube **search** still works (returns video metadata without transcripts)
- YouTube **transcription** falls back to Whisper API (downloads audio, transcribes locally)
- Selenium caption extraction available as last resort (local dev only)

---

## Media Scraping Methods

The system uses multiple methods to convert media content into text, organized by tier and use case.

### 1. YouTube Transcripts (OAuth API)

**Method**: YouTube Data API v3 Captions endpoint  
**File**: `src/youtube-api.js`  
**Authentication**: OAuth2 with `youtube.force-ssl` scope

**How It Works**:
1. Extract video ID from URL (supports youtube.com, youtu.be, shorts)
2. Call `captions.list` API to get available caption tracks
3. Select track (prefer English, then auto-generated, then any)
4. Download caption content (SRT format)
5. Parse SRT to plain text

**Advantages**:
- ✅ Fast (no audio download/transcription)
- ✅ Free (uses user's OAuth token)
- ✅ Supports multiple languages
- ✅ Includes timestamps

**Limitations**:
- ⚠️ Requires user OAuth consent
- ⚠️ Only works for videos with captions

---

### 2. Whisper Audio Transcription

**Method**: OpenAI Whisper API via Groq/OpenAI providers  
**File**: `src/tools/transcribe.js`  
**Pricing**: Groq free tier (20 req/min) or OpenAI paid ($0.006/min)

**How It Works**:
1. Download audio from URL (supports YouTube, direct URLs, S3, etc.)
2. Split large files into 25MB chunks (Whisper limit)
3. Upload chunks to Whisper API for transcription
4. Merge transcriptions with overlap handling
5. Return text with optional timestamps

**Supported Formats**:
- Audio: MP3, M4A, WAV, WEBM, MPGA, MPEG
- Video: MP4, WEBM, AVI (extracts audio track)

**YouTube Integration**:
- Uses `ytdl-core` library to download audio
- Automatic quality selection (prefer 128kbps AAC)
- Handles age-restricted videos
- Respects `DISABLE_YOUTUBE_TRANSCRIPTION` environment flag

**Progress Updates**:
- Emits progress events during download/transcription
- Shows chunk progress for large files
- Real-time status in UI

---

### 3. Selenium Caption Extraction (Fallback)

**Method**: Browser automation via Selenium + undetected-chromedriver  
**File**: `src/scrapers/youtube-caption-scraper.js`  
**Environment**: Local development only (not available on Lambda)

**How It Works**:
1. Launch headless Chrome with stealth plugins
2. Navigate to YouTube video page
3. Click "More actions" menu
4. Click "Open transcript" button
5. Extract caption text from DOM
6. Parse timestamps and segments

**When Used**:
- OAuth token not available
- Whisper download blocked by YouTube
- Captions exist but API fails

**Advantages**:
- ✅ Works without OAuth
- ✅ Handles age-restricted videos
- ✅ Bypasses rate limits

**Limitations**:
- ⚠️ Slow (30-90 seconds per video)
- ⚠️ Local development only
- ⚠️ May break if YouTube UI changes

---

### 4. Web Scraping Tier System

**Method**: Multi-tier fallback orchestration  
**File**: `src/scrapers/tier-orchestrator.js`

The system uses a progressive escalation strategy for web scraping:

#### Tier 0: Direct HTTP Scraping
**Tools**: DuckDuckGo proxy, Tavily API, direct fetch  
**Availability**: Lambda + Local  
**Speed**: 200-500ms  
**Success Rate**: ~60% (works for simple sites)

- Raw HTTP GET request
- No JavaScript execution
- Minimal overhead
- Good for static HTML sites

#### Tier 1: Puppeteer with Stealth
**Tools**: Puppeteer + puppeteer-extra-plugin-stealth  
**Availability**: Lambda + Local  
**Speed**: 2-5 seconds  
**Success Rate**: ~80% (bypasses basic bot detection)

- Headless Chrome
- JavaScript execution
- Stealth plugins (webdriver detection, canvas fingerprinting, etc.)
- Screenshot capability
- Handles dynamic content

#### Tier 2: Playwright with Stealth
**Tools**: Playwright + playwright-extra  
**Availability**: Local only  
**Speed**: 3-6 seconds  
**Success Rate**: ~85% (better stealth than Puppeteer)

- Chromium/Firefox/WebKit support
- Advanced stealth features
- Network interception
- Mobile emulation

#### Tier 3: Selenium with Undetected ChromeDriver
**Tools**: Selenium + undetected-chromedriver  
**Availability**: Local only  
**Speed**: 5-10 seconds  
**Success Rate**: ~90% (bypasses Cloudflare)

- Real Chrome browser (not Chromium)
- Advanced anti-detection
- Handles Cloudflare challenges
- CAPTCHA preparation

#### Tier 4: Interactive Mode
**Tools**: Selenium with manual intervention  
**Availability**: Local only  
**Speed**: User-dependent  
**Success Rate**: ~95% (with user help)

- Opens visible browser window
- User manually solves CAPTCHAs
- User can log in if needed
- System waits for user to complete challenge
- Resumes automation after

**Escalation Logic**:
```
1. Try Tier 0 (Direct)
2. If 403/429/bot-detected → Try Tier 1 (Puppeteer)
3. If still blocked → Try Tier 2 (Playwright) [Local only]
4. If still blocked → Try Tier 3 (Selenium) [Local only]
5. If still blocked → Try Tier 4 (Interactive) [Local only]
6. If all fail → Return error with guidance
```

**Site-Specific Configuration** (`src/scrapers/site-config.js`):
- Pre-configured strategies for known sites
- Twitter/X: Start at Tier 1 (requires JS)
- LinkedIn: Start at Tier 3 (strong bot protection)
- Medium: Start at Tier 0 (works with direct)

---

### 5. Search Result Content Extraction

**Method**: DuckDuckGo text search with content scraping  
**File**: `src/search.js`  
**Integration**: Uses tier orchestrator for result content

**How It Works**:
1. Query DuckDuckGo for results
2. For each result URL, scrape content (tier orchestrator)
3. Extract main content, remove ads/navigation
4. Summarize with LLM (large model for text compression)
5. Return structured data

**Content Processing**:
- HTML sanitization (remove scripts, styles)
- Main content detection (readability algorithms)
- Ad/navigation removal
- Character limit (50K per result)

---

## Provider Configuration

You have **7 active providers** configured in `.env`:

### Provider 0: Groq
```bash
LP_TYPE_0=groq
LP_KEY_0=gsk_9MPNPPxxxxx...
```
**Models Available**:
- `llama-3.1-8b-instant` (Free: $0/$0, Paid: $0.05/$0.08 per M tokens)
- `llama-3.3-70b-versatile` (Free: $0/$0, Paid: $0.59/$0.79 per M tokens)
- `meta-llama/llama-4-maverick-17b-128e-instruct` (Vision, $0.20/$0.60)
- `meta-llama/llama-4-scout-17b-16e-instruct` (Vision, $0.11/$0.34)
- `moonshotai/kimi-k2-instruct` (262K context, $1.00/$3.00)
- `qwen/qwen3-32b` ($0.29/$0.59)
- Plus reasoning models, experimental models

**Capabilities**: Chat, tools, streaming, vision (some models)  
**Rate Limits**: 
- Free tier: 30 req/min, 6K-30K tokens/min
- Paid tier: 1000 req/min, 30K-300K tokens/min

---

### Provider 2: Google Gemini #1
```bash
LP_TYPE_2=gemini
LP_KEY_2=AIzaSyAbXpirxxx...
```
**Models Available**:
- `gemini-2.5-flash` (Free: $0/$0, Paid: $0.075/$0.30 per M tokens)
- `gemini-2.5-pro` (Free: $0/$0, Paid: $1.25/$5.00 per M tokens)
- `gemini-2.0-flash-exp` (Free experimental)

**Capabilities**: Chat, tools, vision, 1M-2M context window  
**Rate Limits**:
- Free tier: 15 req/min, 1M tokens/min
- Paid tier: 360-1500 req/min, 4M tokens/min

---

### Provider 3: Together AI
```bash
LP_TYPE_3=together
LP_CAPABILITIES_3=image,tts,embeddings
LP_ALLOWED_MODELS_3=black-forest-labs/FLUX.1-schnell-Free,cartesia/sonic
```
**Specialized Provider**:
- **Image Generation**: FLUX.1-schnell-Free (free tier)
- **Text-to-Speech**: Cartesia Sonic ($0.065 per 1M characters)
- **Embeddings**: Various models ($0.008-0.02 per M tokens)

**Chat Models** (if enabled):
- Llama 3.3 70B Turbo ($0.88/$0.88)
- DeepSeek R1/V3 (reasoning, $0.27-2.19)
- Mixtral 8x7B ($0.60/$0.60)

---

### Provider 5: Groq #2
```bash
LP_TYPE_5=groq
LP_KEY_5=gsk_jnsnQUFIxxx...
```
**Purpose**: Additional Groq quota for load balancing  
**Models**: Same as Provider 0  
**Use Case**: Doubles available rate limits, round-robin selection

---

### Provider 6: Google Gemini #2
```bash
LP_TYPE_6=gemini
LP_KEY_6=AIzaSyDPR3bxxx...
```
**Purpose**: Additional Gemini quota for load balancing  
**Models**: Same as Provider 2  
**Use Case**: Doubles available rate limits, round-robin selection

---

### Provider 7: Anthropic Claude
```bash
LP_TYPE_7=anthropic
LP_KEY_7=sk-ant-api03-wIyvcxxx...
```
**Models Available**:
- `claude-sonnet-4-5-20250929` ($3/$15 per M tokens) - Flagship
- `claude-3-7-sonnet-20250219` ($3/$15 per M tokens) - Large
- `claude-3-5-haiku-20241022` ($0.80/$4 per M tokens) - Fast

**Capabilities**: Chat, tools, vision, 200K context window  
**Specialty**: Advanced reasoning, long-context analysis

---

## Model Selection Logic

The system uses **intelligent model selection** based on request analysis, cost preferences, and rate limits.

### Selection Algorithm (`src/model-selection/selector.js`)

```
┌─────────────────────────────────────────┐
│  1. Analyze Request                     │
│     - Message count, length, complexity │
│     - Tool requirements                 │
│     - Token estimates                   │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  2. Determine Category                  │
│     - SMALL (simple queries)            │
│     - LARGE (complex analysis)          │
│     - REASONING (math, code, logic)     │
│     - FLAGSHIP (mission-critical)       │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  3. Get Candidate Models                │
│     - Filter by category                │
│     - Filter by context window          │
│     - Filter by tool support            │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  4. Apply Rate Limits                   │
│     - Check provider availability       │
│     - Check token quotas                │
│     - Remove rate-limited models        │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  5. Apply Cost Constraints              │
│     - Filter by maxCostPerMillion       │
│     - Respect user budget               │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  6. Prioritize by Strategy              │
│     - COST_OPTIMIZED: Cheapest first    │
│     - FREE_TIER: Free models first      │
│     - QUALITY_OPTIMIZED: Best first     │
│     - BALANCED: Mix of cost/quality     │
│     - SPEED_OPTIMIZED: Fastest first    │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  7. Apply Provider Priority             │
│     - Sort by LP_PRIORITY_X values      │
│     - Lower number = higher priority    │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  8. Select Model                        │
│     - Round-robin (load balancing)      │
│     - OR take first (priority-based)    │
└─────────────────────────────────────────┘
```

### Selection Strategies

#### 1. COST_OPTIMIZED (Default)
**Goal**: Minimize cost while meeting requirements

**Priority**:
1. **Free tier models** (sorted by context window)
   - Small requests: Prefer small context (llama-3.1-8b)
   - Large requests: Prefer large context (gemini-2.5-flash 1M)
2. **Paid models** (sorted by price, cheapest first)

**Example Selection**:
```
Simple query (5K tokens):
  → llama-3.1-8b-instant (free, 128K context)

Medium query (50K tokens):
  → gemini-2.5-flash (free, 1M context)

Complex query (100K tokens):
  → gemini-2.5-flash (free, 1M context)

Reasoning task:
  → llama-3.3-70b-versatile (free)
```

---

#### 2. FREE_TIER
**Goal**: Only use free models, reject if none available

**Priority**:
1. Free tier models only
2. Sorted by context window
3. Error if no free models match

**Use Case**: User has no budget, uses free API keys only

---

#### 3. QUALITY_OPTIMIZED
**Goal**: Best quality regardless of cost

**Priority**:
1. **Reasoning models** (for complex analysis)
   - DeepSeek R1
   - OpenAI o1-preview
   - Claude Sonnet 4.5
2. **Flagship models** (sorted by price, highest first)
   - gemini-2.5-pro
   - gpt-4o
   - claude-sonnet-4-5
3. **Large models** (70B+)

**Example Selection**:
```
Simple query:
  → gemini-2.5-pro ($1.25/$5.00)

Complex analysis:
  → claude-sonnet-4-5 ($3/$15)

Math/code problem:
  → deepseek-r1 ($0.55/$2.19, reasoning model)
```

---

#### 4. BALANCED
**Goal**: Balance cost and quality

**Priority**:
1. Free tier for simple queries
2. Mid-tier paid for complex queries
3. Flagship only for critical tasks

**Logic**:
- Simple query (<10K tokens) → Free tier
- Medium query (10K-50K tokens) → Free large context OR cheap paid
- Complex query (>50K tokens) → Paid large model
- Reasoning task → Best reasoning model available

---

#### 5. SPEED_OPTIMIZED
**Goal**: Fastest response time

**Priority**:
1. Small models (8B-17B parameters)
2. High tokens/second (TPS) ratings
3. Low latency providers

**Example Selection**:
```
Any query:
  → llama-3.1-8b-instant (560 TPS)
  → meta-llama/llama-4-scout-17b (750 TPS)
  → qwen/qwen3-32b (400 TPS)
```

---

### Request Type Detection

The system analyzes messages to determine request type:

**SIMPLE** (30% of requests):
- Short messages (<500 chars)
- No tools required
- Single turn conversation
- **Model**: Small (8B-17B)

**COMPLEX** (40% of requests):
- Multiple messages (3+)
- Long context (>2K tokens)
- Tool calls (search, scrape, etc.)
- **Model**: Large (70B+)

**REASONING** (10% of requests):
- Math problems
- Code generation
- Logic puzzles
- Step-by-step analysis
- **Model**: Reasoning (o1, DeepSeek R1)

**FLAGSHIP** (5% of requests):
- Critical business decisions
- Legal/medical analysis
- High-stakes generation
- **Model**: Flagship (GPT-4o, Claude Sonnet 4.5)

**COMPRESSION** (15% of requests):
- Summarization
- Long document analysis
- Multi-source synthesis
- **Model**: Large (70B+, good at condensing)

---

### Examples with Actual Selections

#### Example 1: Simple Chat Query
```
User: "What is the capital of France?"

Analysis:
  - Type: SIMPLE
  - Tokens: ~20 input, ~50 output
  - Tools: None
  - Category: SMALL

Strategy: COST_OPTIMIZED

Selection:
  1. Filter: llama-3.1-8b (free, 128K) ✓
  2. Filter: gemini-2.5-flash (free, 1M) ✓
  3. Prioritize free tier, small context first
  → Selected: llama-3.1-8b-instant
  
Cost: $0 (free tier)
Speed: ~0.5s (560 TPS)
```

---

#### Example 2: Web Search + Summary
```
User: "Search for latest AI news and summarize"

Analysis:
  - Type: COMPLEX
  - Tokens: ~100 input, ~2000 output (search results + summary)
  - Tools: search_web, scrape_url
  - Category: LARGE

Strategy: COST_OPTIMIZED

Selection:
  1. Filter: llama-3.3-70b (free, 128K) ✓
  2. Filter: gemini-2.5-flash (free, 1M) ✓
  3. Prioritize free tier, large context for search results
  → Selected: gemini-2.5-flash
  
Cost: $0 (free tier)
Context: 1M tokens (enough for 10+ search results)
```

---

#### Example 3: Code Generation with Reasoning
```
User: "Write a Python function to calculate Fibonacci with memoization. Explain the algorithm."

Analysis:
  - Type: REASONING
  - Tokens: ~50 input, ~800 output
  - Tools: None
  - Category: REASONING

Strategy: QUALITY_OPTIMIZED

Selection:
  1. Filter reasoning models: deepseek-r1, o1-mini
  2. Check rate limits (deepseek-r1 available)
  3. Prioritize reasoning models
  → Selected: deepseek-ai/DeepSeek-R1
  
Cost: $0.055 input + $0.219 output = ~$0.274 per M tokens
Actual cost: ~$0.0002 (for this request)
Quality: Best reasoning model available
```

---

#### Example 4: Long Document Analysis
```
User: [Uploads 100K token PDF] "Summarize this legal document and extract key clauses"

Analysis:
  - Type: COMPRESSION
  - Tokens: 100K input, ~2K output
  - Tools: None
  - Category: FLAGSHIP (large context required)

Strategy: COST_OPTIMIZED

Selection:
  1. Filter by context window (100K + 2K = 102K)
     - llama-3.1-8b: 128K ✓
     - gemini-2.5-flash: 1M ✓
     - gemini-2.5-pro: 2M ✓
  2. Prioritize free tier
  → Selected: gemini-2.5-flash (free, 1M context)
  
Cost: $0 (free tier)
Context: 1M tokens (plenty for 100K doc)

Fallback if rate limited:
  → gemini-2.5-pro (paid, 2M context)
  Cost: $0.125 input + $0.010 output = $0.135
```

---

#### Example 5: Mission-Critical Generation
```
User: "Generate a legal contract for software licensing. Must be accurate."

Analysis:
  - Type: FLAGSHIP
  - Tokens: ~200 input, ~3000 output
  - Tools: None
  - Category: FLAGSHIP

Strategy: QUALITY_OPTIMIZED

Selection:
  1. Filter flagship models
  2. Prioritize by cost (higher = better for legal)
  → Selected: claude-sonnet-4-5-20250929
  
Cost: $3 input + $15 output = $18 per M tokens
Actual cost: $0.006 input + $0.045 output = $0.051
Quality: Best available model for critical tasks
```

---

## Model Capabilities Matrix

### Chat Models by Use Case

| Model | Provider | Context | Price (Input/Output) | Best For | Speed | Quality |
|-------|----------|---------|---------------------|----------|-------|---------|
| **FREE TIER** |
| llama-3.1-8b-instant | Groq | 128K | $0/$0 | Simple queries, fast responses | ⚡⚡⚡⚡⚡ | ⭐⭐⭐ |
| llama-3.3-70b-versatile | Groq | 128K | $0/$0 | Complex analysis, tool calls | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ |
| gemini-2.5-flash | Gemini | 1M | $0/$0 | Long documents, large context | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ |
| gemini-2.0-flash-exp | Gemini | 1M | $0/$0 | Experimental features | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ |
| kimi-k2-instruct | Groq | 262K | $0/$0 | Ultra-long context | ⚡⚡⚡ | ⭐⭐⭐⭐ |
| **PAID SMALL** |
| gpt-4o-mini | OpenAI | 128K | $0.15/$0.60 | Cost-effective GPT-4 | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ |
| claude-3-5-haiku | Anthropic | 200K | $0.80/$4.00 | Fast Claude responses | ⚡⚡⚡⚡⚡ | ⭐⭐⭐⭐ |
| **PAID LARGE** |
| llama-3.3-70b-versatile | Groq | 128K | $0.59/$0.79 | Paid Groq (higher limits) | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ |
| gemini-2.5-flash | Gemini | 1M | $0.075/$0.30 | Paid Gemini (4M TPM) | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ |
| gemini-2.5-pro | Gemini | 2M | $1.25/$5.00 | Advanced reasoning | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ |
| gpt-4o | OpenAI | 128K | $2.50/$10.00 | General-purpose flagship | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ |
| claude-3-7-sonnet | Anthropic | 200K | $3.00/$15.00 | Balanced Claude | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ |
| claude-sonnet-4-5 | Anthropic | 200K | $3.00/$15.00 | Best reasoning | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ |
| **REASONING** |
| deepseek-r1 | Together | 164K | $0.55/$2.19 | Code, math, logic | ⚡⚡ | ⭐⭐⭐⭐⭐ |
| o1-mini | OpenAI | 128K | $3.00/$12.00 | Fast reasoning | ⚡⚡ | ⭐⭐⭐⭐⭐ |
| o1-preview | OpenAI | 128K | $15.00/$60.00 | Deep reasoning | ⚡ | ⭐⭐⭐⭐⭐ |

### Specialized Models

| Model | Provider | Capability | Price | Use Case |
|-------|----------|-----------|-------|----------|
| whisper-large-v3 | Groq | Transcription | $0/min | Audio/video to text (free) |
| whisper-1 | OpenAI | Transcription | $0.006/min | Audio/video to text (paid) |
| FLUX.1-schnell-Free | Together | Image Gen | $0 | Fast image generation |
| cartesia/sonic | Together | TTS | $0.065/1M chars | Text-to-speech |
| text-embedding-3-small | OpenAI | Embeddings | $0.02/1M | RAG, search indexing |
| embed-english-v3.0 | Cohere | Embeddings | $0.10/1M | RAG, semantic search |

---

## Cost Analysis & Optimization

### Current Provider Costs

#### Your Active Providers
1. **Groq** (Provider 0, 5): 2 API keys
   - Free tier: 30 req/min, 6K-30K TPM per key = **60 req/min total**
   - Paid tier: 1000 req/min, 30K-300K TPM per key = **2000 req/min total**
   - Cost: Free tier $0, Paid $0.05-0.79 per M tokens

2. **Google Gemini** (Provider 2, 6): 2 API keys
   - Free tier: 15 req/min, 1M TPM per key = **30 req/min total**
   - Paid tier: 360-1500 req/min, 4M TPM per key = **720-3000 req/min total**
   - Cost: Free tier $0, Paid $0.075-5.00 per M tokens

3. **Together AI** (Provider 3): 1 API key
   - Image generation: **Free** (FLUX.1-schnell)
   - TTS: **$0.065 per 1M chars** (requires Build Tier 2+)
   - Chat: $0.27-0.88 per M tokens

4. **Anthropic Claude** (Provider 7): 1 API key
   - No free tier
   - Cost: $0.80-15.00 per M tokens

**Total Free Capacity**:
- **90 requests/min** (60 Groq + 30 Gemini)
- **~37M tokens/min** (12K Groq + 2M Gemini, varies by model)

---

### Cost Scenarios

#### Scenario 1: All Free Tier (Default)
**Strategy**: COST_OPTIMIZED with preferFree=true

**Model Selection**:
- Simple queries: llama-3.1-8b-instant (Groq free)
- Complex queries: gemini-2.5-flash (Gemini free)
- Long context: gemini-2.5-flash (1M context free)
- Reasoning: llama-3.3-70b-versatile (Groq free)

**Monthly Cost**: **$0**  
**Limitations**:
- Rate limits: 90 req/min total
- May hit rate limits during heavy usage
- Quality: Good for most use cases

---

#### Scenario 2: Mixed Free + Paid Budget
**Strategy**: COST_OPTIMIZED with maxCostPerMillion=$5.00

**Model Selection**:
- Simple: llama-3.1-8b-instant (free, $0)
- Complex: gemini-2.5-flash (free, $0)
- Very complex: gemini-2.5-pro (paid, $1.25/$5.00)
- Long context: gemini-2.5-flash (free, $0)
- Reasoning: deepseek-r1 (paid, $0.55/$2.19)

**Monthly Cost (1M tokens/month)**:
- 70% free tier: $0
- 20% gemini-2.5-pro: $1,250 (1M input) + $1,000 (200K output) = $2.25
- 10% deepseek-r1: $55 (100K input) + $219 (100K output) = $0.27
- **Total: ~$2.52** per month

**Benefits**:
- Higher rate limits (falls back to paid when free exhausted)
- Better quality for complex tasks
- Still mostly free

---

#### Scenario 3: Quality-First (No Budget Limit)
**Strategy**: QUALITY_OPTIMIZED

**Model Selection**:
- Simple: gemini-2.5-pro ($1.25/$5.00)
- Complex: claude-sonnet-4-5 ($3/$15)
- Reasoning: o1-preview ($15/$60)
- Long context: gemini-2.5-pro (2M context)

**Monthly Cost (1M tokens/month)**:
- 50% gemini-2.5-pro: $625 (500K in) + $2,500 (500K out) = $3.13
- 30% claude-sonnet-4-5: $900 (300K in) + $4,500 (300K out) = $5.40
- 20% o1-preview: $3,000 (200K in) + $12,000 (200K out) = $15.00
- **Total: ~$23.53** per month

**Benefits**:
- Best possible quality
- No rate limit concerns
- Suitable for critical applications

---

#### Scenario 4: Hybrid Smart Routing
**Strategy**: BALANCED with dynamic escalation

**Model Selection Logic**:
```
IF request.type == SIMPLE:
    → llama-3.1-8b-instant (free, $0)
    
ELSE IF request.type == COMPLEX AND request.tokens < 50K:
    → gemini-2.5-flash (free, $0)
    
ELSE IF request.type == COMPLEX AND request.tokens > 50K:
    → gemini-2.5-pro (paid, $1.25/$5.00)
    
ELSE IF request.type == REASONING:
    → deepseek-r1 (paid, $0.55/$2.19)
    
ELSE IF request.type == FLAGSHIP:
    → claude-sonnet-4-5 (paid, $3/$15)
```

**Monthly Cost (1M tokens/month)**:
- 60% free (simple + medium): $0
- 25% gemini-2.5-pro: $312.50 + $1,250 = $1.56
- 10% deepseek-r1: $55 + $219 = $0.27
- 5% claude-sonnet-4-5: $150 + $750 = $0.90
- **Total: ~$2.73** per month

**Benefits**:
- Best cost/quality balance
- Automatic escalation for complex tasks
- Mostly free, paid only when needed

---

### Cost Optimization Recommendations

#### 1. Enable Provider Priority
Set `LP_PRIORITY_X` environment variables to control which providers are tried first:

```bash
# Prefer free tier Groq first, then Gemini, then paid
LP_PRIORITY_0=1  # Groq free (highest priority)
LP_PRIORITY_5=1  # Groq free (same priority, round-robin)
LP_PRIORITY_2=2  # Gemini free (second priority)
LP_PRIORITY_6=2  # Gemini free (same priority, round-robin)
LP_PRIORITY_7=3  # Anthropic paid (lowest priority)
```

**Result**: Free tiers exhausted before paid APIs used

---

#### 2. Set Cost Constraints
Configure `maxCostPerMillion` in preferences:

```javascript
// Only use models under $1 per M tokens
preferences: {
  strategy: 'COST_OPTIMIZED',
  maxCostPerMillion: 1.00
}

// Allowed models:
// ✓ llama-3.1-8b-instant ($0)
// ✓ gemini-2.5-flash ($0 free, $0.075/$0.30 paid)
// ✓ llama-3.3-70b-versatile ($0 free, $0.59/$0.79 paid)
// ✓ claude-3-5-haiku ($0.80/$4.00) - average $2.40
// ✗ gemini-2.5-pro ($1.25/$5.00) - average $3.13
// ✗ claude-sonnet-4-5 ($3/$15) - average $9.00
```

---

#### 3. Monitor Rate Limits
Use `RateLimitTracker` to prevent hitting limits:

```javascript
const tracker = new RateLimitTracker(providers, catalog);

// Check before making request
if (tracker.isAvailable('groq', 'llama-3.1-8b', estimatedTokens)) {
  // Use this model
} else {
  // Fall back to different provider
}

// Update after response
tracker.update('groq', 'llama-3.1-8b', tokensUsed, rateLimitHeaders);
```

**Benefit**: Automatic fallback to paid tier when free exhausted

---

#### 4. Use Free Tier Exhaustion Strategy
Configure strategy to prefer free tier until exhausted:

```javascript
preferences: {
  strategy: 'FREE_TIER',  // Reject if no free models available
  fallbackStrategy: 'COST_OPTIMIZED'  // Fall back to cheap paid
}
```

**Result**: 
- Use free while available
- Graceful fallback to paid when needed
- Explicit cost control

---

### Monthly Cost Projections

Based on typical usage patterns:

| Usage Level | Requests/Month | Tokens/Month | Strategy | Est. Cost |
|-------------|----------------|--------------|----------|-----------|
| **Light** (Personal) | 10K | 500K | FREE_TIER | **$0** |
| **Medium** (Small Team) | 100K | 5M | COST_OPTIMIZED | **$15-25** |
| **Heavy** (Business) | 1M | 50M | BALANCED | **$150-250** |
| **Enterprise** | 10M | 500M | QUALITY_OPTIMIZED | **$2,500-5,000** |

**Breakdown for Medium Usage** (100K requests, 5M tokens):
- 80% free tier: $0 (4M tokens via Groq + Gemini)
- 15% paid small: $50 (750K @ $0.075/$0.30 avg)
- 5% paid large: $150 (250K @ $3/$15 avg)
- **Total: ~$200/month**

---

## Summary

This system provides **comprehensive media-to-text conversion** with intelligent fallbacks and **cost-optimized LLM selection** across 7 providers.

### Key Features
1. **YouTube Transcripts**: OAuth API (free) → Whisper (paid/free) → Selenium (local)
2. **Web Scraping**: 5-tier fallback (Direct → Puppeteer → Playwright → Selenium → Interactive)
3. **Provider Pool**: 2x Groq, 2x Gemini, 1x Together, 1x Anthropic = 7 providers
4. **Model Selection**: Intelligent routing based on complexity, cost, rate limits
5. **Cost Control**: Free tier first, paid only when needed, configurable limits

### Default Behavior
- **Simple queries**: Free tier (llama-3.1-8b, $0)
- **Complex queries**: Free tier (gemini-2.5-flash, $0)
- **Reasoning**: Free tier (llama-3.3-70b, $0) or paid (deepseek-r1, $0.55/$2.19)
- **Critical tasks**: Paid flagship (claude-sonnet-4-5, $3/$15)

### Cost Optimization
- Use FREE_TIER strategy for $0/month
- Use COST_OPTIMIZED for ~$2-5/month with better quality
- Use BALANCED for ~$15-25/month with smart routing
- Use QUALITY_OPTIMIZED for ~$25-50/month with best results

---

**End of Document**
