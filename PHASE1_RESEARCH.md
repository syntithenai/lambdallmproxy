# Phase 1: Research & Data Collection

## Objective
Create a comprehensive, machine-readable catalog of LLM providers, their models, pricing, and rate limits to serve as the foundation for intelligent model selection.

## Research Tasks

### 1. Provider API Documentation Review

#### Groq
- **API Docs**: https://console.groq.com/docs/
- **Models Endpoint**: `GET https://api.groq.com/openai/v1/models`
- **Rate Limits**: Available in response headers (`x-ratelimit-*`)
- **Free Tier**: Yes - 14,400 requests/day, 7,000 requests/min
- **Pricing**: https://groq.com/pricing/

#### OpenAI
- **API Docs**: https://platform.openai.com/docs/api-reference
- **Models Endpoint**: `GET https://api.openai.com/v1/models`
- **Rate Limits**: Tier-based, documented per model
- **Free Tier**: No (credit trial only)
- **Pricing**: https://openai.com/api/pricing/

#### Google Gemini
- **API Docs**: https://ai.google.dev/docs
- **Models Endpoint**: `GET https://generativelanguage.googleapis.com/v1/models`
- **Rate Limits**: 15 RPM (free), 1000 RPM (paid)
- **Free Tier**: Yes - Gemini 1.5 Flash/Pro free with limits
- **Pricing**: https://ai.google.dev/pricing


### 2. OpenAI-Compatible Endpoints Research

Common endpoints to auto-suggest:
- **Together AI**: `https://api.together.xyz/v1`
- **Anyscale**: `https://api.endpoints.anyscale.com/v1`
- **Perplexity**: `https://api.perplexity.ai`
- **DeepInfra**: `https://api.deepinfra.com/v1/openai`
- **Fireworks AI**: `https://api.fireworks.ai/inference/v1`
- **Hugging Face**: `https://api-inference.huggingface.co/models/{model}`
- **LocalAI**: `http://localhost:8080/v1` (local deployment)
- **Ollama**: `http://localhost:11434/v1` (local deployment)

### 3. Rate Limit Header Standards

#### Common Headers
- `x-ratelimit-limit-requests` - Total requests allowed
- `x-ratelimit-limit-tokens` - Total tokens allowed
- `x-ratelimit-remaining-requests` - Requests remaining
- `x-ratelimit-remaining-tokens` - Tokens remaining
- `x-ratelimit-reset-requests` - Time until request limit resets
- `x-ratelimit-reset-tokens` - Time until token limit resets

#### Provider-Specific
- **Groq**: Uses standard headers, very reliable
- **OpenAI**: Uses standard headers
- **Gemini**: May not expose in headers, check docs

## Deliverable: PROVIDER_CATALOG.json Structure

```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-10-09",
  "providers": {
    "groq": {
      "name": "Groq",
      "type": "groq",
      "apiBase": "https://api.groq.com/openai/v1",
      "supportsStreaming": true,
      "supportsTools": true,
      "freeTier": {
        "available": true,
        "limits": {
          "requestsPerMinute": 7000,
          "requestsPerDay": 14400,
          "tokensPerMinute": 30000,
          "tokensPerDay": null
        }
      },
      "rateLimitHeaders": {
        "format": "standard",
        "prefix": "x-ratelimit-"
      },
      "models": {
        "llama-3.1-8b-instant": {
          "id": "llama-3.1-8b-instant",
          "category": "small",
          "contextWindow": 131072,
          "maxOutput": 8192,
          "pricing": {
            "input": 0.05,
            "output": 0.08,
            "unit": "per_million_tokens"
          },
          "capabilities": ["chat", "tools"],
          "deprecated": false
        },
        "meta-llama/llama-4-scout-17b-16e-instruct": {
          "id": "meta-llama/llama-4-scout-17b-16e-instruct",
          "category": "large",
          "contextWindow": 131072,
          "maxOutput": 32768,
          "pricing": {
            "input": 0.10,
            "output": 0.15,
            "unit": "per_million_tokens"
          },
          "capabilities": ["chat", "tools"],
          "deprecated": false
        }
      }
    },
    "openai": {
      "name": "OpenAI",
      "type": "openai",
      "apiBase": "https://api.openai.com/v1",
      "supportsStreaming": true,
      "supportsTools": true,
      "freeTier": {
        "available": false
      },
      "models": {
        "gpt-4o-mini": {
          "id": "gpt-4o-mini",
          "category": "small",
          "contextWindow": 128000,
          "maxOutput": 16384,
          "pricing": {
            "input": 0.15,
            "output": 0.60,
            "unit": "per_million_tokens"
          }
        },
        "gpt-4o": {
          "id": "gpt-4o",
          "category": "large",
          "contextWindow": 128000,
          "maxOutput": 16384,
          "pricing": {
            "input": 2.50,
            "output": 10.00,
            "unit": "per_million_tokens"
          }
        }
      }
    },
    "gemini": {
      "name": "Google Gemini",
      "type": "gemini",
      "apiBase": "https://generativelanguage.googleapis.com/v1beta",
      "supportsStreaming": true,
      "supportsTools": true,
      "freeTier": {
        "available": true,
        "limits": {
          "requestsPerMinute": 15,
          "requestsPerDay": 1500,
          "tokensPerMinute": 32000,
          "tokensPerDay": 50000000
        }
      },
      "models": {
        "gemini-1.5-flash": {
          "id": "gemini-1.5-flash",
          "category": "small",
          "contextWindow": 1000000,
          "maxOutput": 8192,
          "pricing": {
            "input": 0.00,
            "output": 0.00,
            "unit": "per_million_tokens",
            "free": true
          }
        },
        "gemini-1.5-pro": {
          "id": "gemini-1.5-pro",
          "category": "large",
          "contextWindow": 2000000,
          "maxOutput": 8192,
          "pricing": {
            "input": 0.00,
            "output": 0.00,
            "unit": "per_million_tokens",
            "free": true,
            "paidInput": 1.25,
            "paidOutput": 5.00
          }
        },
        "gemini-2.0-flash-exp": {
          "id": "gemini-2.0-flash-exp",
          "category": "large",
          "contextWindow": 1000000,
          "maxOutput": 8192,
          "pricing": {
            "input": 0.00,
            "output": 0.00,
            "unit": "per_million_tokens",
            "free": true
          }
        }
      }
    }
  }
}
```

## Implementation Notes

### Data Collection Scripts

Create `scripts/collect-provider-data.js`:
- Fetch live model lists from each provider
- Validate against documented pricing
- Generate PROVIDER_CATALOG.json
- Run weekly to keep data fresh

### Model Categorization Logic

**Small Models** (summarization, quick tasks):
- Context < 50K tokens
- Fast inference
- Low cost (< $0.20/M tokens input)
- Examples: gpt-4o-mini, llama-3.1-8b-instant, gemini-1.5-flash

**Large Models** (general chat, complex tasks):
- Context 50K-2M tokens
- Balanced performance/cost
- Good tool support
- Examples: gpt-4o, llama-4-scout, gemini-1.5-pro

**Reasoning Models** (planning, analysis):
- Optimized for multi-step reasoning
- Higher latency acceptable
- Examples: o1-preview, deepseek-r1, gpt-4o (with system prompts)

### Whisper Model Support

Research which providers support Whisper-compatible transcription:
- **OpenAI**: Native Whisper support
- **Groq**: Whisper support (check availability)

## Code Reading Required

Before implementing, review these files for dependencies:

1. **src/model-selector.js** (lines 1-200)
   - Current model selection logic
   - How model names are mapped
   - Rate limit checking (if any)

2. **src/providers.js** (entire file)
   - Current provider implementations
   - Request format differences
   - Response parsing

3. **ui-new/src/contexts/SettingsContext.tsx**
   - Current settings schema
   - How settings are persisted
   - Migration pattern for changes

4. **src/index.js** (lines 1-175)
   - How provider credentials are accessed
   - Environment variable usage
   - Request routing logic

## Questions to Answer

1. Do we store rate limit state in DynamoDB or use a cache like ElastiCache? store in memory and accept that it is lost when the lamda function hibernates. rate limits are time sensitive so if enough time has gone by for lambda to time out then certainly the rate limit on tokens per minute is no longer relevant
2. Should we implement a `/models` endpoint to expose available models to UI? no
3. How do we handle provider-specific features (e.g., Gemini's huge context)?  use it if needed, store large context figure as part of gemini structed data
4. Should free tier limits be hard-coded or configurable per deployment?  hard coded with update script
5. What's the fallback behavior if ALL providers are rate-limited?  if no available provider can service the request, return an error

## Next Phase Dependencies

Phase 2 (Settings UI) depends on:
- Final PROVIDER_CATALOG.json structure
- Decision on how many providers to show in UI by default
- List of OpenAI-compatible endpoints to auto-suggest

Phase 4 (Provider Integration) depends on:
- API authentication patterns for each provider
- Response format differences
- Error handling requirements
