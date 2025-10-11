# Backend Environment Variables Usage

## Complete List of Environment Variables Used in Backend Code

### 1. API Keys & Credentials
| Variable | Files | Usage | Required |
|----------|-------|-------|----------|
| `OPENAI_API_KEY` | llm_tools_adapter.js, tools.js | OpenAI API authentication | No (fallback) |
| `GROQ_API_KEY` | model-selector.js, llm_tools_adapter.js, tools.js | Groq API authentication | No (fallback) |
| `GEMINI_API_KEY` | (planned) | Gemini API authentication | No |

### 2. Provider Configuration (New Format)
| Variable Pattern | File | Usage | Required |
|-----------------|------|-------|----------|
| `LLAMDA_LLM_PROXY_PROVIDER_TYPE_N` | credential-pool.js | Provider type (openai, groq-free, etc.) | Yes (per provider) |
| `LLAMDA_LLM_PROXY_PROVIDER_KEY_N` | credential-pool.js | API key for provider N | Yes (per provider) |
| `LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_N` | credential-pool.js | Custom API endpoint (optional) | No |
| `LLAMDA_LLM_PROXY_PROVIDER_MODEL_N` | credential-pool.js | Default model for provider N | No |
| `LLAMDA_LLM_PROXY_PROVIDER_RATE_LIMIT_N` | credential-pool.js | Rate limit in TPM | No |

### 3. Authentication & Authorization
| Variable | Files | Usage | Required |
|----------|-------|-------|----------|
| `ALLOWED_EMAILS` | auth.js | Comma-separated list of authorized Google emails | Yes |
| `ACCESS_SECRET` | lambda_search_llm_handler.js | Legacy access secret for basic auth | No |
| `GOOGLE_CLIENT_ID` | auth.js, endpoints/oauth.js | Google OAuth client ID | Yes (for YouTube) |
| `GOOGLE_CLIENT_SECRET` | endpoints/oauth.js | Google OAuth client secret | Yes (for YouTube) |
| `OAUTH_REDIRECT_URI` | endpoints/oauth.js | OAuth callback URL | Yes (for YouTube) |

### 4. Tool Configuration
| Variable | Files | Usage | Required |
|----------|-------|-------|----------|
| `MAX_TOOL_ITERATIONS` | config/prompts.js, endpoints/chat.js | Maximum tool call iterations (default: 15) | No |
| `DISABLE_YOUTUBE_TRANSCRIPTION` | tools.js (lines 1210, 1334, 1571) | Disable YouTube transcription feature | No |
| `MEDIA_DOWNLOAD_TIMEOUT` | tools/youtube-downloader.js, tools/transcribe.js | Media download timeout in ms (default: 30000) | No |

### 5. Model Configuration
| Variable | Files | Usage | Required |
|----------|-------|-------|----------|
| `GROQ_MODEL` | tools.js | Default Groq model for tool execution | No |
| `OPENAI_MODEL` | tools.js | Default OpenAI model for tool execution | No |
| `GROQ_REASONING_MODELS` | llm_tools_adapter.js | Comma-separated list of Groq reasoning models | No |
| `REASONING_EFFORT` | config/prompts.js, llm_tools_adapter.js | Reasoning effort (low/medium/high) | No |
| `OPENAI_API_BASE` | llm_tools_adapter.js | Custom OpenAI API base URL | No |

### 6. System Prompts & Templates
| Variable | Files | Usage | Required |
|----------|-------|-------|----------|
| `SYSTEM_PROMPT_SEARCH` | config/prompts.js | Main system prompt for search queries | No |
| `SYSTEM_PROMPT_DIGEST_ANALYST` | tools.js | System prompt for search result analysis | No |
| `FINAL_TEMPLATE` | lambda_search_llm_handler.js | Template for final response synthesis | No |

### 7. AWS Lambda
| Variable | Files | Usage | Required |
|----------|-------|-------|----------|
| `AWS_LAMBDA_FUNCTION_MEMORY_SIZE` | memory-tracker.js | Lambda memory limit (auto-set by AWS) | Auto |

## Environment Variables by File

### src/auth.js
- `ALLOWED_EMAILS` - Parse authorized user emails
- `GOOGLE_CLIENT_ID` - Validate Google OAuth tokens

### src/config/prompts.js
- `MAX_TOOL_ITERATIONS` - Tool iteration limit
- `REASONING_EFFORT` - Reasoning effort level
- `SYSTEM_PROMPT_SEARCH` - Search system prompt

### src/credential-pool.js
- `LLAMDA_LLM_PROXY_PROVIDER_TYPE_N` - Provider type
- `LLAMDA_LLM_PROXY_PROVIDER_KEY_N` - Provider API key
- `LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_N` - Custom endpoint
- `LLAMDA_LLM_PROXY_PROVIDER_MODEL_N` - Default model
- `LLAMDA_LLM_PROXY_PROVIDER_RATE_LIMIT_N` - Rate limit

### src/endpoints/chat.js
- `MAX_TOOL_ITERATIONS` - Tool iteration limit

### src/endpoints/oauth.js
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth client secret
- `OAUTH_REDIRECT_URI` - OAuth redirect URI

### src/lambda_search_llm_handler.js
- `FINAL_TEMPLATE` - Final response template
- `ACCESS_SECRET` - Legacy access control

### src/llm_tools_adapter.js
- `GROQ_REASONING_MODELS` - Groq reasoning model list
- `REASONING_EFFORT` - Reasoning effort level (multiple uses)
- `OPENAI_API_BASE` - OpenAI API base URL
- `OPENAI_API_KEY` - OpenAI API key (fallback)
- `GROQ_API_KEY` - Groq API key (fallback)

### src/memory-tracker.js
- `AWS_LAMBDA_FUNCTION_MEMORY_SIZE` - Lambda memory limit (auto-set)

### src/model-selector.js
- `GROQ_API_KEY` - Groq API authentication

### src/tools.js
- `SYSTEM_PROMPT_DIGEST_ANALYST` - Search digest prompt
- `DISABLE_YOUTUBE_TRANSCRIPTION` - YouTube transcription toggle (3 locations)
- `OPENAI_API_KEY` - OpenAI fallback key
- `GROQ_API_KEY` - Groq fallback key
- `GROQ_MODEL` - Default Groq model
- `OPENAI_MODEL` - Default OpenAI model

### src/tools/youtube-downloader.js
- `MEDIA_DOWNLOAD_TIMEOUT` - Download timeout

### src/tools/transcribe.js
- `MEDIA_DOWNLOAD_TIMEOUT` - Download timeout

## Critical Variables for Lambda Deployment

These variables MUST be set in AWS Lambda Console (not just .env):

1. **Authentication**:
   - `ALLOWED_EMAILS` - Controls who can use server-side API keys
   - `GOOGLE_CLIENT_ID` - Required for YouTube OAuth
   - `GOOGLE_CLIENT_SECRET` - Required for YouTube OAuth
   - `OAUTH_REDIRECT_URI` - Required for YouTube OAuth

2. **API Keys** (if using server-side providers):
   - `OPENAI_API_KEY` or provider format
   - `GROQ_API_KEY` or provider format
   - Provider format: `LLAMDA_LLM_PROXY_PROVIDER_TYPE_N`, etc.

3. **Feature Control**:
   - `DISABLE_YOUTUBE_TRANSCRIPTION` - **CURRENTLY NOT SET IN LAMBDA** (causing empty response issue)
   - `MAX_TOOL_ITERATIONS` - Optional override (default: 15)

4. **Optional Configuration**:
   - `REASONING_EFFORT` - Default: "medium"
   - `MEDIA_DOWNLOAD_TIMEOUT` - Default: 30000ms
   - System prompts and templates (all have defaults)

## Current Issue: DISABLE_YOUTUBE_TRANSCRIPTION

**Status**: Set in local .env but NOT in Lambda environment
**Impact**: Causes empty responses for YouTube search queries
**Solution**: Set in AWS Lambda Console → Environment variables
