# Model Rotation Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to implement intelligent model rotation with proactive rate limit management, replacing the current single-model selection approach. The system will automatically select optimal models based on task requirements while managing rate limits across multiple providers (Groq, OpenAI, TogetherAI, and arbitrary generic OpenAI-compatible endpoints).

### Key Updates (Latest Revision)

- **TogetherAI Integration**: Added as a primary research provider with competitive pricing and higher rate limits (60 RPM / 60k TPM)
- **Generic Provider Support**: Support for arbitrary number of custom OpenAI-compatible endpoints with user-configurable models and rate limits
- **Enhanced Whisper Strategy**: Prefer Groq (free, 100MB limit) first, then round-robin distribution across OpenAI, TogetherAI, and generic endpoints
- **Expanded Vision Models**: Added Groq Llama 4 Scout and Maverick vision models (cheaper than OpenAI, up to 1M context for Maverick)
- **Updated Model Pools**: Refreshed with latest models from all providers based on current documentation (October 2025)

## Table of Contents

1. [Overview & Goals](#overview--goals)
2. [Architecture Changes](#architecture-changes)
3. [Implementation Phases](#implementation-phases)
4. [Detailed Task Breakdown](#detailed-task-breakdown)
5. [Testing Strategy](#testing-strategy)
6. [Migration Plan](#migration-plan)
7. [Risk Assessment](#risk-assessment)

---

## Overview & Goals

### Current State Problems

- ❌ Single model selection (Groq/OpenAI choice)
- ❌ No automatic failover on rate limits
- ❌ User waits 30-60s when rate limited
- ❌ Whisper selection tied to LLM provider preference
- ❌ No token budget tracking
- ❌ Rate limits learned reactively from errors
- ❌ No multi-provider load distribution

### Target State Goals

- ✅ Automatic model selection based on task type
- ✅ Intelligent rotation on rate limits (0-2s failover)
- ✅ Proactive rate limit prevention
- ✅ Multi-provider load balancing (Groq, OpenAI, TogetherAI, Generic)
- ✅ Cost optimization (cheapest capable model)
- ✅ Independent Whisper model management with smart provider selection
- ✅ Published rate limit defaults with error override
- ✅ Parallel tool support enforcement
- ✅ Support for arbitrary custom endpoints (user-configurable)
- ✅ Vision model support across multiple providers (Groq Llama 4, OpenAI GPT-4o, TogetherAI Qwen2.5-VL)

---

## Architecture Changes

### 1. Settings Changes

**REMOVED:**
- Model preference dropdown (Groq/OpenAI)
- Specific model selection
- Whisper provider coupling

**ADDED:**
- Multiple API key management:
  - Groq API Key(s) - support multiple keys
  - OpenAI API Key(s) - support multiple keys
  - TogetherAI API Key(s) - support multiple keys for research tasks
  - Generic Provider Endpoints - support arbitrary number of custom OpenAI-compatible endpoints
    - Name/Label for each endpoint
    - API Base URL
    - API Key
    - Model ID
    - Rate limits (optional, will be learned from errors if not provided)
  - Tavily API Key (existing)
- Task type indicators (UI sends, proxy selects model):
  - `fast` - Quick queries, simple tasks
  - `research` - Web search, multi-step reasoning
  - `vision` - Image analysis with Groq Llama 4 Scout/Maverick or OpenAI GPT-4o
  - `code` - Code generation/analysis
- Whisper configuration (independent):
  - Prefer Groq if available (whisper-large-v3, whisper-large-v3-turbo)
  - Distribute round-robin style to other available providers if Groq unavailable
  - Fallback providers: OpenAI, TogetherAI, Generic endpoints
  - Model selection per provider
  - API key (if different from LLM keys)

### 2. Model Pool Configuration

**File:** `src/config/modelPools.js`

```javascript
// Research published rate limits from:
// - Groq: https://console.groq.com/docs/rate-limits
// - OpenAI: https://platform.openai.com/docs/guides/rate-limits

const MODEL_POOLS = {
  fast: [
    {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 30000,        // From Groq docs
      maxRPM: 30,           // From Groq docs
      maxTokensPerRequest: 32768,
      contextWindow: 131072,
      costPerMToken: 0.59,
      priority: 1
    },
    {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 30000,
      maxRPM: 30,
      maxTokensPerRequest: 8192,
      contextWindow: 131072,
      costPerMToken: 0.05,
      priority: 2
    },
    {
      provider: 'groq',
      model: 'mixtral-8x7b-32768',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 30000,
      maxRPM: 30,
      maxTokensPerRequest: 32768,
      contextWindow: 32768,
      costPerMToken: 0.27,
      priority: 3
    },
    {
      provider: 'togetherai',
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 60000,        // TogetherAI default
      maxRPM: 60,
      maxTokensPerRequest: 32768,
      contextWindow: 131072,
      costPerMToken: 0.88,
      priority: 4
    }
  ],
  
  research: [
    {
      provider: 'togetherai',
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 60000,        // TogetherAI has higher limits
      maxRPM: 60,
      maxTokensPerRequest: 32768,
      contextWindow: 131072,
      costPerMToken: 0.88,
      priority: 1
    },
    {
      provider: 'togetherai',
      model: 'deepseek-ai/DeepSeek-V3.1',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 60000,
      maxRPM: 60,
      maxTokensPerRequest: 65536,
      contextWindow: 128000,
      costPerMToken: 0.60,
      priority: 2
    },
    {
      provider: 'openai',
      model: 'gpt-4o',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 30000,        // Tier 1 default
      maxRPM: 500,
      maxTokensPerRequest: 16384,
      contextWindow: 128000,
      costPerMToken: 2.50,
      priority: 3
    },
    {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 30000,
      maxRPM: 30,
      maxTokensPerRequest: 32768,
      contextWindow: 131072,
      costPerMToken: 0.59,
      priority: 4
    },
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 200000,       // Higher tier allowance
      maxRPM: 500,
      maxTokensPerRequest: 16384,
      contextWindow: 128000,
      costPerMToken: 0.15,
      priority: 5
    },
    {
      provider: 'togetherai',
      model: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 60000,
      maxRPM: 60,
      maxTokensPerRequest: 32768,
      contextWindow: 32768,
      costPerMToken: 1.20,
      priority: 6
    }
  ],
  
  code: [
    {
      provider: 'togetherai',
      model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 60000,
      maxRPM: 60,
      maxTokensPerRequest: 32768,
      contextWindow: 32768,
      costPerMToken: 0.80,
      priority: 1
    },
    {
      provider: 'openai',
      model: 'gpt-4o',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 30000,
      maxRPM: 500,
      maxTokensPerRequest: 16384,
      contextWindow: 128000,
      costPerMToken: 2.50,
      priority: 2
    },
    {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      supportsTools: true,
      parallelTools: true,
      maxTPM: 30000,
      maxRPM: 30,
      maxTokensPerRequest: 32768,
      contextWindow: 131072,
      costPerMToken: 0.59,
      priority: 3
    }
  ],
  
  vision: [
    {
      provider: 'groq',
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      supportsTools: true,
      parallelTools: true,
      supportsVision: true,
      maxTPM: 30000,
      maxRPM: 30,
      maxTokensPerRequest: 8192,
      contextWindow: 131072,
      maxImageSize: 20 * 1024 * 1024,      // 20MB per image URL
      maxImagesPerRequest: 5,
      maxResolution: 33177600,             // 33 megapixels
      costPerMToken: 0.18,
      priority: 1
    },
    {
      provider: 'groq',
      model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
      supportsTools: true,
      parallelTools: true,
      supportsVision: true,
      maxTPM: 30000,
      maxRPM: 30,
      maxTokensPerRequest: 8192,
      contextWindow: 1048576,              // 1M context!
      maxImageSize: 20 * 1024 * 1024,
      maxImagesPerRequest: 5,
      maxResolution: 33177600,
      costPerMToken: 0.27,
      priority: 2
    },
    {
      provider: 'togetherai',
      model: 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
      supportsTools: true,
      parallelTools: true,
      supportsVision: true,
      maxTPM: 60000,
      maxRPM: 60,
      maxTokensPerRequest: 32768,
      contextWindow: 327680,
      costPerMToken: 0.18,
      priority: 3
    },
    {
      provider: 'togetherai',
      model: 'Qwen/Qwen2.5-VL-72B-Instruct',
      supportsTools: true,
      parallelTools: true,
      supportsVision: true,
      maxTPM: 60000,
      maxRPM: 60,
      maxTokensPerRequest: 32768,
      contextWindow: 32768,
      costPerMToken: 1.95,
      priority: 4
    },
    {
      provider: 'openai',
      model: 'gpt-4o',
      supportsTools: true,
      parallelTools: true,
      supportsVision: true,
      maxTPM: 30000,
      maxRPM: 500,
      maxTokensPerRequest: 16384,
      contextWindow: 128000,
      costPerMToken: 2.50,
      priority: 5
    },
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      supportsTools: true,
      parallelTools: true,
      supportsVision: true,
      maxTPM: 200000,
      maxRPM: 500,
      maxTokensPerRequest: 16384,
      contextWindow: 128000,
      costPerMToken: 0.15,
      priority: 6
    }
  ]
};

// Whisper models (independent from LLM selection)
// Strategy: Prefer Groq if available, then round-robin to other providers
const WHISPER_MODELS = {
  groq: [
    {
      provider: 'groq',
      model: 'whisper-large-v3',
      maxFileSize: 100 * 1024 * 1024,    // 100MB on Groq
      supportedFormats: ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'],
      costPerMinute: 0.0,                // Free tier
      priority: 1
    },
    {
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      maxFileSize: 100 * 1024 * 1024,
      supportedFormats: ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'],
      costPerMinute: 0.0,
      priority: 2
    }
  ],
  openai: [
    {
      provider: 'openai',
      model: 'whisper-1',
      maxFileSize: 25 * 1024 * 1024,     // 25MB
      supportedFormats: ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'],
      costPerMinute: 0.006,
      priority: 1
    }
  ],
  togetherai: [
    {
      provider: 'togetherai',
      model: 'openai/whisper-large-v3',
      maxFileSize: 25 * 1024 * 1024,
      supportedFormats: ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'],
      costPerMinute: 0.0015,
      priority: 1
    }
  ]
  // Generic endpoints can also provide Whisper if configured
};

// Generic provider template for arbitrary OpenAI-compatible endpoints
const GENERIC_PROVIDER_TEMPLATE = {
  id: 'custom-<uuid>',              // Generated unique ID
  name: 'Custom Provider',          // User-provided label
  baseURL: 'https://api.example.com/v1',
  apiKey: 'sk-...',
  models: [
    {
      modelId: 'custom-model-name',
      taskTypes: ['fast', 'research', 'code', 'vision'],
      supportsTools: true,
      parallelTools: true,
      supportsVision: false,
      maxTPM: null,                 // Learned from errors if not provided
      maxRPM: null,
      maxTokensPerRequest: 4096,
      contextWindow: 4096,
      costPerMToken: 0.0,           // User can optionally specify
      priority: 999                 // Generic endpoints have lowest priority
    }
  ]
};

module.exports = { MODEL_POOLS, WHISPER_MODELS, GENERIC_PROVIDER_TEMPLATE };
```

**Whisper Selection Strategy:**

The system implements a smart Whisper provider selection strategy:

1. **First Choice: Groq** (if available)
   - Free tier with 100MB file limit
   - Fast inference on GroqChip™
   - Models: whisper-large-v3, whisper-large-v3-turbo

2. **Round-Robin Distribution** (if Groq unavailable or rate limited)
   - Maintain a rotating index across available providers
   - Order: OpenAI → TogetherAI → Generic endpoints → back to OpenAI
   - Skip providers that are rate limited or don't have API keys configured

3. **Provider-Specific Handling:**
   - Check file size against provider limits (100MB for Groq, 25MB for others)
   - Track usage per provider to distribute load evenly
   - Fallback immediately if provider returns rate limit error

4. **Example Flow:**
   ```
   Request 1: Groq (success)
   Request 2: Groq (rate limited) → OpenAI (success)
   Request 3: TogetherAI (success, continuing round-robin)
   Request 4: Generic-1 (if configured, success)
   Request 5: Groq (available again, prefer Groq) → Groq (success)
   ```

### 3. Rate Limit Defaults Research

**Sources to Research:**

1. **Groq Rate Limits:**
   - Source: https://console.groq.com/docs/rate-limits
   - Free tier: 30 RPM, 30,000 TPM per model
   - Models: llama-3.3-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b
   - Vision models: llama-4-scout, llama-4-maverick (same limits)
   - Whisper: 100MB file limit, free tier

2. **OpenAI Rate Limits:**
   - Source: https://platform.openai.com/docs/guides/rate-limits
   - Tier 1 (default): 500 RPM, 30,000 TPM for GPT-4o
   - Tier 1: 500 RPM, 200,000 TPM for GPT-4o-mini
   - Tier 2+: Higher limits based on usage history
   - Whisper: 25MB file limit, $0.006/minute

3. **TogetherAI Rate Limits:**
   - Source: https://docs.together.ai/docs/rate-limits
   - Default: 60 RPM, 60,000 TPM for most models
   - Free tier models have reduced limits (6-10 RPM)
   - Vision models: Same as text models
   - Whisper: 25MB file limit, $0.0015/minute

4. **Generic Endpoints:**
   - No default limits known
   - Learn from error messages
   - User can optionally configure limits in settings

5. **Override Mechanism:**
   - Parse error messages: `"Limit 30000, Requested 83690"`
   - Extract: `Limit (\d+).*model ([\w-/]+)`
   - Update model pool config dynamically
   - Persist to DynamoDB or S3 for future sessions
   - Support provider-specific error message patterns

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal:** Set up infrastructure without breaking existing functionality

- Research & document rate limits from provider docs
- Create model pool configuration files
- Add multiple API key support to settings
- Implement token estimation utility
- Create rate limit tracking data structures

### Phase 2: Core Rotation Logic (Week 2)
**Goal:** Implement model selection and rotation

- Implement ModelRotationManager class
- Add model selection algorithm
- Implement usage tracking per model
- Add failure recording and unavailability tracking
- Create pool status monitoring

### Phase 3: Integration (Week 3)
**Goal:** Connect rotation logic to Lambda handler

- Update handler to use ModelRotationManager
- Implement retry with model rotation
- Add streaming status events for model changes
- Update error handling for rate limits
- Add fallback to wait mechanism

### Phase 4: UI & Settings (Week 4)
**Goal:** Update user interface and configuration

- Remove model preference dropdown
- Add multi-key API management UI
- Add task type indicators to chat interface
- Update Whisper settings (independent)
- Add pool status dashboard

### Phase 5: Testing & Optimization (Week 5)
**Goal:** Comprehensive testing and performance tuning

- Unit tests for all new components
- Integration tests for rotation scenarios
- Load testing with artificial rate limits
- Cost analysis and optimization
- Documentation and deployment

---

## Detailed Task Breakdown

### TODO 1: Research Rate Limits from Provider Documentation

**Priority:** HIGH (Blocking)
**Estimated Time:** 4 hours
**Dependencies:** None

**Sub-tasks:**

- [ ] **TODO 1.1:** Research Groq rate limits
  - Access https://console.groq.com/docs/rate-limits
  - Document TPM, RPM limits for each model
  - Document context window sizes
  - Document pricing per million tokens
  - Include vision models (Llama 4 Scout, Llama 4 Maverick)
  - Note Whisper file size limits (100MB)
  - **Output:** `docs/GROQ_RATE_LIMITS.md`

- [ ] **TODO 1.2:** Research OpenAI rate limits
  - Access https://platform.openai.com/docs/guides/rate-limits
  - Document Tier 1, 2, 3, 4, 5 limits
  - Document limits for GPT-4o, GPT-4o-mini, GPT-4-turbo
  - Document context windows and pricing
  - Note vision model capabilities
  - **Output:** `docs/OPENAI_RATE_LIMITS.md`

- [ ] **TODO 1.3:** Research TogetherAI rate limits
  - Access https://docs.together.ai/docs/rate-limits
  - Document default 60 RPM / 60,000 TPM limits
  - Document model-specific limits (free tier models)
  - Document vision model capabilities (Llama 4, Qwen2.5-VL)
  - Document Whisper pricing and limits
  - **Output:** `docs/TOGETHERAI_RATE_LIMITS.md`

- [ ] **TODO 1.4:** Research Whisper model capabilities
  - Document OpenAI Whisper limits and pricing (25MB, $0.006/min)
  - Document Groq Whisper models and limits (100MB, free)
  - Document TogetherAI Whisper pricing ($0.0015/min)
  - Compare accuracy, speed, cost trade-offs
  - **Output:** `docs/WHISPER_MODELS.md`

- [ ] **TODO 1.5:** Create consolidated rate limit configuration
  - Combine research into `src/config/rateLimits.js`
  - Add comments with source URLs
  - Include date of research for future updates
  - **Output:** `src/config/rateLimits.js`

**Validation:**
- All rate limits must have source documentation links
- All models must include: TPM, RPM, context window, cost
- Configuration must be JSON-serializable for DynamoDB storage

---

### TODO 2: Create Model Pool Configuration System

**Priority:** HIGH (Blocking)
**Estimated Time:** 6 hours
**Dependencies:** TODO 1 (rate limits research)

**Sub-tasks:**

- [ ] **TODO 2.1:** Create model pool configuration file
  - File: `src/config/modelPools.js`
  - Define pools: `fast`, `research`, `code`, `vision`
  - Include Groq, OpenAI, and TogetherAI providers
  - Each model includes all metadata from research
  - Add `supportsTools` and `parallelTools` flags
  - Add vision-specific fields (maxImageSize, maxImagesPerRequest, maxResolution)
  - Filter to only include models with `parallelTools: true`
  - **Output:** `src/config/modelPools.js`

- [ ] **TODO 2.2:** Create Whisper configuration (independent)
  - File: `src/config/whisperModels.js`
  - Separate from LLM model selection
  - Include Groq, OpenAI, and TogetherAI options
  - Add provider-specific capabilities
  - Implement preference order: Groq → round-robin others
  - **Output:** `src/config/whisperModels.js`

- [ ] **TODO 2.3:** Create generic provider configuration
  - File: `src/config/genericProviders.js`
  - Define template for custom OpenAI-compatible endpoints
  - Support arbitrary number of generic providers
  - Each provider has: name, baseURL, apiKey, models array
  - Models include task types, capabilities, optional rate limits
  - **Output:** `src/config/genericProviders.js`

- [ ] **TODO 2.5:** Add configuration validation
  - Validate all required fields present
  - Validate numeric limits are positive
  - Validate model names match provider APIs
  - Check for duplicate models in pools
  - Validate generic provider URLs are valid
  - **Output:** `src/config/validateConfig.js`

- [ ] **TODO 2.6:** Create configuration loader
  - Load config on Lambda cold start
  - Support environment variable overrides
  - Allow runtime config updates (DynamoDB)
  - Cache parsed configuration
  - **Output:** `src/config/configLoader.js`

**Tests:**
- [ ] Unit test: Validate configuration structure
- [ ] Unit test: Detect invalid model definitions
- [ ] Unit test: Environment variable override works
- [ ] Unit test: Configuration caching functions correctly

**Validation:**
- All models in pools must support parallel tools
- Configuration must load in <100ms on cold start
- Invalid configuration must throw descriptive errors

---

### TODO 3: Implement Token Estimation Utility

**Priority:** HIGH (Blocking)
**Estimated Time:** 4 hours
**Dependencies:** None

**Sub-tasks:**

- [ ] **TODO 3.1:** Create token estimation function
  - File: `src/utils/tokenEstimation.js`
  - Implement character-based estimation (1 token ≈ 4 chars)
  - Handle different content types (text, JSON, code)
  - Account for message structure overhead
  - Include tool definitions in calculation
  - **Output:** `src/utils/tokenEstimation.js`

- [ ] **TODO 3.2:** Add message history estimation
  - Iterate through all messages
  - Sum tokens for user, assistant, system messages
  - Include tool call results
  - Add safety margin (10-20%)
  - **Output:** `estimateMessageTokens()` function

- [ ] **TODO 3.3:** Add tool definition estimation
  - Calculate tokens for tool schemas
  - Include all parameter descriptions
  - Account for JSON structure overhead
  - **Output:** `estimateToolTokens()` function

- [ ] **TODO 3.4:** Add response buffer estimation
  - Estimate expected response length
  - Adjust based on task type (fast=1k, research=3k, code=2k)
  - Add safety margin for tool calls
  - **Output:** `estimateResponseTokens()` function

**Tests:**
- [ ] Unit test: Estimate simple text message
- [ ] Unit test: Estimate message with tool calls
- [ ] Unit test: Estimate complex conversation history
- [ ] Unit test: Compare estimate vs actual (within 20%)
- [ ] Integration test: Estimates prevent rate limit errors

**Validation:**
- Estimates must be within ±20% of actual token usage
- Must complete in <10ms for typical requests
- Must handle edge cases (empty messages, very long content)

---

### TODO 4: Implement Model Rotation Manager

**Priority:** HIGH (Core Feature)
**Estimated Time:** 12 hours
**Dependencies:** TODO 2 (model pools), TODO 3 (token estimation)

**Sub-tasks:**

- [ ] **TODO 4.1:** Create ModelRotationManager class
  - File: `src/utils/modelRotation.js`
  - Initialize with model pools configuration
  - Track usage per model (tokens, requests, failures)
  - Track unavailability windows per model
  - Implement singleton pattern
  - **Output:** `src/utils/modelRotation.js`

- [ ] **TODO 4.2:** Implement `selectModel()` method
  - Input: estimatedTokens, poolName, excludeModel
  - Filter available models (not unavailable, has capacity)
  - Sort by priority, then by cost
  - Return selected model configuration
  - Throw error if no models available
  - **Output:** `selectModel()` method

- [ ] **TODO 4.3:** Implement usage tracking
  - Track tokens consumed per model in last 60 seconds
  - Track requests made per model in last 60 seconds
  - Prune old tracking data (>60s old)
  - Check against TPM and RPM limits
  - **Output:** `recordSuccess()`, `getModelUsage()` methods

- [ ] **TODO 4.4:** Implement failure tracking
  - Record rate limit failures per model
  - Parse error messages to extract wait time
  - Mark model unavailable for calculated duration
  - Implement exponential backoff for repeated failures
  - Clear failure tracking on success
  - **Output:** `recordFailure()`, `isModelAvailable()` methods

- [ ] **TODO 4.5:** Implement dynamic limit updates
  - Parse rate limit error messages
  - Extract TPM/RPM limits from errors: `"Limit 30000"`
  - Update model pool configuration in memory
  - Persist updated limits to DynamoDB/S3
  - Log all limit updates for monitoring
  - **Output:** `updateModelLimits()` method

- [ ] **TODO 4.6:** Add pool status monitoring
  - Get current usage for all models in pool
  - Calculate utilization percentages
  - List unavailable models with return times
  - Provide JSON output for UI dashboard
  - **Output:** `getPoolStatus()` method

**Tests:**
- [ ] Unit test: Select model from pool with capacity
- [ ] Unit test: Skip models at TPM limit
- [ ] Unit test: Skip models at RPM limit
- [ ] Unit test: Skip temporarily unavailable models
- [ ] Unit test: Record and track usage correctly
- [ ] Unit test: Parse rate limit errors correctly
- [ ] Unit test: Update limits dynamically from errors
- [ ] Unit test: Exponential backoff on repeated failures
- [ ] Unit test: Clear unavailability after timeout
- [ ] Integration test: Full rotation cycle under load

**Validation:**
- Must select cheapest available model when multiple options
- Must never exceed TPM/RPM limits (within safety margin)
- Must update limits from first error occurrence
- Unavailable models must become available after timeout

---

### TODO 5: Implement Multi-API Key Management

**Priority:** HIGH (Blocking for rotation)
**Estimated Time:** 8 hours
**Dependencies:** TODO 2 (model pools)

**Sub-tasks:**

- [ ] **TODO 5.1:** Update environment variable structure
  - Support multiple keys per provider:
    - `GROQ_API_KEY_1`, `GROQ_API_KEY_2`, etc.
    - `OPENAI_API_KEY_1`, `OPENAI_API_KEY_2`, etc.
  - Maintain backward compatibility with single keys
  - **Output:** Updated `.env.example`, `src/config/apiKeys.js`

- [ ] **TODO 5.2:** Create API key rotation logic
  - Load all keys for each provider
  - Track usage per key (separate from model tracking)
  - Rotate keys on 429 errors specific to key
  - Implement key-level rate limiting
  - **Output:** `src/utils/apiKeyRotation.js`

- [ ] **TODO 5.3:** Update provider clients
  - Groq client: Accept key parameter in constructor
  - OpenAI client: Accept key parameter in constructor
  - Use rotated key from manager
  - Handle key-specific auth errors
  - **Output:** Updated `src/providers/groq.js`, `src/providers/openai.js`

- [ ] **TODO 5.4:** Add key validation
  - Validate keys on Lambda startup
  - Test each key with lightweight API call
  - Mark invalid keys as unavailable
  - Log key validation results (redact keys)
  - **Output:** `src/utils/validateApiKeys.js`

**Tests:**
- [ ] Unit test: Load multiple keys from environment
- [ ] Unit test: Rotate to next key on failure
- [ ] Unit test: Skip invalid keys
- [ ] Unit test: Backward compatibility with single key
- [ ] Integration test: Use multiple keys under load

**Validation:**
- Must support unlimited keys per provider
- Must validate all keys on startup
- Must rotate keys independently of model rotation
- Must maintain backward compatibility

---

### TODO 6: Update Lambda Handler for Model Rotation

**Priority:** HIGH (Core Integration)
**Estimated Time:** 10 hours
**Dependencies:** TODO 4 (rotation manager), TODO 5 (multi-key)

**Sub-tasks:**

- [ ] **TODO 6.1:** Add task type parameter to handler
  - Accept `taskType` in request body: `fast`, `research`, `code`, `vision`
  - Default to `fast` if not specified
  - Validate task type against known pools
  - **Output:** Updated `src/index.js` handler signature

- [ ] **TODO 6.2:** Integrate ModelRotationManager
  - Import and initialize manager
  - Estimate tokens for incoming request
  - Call `selectModel()` with task type and estimate
  - Use selected model for LLM call
  - **Output:** Updated handler logic in `src/index.js`

- [ ] **TODO 6.3:** Implement rotation retry loop
  - Try up to 3 different models on rate limit
  - Record success/failure after each attempt
  - Stream status events to user on rotation
  - Implement final fallback to wait mechanism
  - **Output:** `handleLLMRequestWithRotation()` function

- [ ] **TODO 6.4:** Add streaming status events
  - Event: `model_selected` - which model chosen
  - Event: `model_rotation` - switched due to rate limit
  - Event: `no_models_available` - all busy, waiting
  - Event: `rate_limit_recovered` - successfully rotated
  - Include pool status in events
  - **Output:** New SSE event types

- [ ] **TODO 6.5:** Update error handling
  - Distinguish rate limit vs other errors
  - Extract wait time from error messages
  - Update model limits from errors
  - Provide detailed error context to UI
  - **Output:** Enhanced error handling logic

- [ ] **TODO 6.6:** Remove old model selection logic
  - Remove `llm_provider` parameter handling
  - Remove model preference logic
  - Clean up deprecated code paths
  - Update documentation
  - **Output:** Cleaned up handler code

**Tests:**
- [ ] Integration test: Successful model selection
- [ ] Integration test: Rotation on rate limit
- [ ] Integration test: Multiple rotations in sequence
- [ ] Integration test: Fallback to wait when all busy
- [ ] Integration test: Status events streamed correctly
- [ ] Integration test: Error messages parsed correctly
- [ ] Integration test: Old API parameters rejected gracefully

**Validation:**
- Must attempt up to 3 different models before waiting
- Must stream status updates on each rotation
- Must complete rotation in <2 seconds
- Must not make unnecessary API calls

---

### TODO 7: Update Whisper Tool (Independent from LLM)

**Priority:** MEDIUM (Isolated Change)
**Estimated Time:** 4 hours
**Dependencies:** TODO 2.2 (Whisper config)

**Sub-tasks:**

- [ ] **TODO 7.1:** Decouple Whisper from LLM provider
  - Remove dependency on `llm_provider` parameter
  - Implement Whisper selection strategy:
    1. Prefer Groq if API key available (free, 100MB limit)
    2. If Groq unavailable/rate limited, round-robin to others
    3. Round-robin order: OpenAI → TogetherAI → Generic endpoints
  - Track round-robin index per session
  - **Output:** Updated `src/tools/transcribe_audio.js`

- [ ] **TODO 7.2:** Update Whisper model selection
  - Load Whisper configuration from `src/config/whisperModels.js`
  - Check Groq availability first (preferred)
  - Implement round-robin provider rotation
  - Skip providers without API keys or that are rate limited
  - Support model-specific parameters (language, etc.)
  - **Output:** Updated tool implementation

- [ ] **TODO 7.3:** Update Whisper API clients
  - Ensure OpenAI client supports Whisper API
  - Ensure Groq client supports Whisper API
  - Add TogetherAI Whisper client
  - Support generic endpoint Whisper calls
  - Handle provider-specific differences
  - Add error handling for unsupported formats
  - Respect provider file size limits
  - **Output:** Updated provider clients

- [ ] **TODO 7.4:** Add Whisper provider status tracking
  - Track usage per provider (count, bytes transcribed)
  - Detect and record rate limit errors
  - Reset to prefer Groq after cooldown period
  - Log provider selection decisions
  - **Output:** Whisper provider tracking logic

**Tests:**
- [ ] Unit test: Select OpenAI Whisper model
- [ ] Unit test: Select Groq Whisper model
- [ ] Integration test: Transcribe with OpenAI
- [ ] Integration test: Transcribe with Groq
- [ ] Integration test: Handle unsupported format error

**Validation:**
- Must work with both providers
- Must not affect LLM model selection
- Must respect user's Whisper preference
- Must maintain existing transcription quality

---

### TODO 8: Update Settings UI for Multi-Key and Task Types

**Priority:** HIGH (User-Facing)
**Estimated Time:** 10 hours
**Dependencies:** TODO 5 (multi-key), TODO 6 (task types)

**Sub-tasks:**

- [ ] **TODO 8.1:** Remove model preference UI
  - Delete LLM provider dropdown (Groq/OpenAI)
  - Delete specific model selection
  - Update settings component
  - **Output:** Updated `ui-new/src/components/SettingsDialog.tsx`

- [ ] **TODO 8.2:** Add multi-key management UI
  - Section: "Groq API Keys"
    - List of keys (masked, show last 4 chars)
    - Add new key button
    - Remove key button
    - Validate key button (test with API)
  - Section: "OpenAI API Keys"
    - Same interface as Groq
  - Section: "TogetherAI API Keys"
    - Same interface as Groq/OpenAI
  - Section: "Generic Provider Endpoints"
    - List of configured providers
    - Add new provider form:
      - Name/Label (text input)
      - Base URL (text input, validate URL format)
      - API Key (password input)
      - Model ID (text input)
      - Optional: Task types checkboxes (fast, research, code, vision)
      - Optional: Rate limits (TPM, RPM inputs)
    - Edit provider button
    - Remove provider button
    - Test connection button
  - Store keys securely in user's localStorage
  - **Output:** New `ApiKeyManager` component

- [ ] **TODO 8.3:** Add Whisper settings UI
  - Section: "Audio Transcription"
    - Info text: "Groq preferred (free, 100MB limit), then round-robin to others"
    - Checkbox: "Enable Groq Whisper" (checked by default if key present)
    - Checkbox: "Enable OpenAI Whisper" (if key present)
    - Checkbox: "Enable TogetherAI Whisper" (if key present)
    - Show which provider will be used for next transcription
    - Uses same API keys as entered above
  - **Output:** Updated settings component

- [ ] **TODO 8.4:** Add task type indicators to chat
  - Auto-detect task type from query:
    - Contains "search", "research", "find" → `research`
    - Contains "code", "function", "script" → `code`
    - Contains "image", "picture", "photo" → `vision`
    - Default → `fast`
  - Allow manual override with dropdown
  - Send `taskType` parameter with chat request
  - **Output:** Updated `ChatTab` component

- [ ] **TODO 8.5:** Add pool status dashboard
  - Show current model pool being used
  - List models in pool with status:
    - Available (green)
    - Unavailable - returns in Xs (yellow)
    - At capacity (orange)
    - Failed (red)
  - Show TPM/RPM utilization bars
  - Auto-refresh every 5 seconds
  - **Output:** New `PoolStatusDashboard` component

**Tests:**
- [ ] UI test: Add/remove API keys
- [ ] UI test: Validate API key
- [ ] UI test: Select Whisper provider/model
- [ ] UI test: Task type auto-detection
- [ ] UI test: Manual task type override
- [ ] UI test: Pool status updates correctly

**Validation:**
- API keys must be masked in UI (show last 4 chars only)
- Keys must be validated before saving
- Task type must be sent with every chat request
- Pool status must update in real-time

---

### TODO 9: Create Comprehensive Test Suite

**Priority:** HIGH (Quality Assurance)
**Estimated Time:** 16 hours
**Dependencies:** TODO 4, TODO 5, TODO 6 (core implementation)

**Sub-tasks:**

- [ ] **TODO 9.1:** Unit tests for ModelRotationManager
  - File: `tests/unit/modelRotation.test.js`
  - Test model selection with various constraints
  - Test usage tracking and expiration
  - Test failure recording and recovery
  - Test limit updates from error messages
  - Mock all external dependencies
  - **Output:** 20+ test cases

- [ ] **TODO 9.2:** Unit tests for token estimation
  - File: `tests/unit/tokenEstimation.test.js`
  - Test estimation accuracy on various inputs
  - Test edge cases (empty, very large)
  - Compare estimates with actual usage
  - **Output:** 10+ test cases

- [ ] **TODO 9.3:** Unit tests for API key rotation
  - File: `tests/unit/apiKeyRotation.test.js`
  - Test loading multiple keys for Groq, OpenAI, TogetherAI
  - Test generic provider configuration loading
  - Test key validation
  - Test rotation on failure
  - Test backward compatibility
  - **Output:** 10+ test cases

- [ ] **TODO 9.4:** Integration tests for model rotation
  - File: `tests/integration/modelRotation.test.js`
  - Test successful model selection
  - Test rotation on simulated rate limit
  - Test multiple consecutive rotations
  - Test fallback to wait mechanism
  - Mock LLM providers to simulate errors
  - **Output:** 15+ test cases

- [ ] **TODO 9.5:** Integration tests for end-to-end scenarios
  - File: `tests/integration/endToEnd.test.js`
  - Test complete request flow with rotation
  - Test streaming events during rotation
  - Test continuation after rate limit
  - Test multi-provider failover
  - **Output:** 10+ test cases

- [ ] **TODO 9.6:** Load tests for rate limit handling
  - File: `tests/load/rateLimitLoad.test.js`
  - Simulate high request volume
  - Verify TPM/RPM limits respected
  - Measure rotation overhead (<2s target)
  - Test multiple concurrent requests
  - **Output:** Load test suite with metrics

- [ ] **TODO 9.7:** Update existing tests
  - Remove tests for deprecated model selection
  - Update tests to use task types
  - Update mocks to include model pools
  - Ensure backward compatibility tests pass
  - **Output:** Updated test suite (100% passing)

**Validation:**
- All tests must pass before deployment
- Code coverage must be >80% for new code
- Load tests must show <5% request failures under 2x normal load
- Rotation must complete in <2 seconds (95th percentile)

---

### TODO 10: Documentation and Deployment

**Priority:** MEDIUM (Final Polish)
**Estimated Time:** 8 hours
**Dependencies:** TODO 9 (all tests passing)

**Sub-tasks:**

- [ ] **TODO 10.1:** Update API documentation
  - Document new `taskType` parameter
  - Document removed `llm_provider` parameter
  - Document new streaming events
  - Document multi-key setup instructions
  - **Output:** Updated `docs/API.md`

- [ ] **TODO 10.2:** Create user migration guide
  - Explain changes to settings
  - Provide migration steps for existing users
  - Explain new task type behavior
  - List breaking changes
  - **Output:** `docs/MIGRATION_GUIDE.md`

- [ ] **TODO 10.3:** Create admin monitoring guide
  - How to monitor pool status
  - How to interpret rate limit errors
  - How to add new models to pools
  - How to update rate limits
  - **Output:** `docs/MONITORING.md`

- [ ] **TODO 10.4:** Update deployment scripts
  - Test fast deployment with new code
  - Verify Lambda layer compatibility
  - Test rollback procedure
  - Document deployment process
  - **Output:** Updated deployment scripts and docs

- [ ] **TODO 10.5:** Create cost analysis dashboard
  - Track cost per model
  - Compare actual vs estimated costs
  - Identify optimization opportunities
  - Generate monthly reports
  - **Output:** Cost tracking tools

- [ ] **TODO 10.6:** Deploy to production
  - Deploy Lambda function with `make fast`
  - Deploy UI with `make deploy-docs`
  - Monitor for errors in CloudWatch
  - Verify rotation works in production
  - Roll back if issues found
  - **Output:** Production deployment

**Validation:**
- All documentation must be reviewed
- Deployment must succeed with zero downtime
- Must have rollback plan ready
- Must monitor for 24 hours post-deployment

---

## Testing Strategy

### Test Pyramid

```
              /\
             /E2E\        5 tests  - Full user scenarios
            /------\
           /  INT   \     25 tests - Component integration
          /----------\
         /   UNIT     \   60 tests - Individual functions
        /--------------\
```

### Test Categories

1. **Unit Tests** (60 tests, ~2 hours to run)
   - ModelRotationManager logic
   - Token estimation accuracy
   - API key rotation
   - Configuration validation
   - Error parsing

2. **Integration Tests** (25 tests, ~30 minutes to run)
   - Handler with rotation
   - Multi-provider failover
   - Streaming events
   - Continuation scenarios
   - Whisper independence

3. **End-to-End Tests** (5 tests, ~10 minutes to run)
   - Full request lifecycle
   - Rate limit recovery
   - Multi-model conversation
   - Cost tracking
   - UI interaction

4. **Load Tests** (continuous, run before deployment)
   - 100 requests/minute
   - Measure rotation overhead
   - Verify rate limit adherence
   - Test key rotation under load

### Test Data

**Fixtures:**
- Mock rate limit errors from Groq and OpenAI
- Sample conversation with various token sizes
- Model pool configurations (valid and invalid)
- API responses with different usage patterns

**Test Environment:**
- Separate AWS account for testing
- Mock LLM providers (no real API calls in tests)
- Isolated DynamoDB tables
- Test-specific API keys (if needed for integration tests)

---

## Migration Plan

### Phase 1: Backward Compatible Deployment (Week 1)

**Goal:** Deploy new system without breaking existing users

1. Deploy code with both old and new logic
2. Old parameter `llm_provider` still works (deprecated)
3. New parameter `taskType` available but optional
4. Monitor for errors in CloudWatch
5. **Rollback trigger:** >5% error rate increase

### Phase 2: Feature Flag Rollout (Week 2)

**Goal:** Gradually enable rotation for users

1. Add feature flag: `ENABLE_MODEL_ROTATION=false`
2. Enable for internal testing
3. Enable for beta users (10%)
4. Monitor performance and errors
5. Gradually increase to 50%, then 100%
6. **Rollback trigger:** User complaints or high error rate

### Phase 3: Deprecation (Week 3)

**Goal:** Remove old code paths

1. Log warnings for deprecated parameters
2. Send email notifications to users
3. Update UI to hide old settings
4. Remove deprecated code after 2 weeks
5. **Rollback trigger:** Critical functionality broken

### Phase 4: Optimization (Week 4)

**Goal:** Tune performance and costs

1. Analyze rotation patterns
2. Adjust model priorities based on usage
3. Optimize token estimation accuracy
4. Fine-tune rate limit thresholds
5. Document best practices

---

## Risk Assessment

### High-Risk Items

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Rate limits worse than published | High | Medium | Start with conservative estimates, update from errors |
| Model rotation latency >2s | High | Medium | Implement caching, pre-warm connections, use faster models |
| Token estimation inaccurate (>30% error) | High | Low | Validate against actual usage, adjust algorithm |
| Multiple keys not available | Medium | Low | Maintain single-key fallback, document requirement |
| Cost increase from inefficient rotation | High | Medium | Track costs per model, optimize selection algorithm |
| Breaking changes affect existing users | High | Low | Maintain backward compatibility, gradual rollout |

### Medium-Risk Items

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Whisper selection conflicts with LLM | Medium | Low | Complete decoupling, separate settings |
| Pool configuration too complex | Medium | Medium | Provide sensible defaults, hide advanced options |
| Monitoring gaps | Medium | Medium | Comprehensive CloudWatch dashboards |
| Documentation outdated | Low | High | Update docs as part of development, not after |

### Low-Risk Items

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| UI/UX confusion | Low | Medium | User testing, clear explanations |
| Test coverage gaps | Low | Low | Code reviews, coverage reports |
| Deployment issues | Low | Low | Tested deployment scripts, rollback plan |

---

## Success Criteria

### Performance Metrics

- ✅ **Rotation latency:** <2s (95th percentile)
- ✅ **Rate limit errors:** <1% of requests
- ✅ **User wait time:** <5s average (vs 30-60s current)
- ✅ **Token estimation accuracy:** ±20% of actual
- ✅ **Model selection accuracy:** 95% choose optimal model

### Business Metrics

- ✅ **Cost reduction:** 20-40% (using cheaper models when appropriate)
- ✅ **Throughput increase:** 2-3x (distributed load)
- ✅ **User satisfaction:** >90% (survey)
- ✅ **Error rate:** <2% (vs 5% current)

### Technical Metrics

- ✅ **Code coverage:** >80% for new code
- ✅ **Test pass rate:** 100%
- ✅ **Deployment time:** <30s (using fast deployment)
- ✅ **Rollback time:** <5 minutes

---

## Appendix

### A. Rate Limit Error Message Examples

**Groq:**
```
Request too large for model meta-llama/llama-4-scout-17b-16e-instruct 
in organization org_01k5qexgg6etpvv9p9zhkenj4z service tier on_demand 
on tokens per minute (TPM): Limit 30000, Requested 83690, 
please reduce your message size and try again.
```

**OpenAI:**
```
Rate limit reached for gpt-4o in organization org-XYZ123 
on tokens per minute (TPM): Limit 30000, Requested 45000. 
Please try again in 20s.
```

### B. Model Capability Matrix

| Model | Provider | Parallel Tools | Vision | Context | TPM | Cost |
|-------|----------|---------------|---------|---------|-----|------|
| llama-3.3-70b | Groq | ✅ | ❌ | 128k | 30k | $0.59 |
| llama-3.1-70b | Groq | ✅ | ❌ | 128k | 30k | $0.59 |
| mixtral-8x7b | Groq | ✅ | ❌ | 32k | 30k | $0.27 |
| gpt-4o | OpenAI | ✅ | ✅ | 128k | 30k | $2.50 |
| gpt-4o-mini | OpenAI | ✅ | ✅ | 128k | 200k | $0.15 |

### C. Glossary

- **TPM:** Tokens Per Minute - rate limit on token throughput
- **RPM:** Requests Per Minute - rate limit on request count
- **Task Type:** User intent category (fast, research, code, vision)
- **Pool:** Group of models suitable for a task type
- **Rotation:** Switching to alternative model on rate limit
- **Unavailability Window:** Time period a model is temporarily disabled
- **Token Estimation:** Predicting request size before API call

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1: Foundation | Week 1 | Rate limit research, config files, multi-key support |
| Phase 2: Core Logic | Week 2 | ModelRotationManager, selection algorithm |
| Phase 3: Integration | Week 3 | Handler updates, retry logic, error handling |
| Phase 4: UI & Settings | Week 4 | Multi-key UI, task types, pool dashboard |
| Phase 5: Testing | Week 5 | Comprehensive test suite, load tests, validation |
| Migration | Weeks 6-7 | Gradual rollout, monitoring, optimization |

**Total Estimated Time:** 7 weeks (1 developer full-time)

---

*Document Version: 1.0*  
*Last Updated: 2025-10-08*  
*Author: AI Assistant*  
*Status: DRAFT - Awaiting Review*