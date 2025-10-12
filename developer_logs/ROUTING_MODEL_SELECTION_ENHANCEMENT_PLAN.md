# Routing/Model Selection & Rate Limiting Enhancement Plan

**Created:** October 12, 2025  
**Status:** Planning Phase  
**Priority:** High

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current System Analysis](#current-system-analysis)
3. [Implementation Plan](#implementation-plan)
4. [Technical Details](#technical-details)
5. [Testing Strategy](#testing-strategy)
6. [Success Criteria](#success-criteria)

---

## Executive Summary

This document outlines a comprehensive plan to enhance the routing, model selection, and rate limiting systems. The existing architecture has sophisticated model selection modules that are **currently underutilized**. The primary goal is to integrate these modules into the main chat endpoint and add user-facing optimization preferences (cheap/balanced/powerful).

### Key Objectives

1. **Integrate existing model-selection modules** into chat.js
2. **Add UI optimization preferences** (cheap/balanced/powerful)
3. **Implement proactive rate limiting** to prevent 429 errors
4. **Optimize content input/output** based on available model capacity
5. **Add response time tracking** for speed optimization
6. **Update pricing and catalog data** to ensure accuracy

---

## Current System Analysis

### What Exists and Works Well ✅

#### 1. **Sophisticated Model Selection Framework** (`src/model-selection/`)

**`selector.js`** - Main orchestrator with 4 strategies:
- `COST_OPTIMIZED`: Cheapest models first
- `QUALITY_OPTIMIZED`: Best models first  
- `BALANCED`: Free tier first, then by cost
- `FREE_TIER`: Free providers only

**`request-analyzer.js`** - Analyzes messages to determine request type:
- `SIMPLE`: Basic Q&A, greetings (< 50 chars)
- `COMPLEX`: Multi-step reasoning, detailed explanations
- `REASONING`: Math, code, logic problems
- `CREATIVE`: Writing, brainstorming
- `TOOL_HEAVY`: Multiple tool calls expected

**`categorizer.js`** - Models categorized as:
- `SMALL`: 7B-32B params (llama-3.1-8b, gpt-4o-mini, gemini-flash)
- `LARGE`: 70B+ params (llama-3.3-70b, gpt-4o, gemini-pro)
- `REASONING`: Specialized (o1, deepseek-r1, qwq)

**`rate-limit-tracker.js`** - Comprehensive tracking:
- Initializes from PROVIDER_CATALOG.json
- Updates from HTTP response headers
- Handles 429 errors with retry-after
- Maintains availability scores per model
- Supports rolling windows and health tracking

**`token-calculator.js`** - Token estimation:
- Estimates input tokens from messages and tools
- Estimates output tokens based on request type
- Considers model-specific tokenization differences

#### 2. **Provider Catalog** (`PROVIDER_CATALOG.json`)

Contains detailed metadata for all models:
- ✅ Pricing (input/output per million tokens)
- ✅ Context windows (up to 2M for Gemini)
- ✅ Rate limits (RPM, TPM, RPD)
- ✅ Capabilities (tools, vision, streaming)
- ✅ Deprecation status
- ⚠️ Last updated: 2025-10-09 (needs verification)
- ⚠️ Format inconsistencies (some providers use arrays vs objects)

**Supported Providers:**
- `groq-free`: Free tier with 30k TPM, 7k RPM
- `groq`: Paid tier with higher limits
- `openai`: GPT-4o, GPT-4o-mini, o1-preview, o1-mini
- `gemini-free`: Free tier with 1M-2M context
- `gemini`: Paid tier
- `together`: Together AI (paid)
- `atlascloud`: Atlas Cloud (paid)

#### 3. **Provider Pool Management** (`src/credential-pool.js`)

- ✅ Builds provider pool from user and environment credentials
- ✅ Prioritizes free-tier providers
- ✅ Supports round-robin load balancing
- ✅ Handles multiple instances of same provider type

#### 4. **Reactive Rate Limit Handling** (chat.js)

Current error handling:
```
Request → 429 Error → Try different model on same provider → 
Try different provider → All exhausted → Return error
```

Works well for recovery but doesn't prevent issues.

### Critical Gaps ❌

#### 1. **Disconnected Systems**
**Problem:** `chat.js` doesn't use the sophisticated model-selection modules!

Current approach in chat.js (lines 950-1000):
```javascript
// Simple heuristic - NOT using request-analyzer.js
const isComplex = totalLength > 1000 || messages.length > 5 || hasTools;
model = selectModelForProvider(provider, model, isComplex);
```

**Impact:** 
- No request type detection (reasoning, creative, tool-heavy)
- No model categorization (small/large/reasoning)
- No token budget consideration
- No cost optimization strategies

#### 2. **Reactive Rate Limiting Only**
**Problem:** System only reacts to 429 errors, doesn't predict them.

**Current flow:**
```
Make request → Get 429 → Switch provider → Retry
```

**Desired flow:**
```
Check rate limits → Avoid exhausted models → Make request → Update limits
```

**Impact:**
- Unnecessary failed requests
- Delayed responses due to retries
- Poor user experience during high load

#### 3. **No User Optimization Preferences**
**Problem:** Users can't choose cost vs. quality vs. speed tradeoffs.

**Missing:**
- UI setting for cheap/balanced/powerful
- Optimization strategy passed to backend
- Model selection adjusted based on preference

**Impact:**
- Users on free tier waste large models on simple requests
- Cost-conscious users forced to use expensive models
- No way to optimize for specific use cases

#### 4. **Static Content Sizing**
**Problem:** Fixed max_tokens and search results regardless of model capacity.

**Current:**
```javascript
// Fixed values in chat.js
max_tokens = 8192;  // Same for all models
searchResults = 5;   // Always 5 results
```

**Impact:**
- Wastes tokens on models with large context
- May exceed capacity on limited models
- Inefficient use of rate limit budgets

#### 5. **No Performance Tracking**
**Problem:** Can't optimize for speed, no latency data.

**Missing:**
- Response time capture (time to first token, total time)
- Per-model/provider latency tracking
- Historical performance data
- Speed-optimized model selection

#### 6. **Potentially Stale Pricing**
**Problem:** Catalog last updated 2025-10-09 (3 days ago).

**Risk:**
- Pricing changes not reflected
- New models not included
- Deprecated models still shown
- Rate limits may have changed

---

## Implementation Plan

### Phase 1: Foundation & Data Validation (Priority: Critical)

#### Step 1: Audit and Update Provider Catalog
**File:** `PROVIDER_CATALOG.json`  
**Effort:** 2-3 hours

**Tasks:**
1. Verify current pricing for all providers:
   - OpenAI: GPT-4o ($2.50/$10), GPT-4o-mini ($0.15/$0.60), o1 ($15/$60)
   - Gemini: 2.5-flash, 2.5-pro, 2.0-flash pricing
   - Groq: Check if pricing has changed
   - Together AI: Verify Llama pricing
   - Atlas Cloud: Verify DeepSeek pricing

2. Update rate limits from official documentation:
   - Check for tier changes
   - Verify RPM/TPM/RPD limits
   - Update context window sizes

3. Add any new models released in past 3 days
4. Mark deprecated models
5. Verify all capabilities flags (tools, vision, streaming)

**Validation:**
```bash
# Run validation script
node scripts/validate-catalog.js

# Check for inconsistencies
node scripts/check-catalog-format.js
```

#### Step 2: Fix Provider Catalog Format Inconsistencies
**Files:** `PROVIDER_CATALOG.json`, `src/model-selection/categorizer.js`  
**Effort:** 1-2 hours

**Problem:** Some providers use models as objects, others as arrays.

**Current inconsistent formats:**
```json
// Format 1: Object with model keys
"models": {
  "llama-3.1-8b-instant": { ... },
  "llama-3.3-70b-versatile": { ... }
}

// Format 2: Array of model objects (if exists)
"models": [
  { "id": "llama-3.1-8b-instant", ... },
  { "id": "llama-3.3-70b-versatile", ... }
]
```

**Standardize to object format:**
```json
{
  "providers": {
    "groq-free": {
      "name": "Groq Free Tier",
      "type": "groq-free",
      "apiBase": "https://api.groq.com/openai/v1",
      "models": {
        "llama-3.1-8b-instant": {
          "id": "llama-3.1-8b-instant",
          "category": "small",
          "contextWindow": 131072,
          "maxOutput": 8192,
          "pricing": {
            "input": 0,
            "output": 0,
            "unit": "per_million_tokens",
            "free": true
          },
          "rateLimits": {
            "tokensPerMinute": 30000,
            "requestsPerMinute": 7000
          }
        }
      }
    }
  }
}
```

**Update dependent code:**
- Update `getModelsByCategory()` in categorizer.js to handle object format
- Update `selectModel()` in selector.js if needed
- Ensure all catalog parsing consistently uses object format

#### Step 3: Create Global Rate Limit Tracker Instance
**File:** `src/endpoints/chat.js`  
**Effort:** 2-3 hours

**Goal:** Singleton RateLimitTracker that persists across Lambda warm starts.

**Implementation:**
```javascript
// At top of chat.js, outside handler function
const { RateLimitTracker } = require('../model-selection/rate-limit-tracker');
const providerCatalog = require('../../PROVIDER_CATALOG.json');

// Global singleton (persists across warm starts)
let globalRateLimitTracker = null;

function getRateLimitTracker() {
  if (!globalRateLimitTracker) {
    console.log('🔄 Initializing global RateLimitTracker...');
    globalRateLimitTracker = new RateLimitTracker({
      autoReset: true,
      persistence: null // In-memory for now, can add /tmp later
    });
    
    // Initialize from catalog
    initializeTrackerFromCatalog(globalRateLimitTracker, providerCatalog);
  }
  return globalRateLimitTracker;
}

function initializeTrackerFromCatalog(tracker, catalog) {
  for (const [providerType, providerInfo] of Object.entries(catalog.providers)) {
    for (const [modelId, modelData] of Object.entries(providerInfo.models)) {
      tracker.getModelLimit(providerType, modelId, modelData.rateLimits);
    }
  }
}
```

**Benefits:**
- Persists rate limit state across requests in same Lambda instance
- Enables proactive rate limit checking
- Tracks usage patterns for optimization

**Considerations:**
- Lambda /tmp directory for cross-instance persistence (optional future enhancement)
- TTL for stale data (reset after 5 minutes of inactivity)
- Memory usage (should be minimal, ~1-2KB per model)

### Phase 2: Core Integration (Priority: Critical)

#### Step 4: Integrate Model Selection Modules into chat.js
**File:** `src/endpoints/chat.js`  
**Effort:** 4-6 hours

**Current code to replace (lines 950-1000):**
```javascript
const selectModelForProvider = (provider, requestedModel, isComplex) => {
  if (provider.modelName) return provider.modelName;
  
  if (provider.type === 'groq-free' || provider.type === 'groq') {
    return isComplex ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
  }
  // ... more if statements
};

const isComplex = totalLength > 1000 || messages.length > 5 || hasTools;
model = selectModelForProvider(selectedProvider, model, isComplex);
```

**New approach:**
```javascript
const { selectModel, selectWithFallback } = require('../model-selection/selector');
const { RoundRobinSelector } = require('../model-selection/selector');

// Inside handler function
async function handler(event, responseStream) {
  // ... existing code ...
  
  // Get rate limit tracker
  const rateLimitTracker = getRateLimitTracker();
  
  // Convert provider pool to catalog format
  const availableProviders = providerPool.map(p => ({
    type: p.type,
    id: p.id,
    apiKey: p.apiKey,
    modelName: p.modelName,
    apiEndpoint: p.apiEndpoint
  }));
  
  // Build catalog from available providers + PROVIDER_CATALOG
  const runtimeCatalog = buildRuntimeCatalog(providerCatalog, availableProviders);
  
  // Get optimization preference from request
  const optimizationPreference = body.optimization || 'cheap'; // Default to cheap
  
  // Map to selection strategy
  const strategyMap = {
    'cheap': 'free_tier',
    'balanced': 'balanced',
    'powerful': 'quality_optimized',
    'fastest': 'balanced' // Use balanced for now, enhance later
  };
  
  const strategy = strategyMap[optimizationPreference] || 'balanced';
  
  // Select model using sophisticated logic
  let selection;
  try {
    selection = selectModel({
      messages,
      tools,
      catalog: runtimeCatalog,
      rateLimitTracker,
      preferences: {
        strategy,
        preferFree: optimizationPreference === 'cheap',
        maxCostPerMillion: Infinity // No limit for now
      },
      roundRobinSelector: new RoundRobinSelector(),
      max_tokens: body.max_tokens || null
    });
    
    console.log('🎯 Model selected:', {
      model: selection.model.name,
      provider: selection.model.providerType,
      category: selection.category,
      requestType: selection.analysis.type,
      estimatedTokens: selection.totalTokens,
      strategy: strategy
    });
    
  } catch (error) {
    console.error('❌ Model selection failed:', error.message);
    
    // Try fallback
    try {
      selection = selectWithFallback({
        messages,
        tools,
        catalog: runtimeCatalog,
        rateLimitTracker,
        preferences: { strategy, preferFree: optimizationPreference === 'cheap' }
      });
      console.log('🔄 Fallback model selected:', selection.model.name);
    } catch (fallbackError) {
      throw new Error(`No models available: ${fallbackError.message}`);
    }
  }
  
  // Extract selected model and provider
  const selectedModel = selection.model;
  const selectedProvider = providerPool.find(p => p.type === selectedModel.providerType);
  
  if (!selectedProvider) {
    throw new Error(`Provider not found: ${selectedModel.providerType}`);
  }
  
  model = selectedModel.name;
  provider = selectedProvider.type;
  apiKey = selectedProvider.apiKey;
  targetUrl = getEndpointUrl(selectedProvider);
  
  // Store selection metadata for logging
  const selectionMetadata = {
    category: selection.category,
    requestType: selection.analysis.type,
    strategy: strategy,
    inputTokens: selection.inputTokens,
    outputTokens: selection.outputTokens,
    totalTokens: selection.totalTokens,
    optimization: optimizationPreference
  };
  
  // ... continue with request ...
}
```

**New helper function:**
```javascript
function buildRuntimeCatalog(baseCatalog, availableProviders) {
  // Filter catalog to only include models from configured providers
  const catalog = JSON.parse(JSON.stringify(baseCatalog)); // Deep clone
  
  const availableTypes = new Set(availableProviders.map(p => p.type));
  
  // Keep only providers that are configured
  const filteredProviders = {};
  for (const [type, info] of Object.entries(catalog.providers)) {
    if (availableTypes.has(type)) {
      filteredProviders[type] = info;
    }
  }
  
  catalog.providers = filteredProviders;
  return catalog;
}
```

#### Step 5: Add Proactive Rate Limit Checking
**File:** `src/endpoints/chat.js`  
**Effort:** 2-3 hours

**Before making LLM request:**
```javascript
// After model selection, before request
const canMakeRequest = rateLimitTracker.isAvailable(
  selectedModel.providerType,
  selectedModel.name,
  selection.inputTokens
);

if (!canMakeRequest) {
  console.log('⚠️ Selected model rate limited, finding alternative...');
  
  // Try fallback
  selection = selectWithFallback({
    messages,
    tools,
    catalog: runtimeCatalog,
    rateLimitTracker,
    preferences: { strategy, preferFree: optimizationPreference === 'cheap' }
  });
  
  // Update model/provider based on fallback
  model = selection.model.name;
  selectedProvider = providerPool.find(p => p.type === selection.model.providerType);
  provider = selectedProvider.type;
  apiKey = selectedProvider.apiKey;
  targetUrl = getEndpointUrl(selectedProvider);
  
  console.log('✅ Fallback model available:', model);
}
```

**After successful request:**
```javascript
// After receiving response (line ~1500)
if (httpHeaders) {
  rateLimitTracker.updateFromHeaders(
    provider,
    model,
    httpHeaders
  );
}

// After calculating usage
if (usage) {
  const totalTokens = usage.prompt_tokens + usage.completion_tokens;
  rateLimitTracker.trackRequest(
    provider,
    model,
    totalTokens
  );
}
```

**After 429 error:**
```javascript
if (error.statusCode === 429) {
  // Parse retry-after header
  const retryAfter = error.headers?.['retry-after'] 
    ? parseInt(error.headers['retry-after']) 
    : 60;
  
  rateLimitTracker.updateFrom429(
    provider,
    model,
    retryAfter
  );
  
  console.log(`🔒 Rate limit recorded for ${provider}/${model}, retry after ${retryAfter}s`);
}
```

### Phase 3: UI Optimization Preferences (Priority: High)

#### Step 6: Implement UI Optimization Preference Setting
**Files:** `ui/src/components/Settings.jsx`, backend accepts `optimization` parameter  
**Effort:** 3-4 hours

**Add to Settings UI:**
```jsx
// In Settings.jsx
const [optimization, setOptimization] = useState('cheap');

// Load from IndexedDB
useEffect(() => {
  const loadSettings = async () => {
    const db = await openDB('llmproxy', 1);
    const saved = await db.get('settings', 'optimization');
    if (saved) setOptimization(saved);
  };
  loadSettings();
}, []);

// Save to IndexedDB
const handleOptimizationChange = async (value) => {
  setOptimization(value);
  const db = await openDB('llmproxy', 1);
  await db.put('settings', value, 'optimization');
};

// In Settings UI
<div className="setting-group">
  <label>Optimization Preference</label>
  <select 
    value={optimization} 
    onChange={(e) => handleOptimizationChange(e.target.value)}
  >
    <option value="cheap">Cheap (Prefer Free Providers)</option>
    <option value="balanced">Balanced (Cost/Quality)</option>
    <option value="powerful">Powerful (Best Models)</option>
  </select>
  <p className="help-text">
    Controls model selection strategy. Cheap prioritizes free providers,
    Powerful uses best paid models, Balanced optimizes cost/quality ratio.
  </p>
</div>
```

**Pass to backend:**
```javascript
// In chat request
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages,
    tools,
    optimization: optimization || 'cheap', // Include preference
    // ... other params
  })
});
```

#### Step 7-9: Implement Optimization Mode Logic

These are already partially implemented through the selection strategies, but need enhancement:

**Cheap Mode Enhancement:**
```javascript
// In selector.js, enhance prioritizeFreeTier()
function prioritizeFreeTier(models) {
  const free = models.filter(m => m.free === true);
  const paid = models.filter(m => m.free !== true);
  
  // Within free tier, prefer small models first, save large for when needed
  const freeSmall = free.filter(m => m.category === 'small');
  const freeLarge = free.filter(m => m.category === 'large');
  const freeReasoning = free.filter(m => m.category === 'reasoning');
  
  return [...freeSmall, ...freeLarge, ...freeReasoning, ...paid];
}
```

**Powerful Mode Enhancement:**
```javascript
// In selector.js, enhance prioritizeQuality()
function prioritizeQuality(models) {
  // Separate by category
  const reasoning = models.filter(m => m.category === 'reasoning');
  const large = models.filter(m => m.category === 'large');
  const small = models.filter(m => m.category === 'small');
  
  // Within each category, sort by cost (higher = better for paid models)
  const sortByCost = (a, b) => {
    const avgCostA = (a.pricing.input + a.pricing.output) / 2;
    const avgCostB = (b.pricing.input + b.pricing.output) / 2;
    return avgCostB - avgCostA; // Descending
  };
  
  reasoning.sort(sortByCost);
  large.sort(sortByCost);
  small.sort(sortByCost);
  
  return [...reasoning, ...large, ...small];
}
```

**Balanced Mode Enhancement:**
```javascript
// In selector.js, enhance balanced strategy
function prioritizeBalanced(models) {
  // Calculate cost-per-quality score
  const scored = models.map(m => {
    const avgCost = (m.pricing.input + m.pricing.output) / 2;
    const contextQuality = m.contextWindow / 100000; // Normalize
    const categoryBonus = {
      'reasoning': 3,
      'large': 2,
      'small': 1
    }[m.category] || 1;
    
    // Lower score = better balance
    const score = m.free 
      ? 0 // Free is always good
      : avgCost / (contextQuality * categoryBonus);
    
    return { ...m, balanceScore: score };
  });
  
  // Sort by balance score
  scored.sort((a, b) => a.balanceScore - b.balanceScore);
  
  return scored;
}
```

### Phase 4: Content Optimization (Priority: Medium)

#### Step 10: Implement Dynamic max_tokens Adjustment
**File:** `src/endpoints/chat.js`, new helper in `src/utils/content-optimizer.js`  
**Effort:** 2-3 hours

**Create new module:**
```javascript
// src/utils/content-optimizer.js

/**
 * Calculate optimal max_tokens based on model, optimization, and rate limits
 */
function getOptimalMaxTokens(options = {}) {
  const {
    model,
    optimization = 'balanced',
    requestType = 'simple',
    rateLimitTracker,
    provider
  } = options;
  
  // Check model's maximum output capacity
  const modelMaxOutput = model.maxOutput || 4096;
  
  // Base output by request type
  const baseOutput = {
    'simple': 2048,
    'complex': 8192,
    'reasoning': 16384,
    'creative': 12288,
    'tool_heavy': 4096
  }[requestType] || 4096;
  
  // Adjust by optimization preference
  const optimizationMultiplier = {
    'cheap': 0.5,      // Shorter responses to save tokens
    'balanced': 1.0,   // Normal length
    'powerful': 1.5    // Longer, more detailed responses
  }[optimization] || 1.0;
  
  let targetOutput = Math.floor(baseOutput * optimizationMultiplier);
  
  // Cap at model maximum
  targetOutput = Math.min(targetOutput, modelMaxOutput);
  
  // Check rate limit headroom if tracker available
  if (rateLimitTracker && provider) {
    const availability = rateLimitTracker.getAvailability(provider, model.name);
    
    if (availability && availability.tokensRemaining < targetOutput * 2) {
      // Low on tokens, reduce output
      targetOutput = Math.floor(targetOutput * 0.6);
      console.log(`⚠️ Rate limit constrained, reducing max_tokens to ${targetOutput}`);
    }
  }
  
  // Ensure minimum (at least 512 tokens)
  targetOutput = Math.max(targetOutput, 512);
  
  return targetOutput;
}

module.exports = { getOptimalMaxTokens };
```

**Use in chat.js:**
```javascript
const { getOptimalMaxTokens } = require('../utils/content-optimizer');

// After model selection
const optimalMaxTokens = getOptimalMaxTokens({
  model: selectedModel,
  optimization: optimizationPreference,
  requestType: selection.analysis.type,
  rateLimitTracker,
  provider: selectedModel.providerType
});

// Override only if user didn't specify
const max_tokens = body.max_tokens || optimalMaxTokens;

console.log(`📏 Max tokens: ${max_tokens} (optimal: ${optimalMaxTokens}, user: ${body.max_tokens || 'none'})`);
```

#### Step 11: Implement Content Input Optimization
**Files:** `src/tools.js` (search functions), `src/utils/content-optimizer.js`  
**Effort:** 3-4 hours

**Add to content-optimizer.js:**
```javascript
/**
 * Calculate optimal search result count based on model capacity
 */
function getOptimalSearchResultCount(options = {}) {
  const {
    model,
    optimization = 'balanced',
    defaultCount = 5
  } = options;
  
  const contextWindow = model.contextWindow || 100000;
  
  // Large context models can handle more results
  if (contextWindow >= 1000000) {
    // 1M+ tokens (Gemini 2M)
    return optimization === 'powerful' ? 10 : 7;
  } else if (contextWindow >= 128000) {
    // 128k tokens (GPT-4o)
    return defaultCount;
  } else if (contextWindow >= 32000) {
    // 32k tokens
    return optimization === 'cheap' ? 3 : 4;
  } else {
    // Small context
    return 3;
  }
}

/**
 * Calculate optimal content length for scraped pages/transcripts
 */
function getOptimalContentLength(options = {}) {
  const {
    model,
    optimization = 'balanced',
    contentType = 'webpage' // 'webpage' or 'transcript'
  } = options;
  
  const contextWindow = model.contextWindow || 100000;
  
  const baseLengths = {
    webpage: {
      large: 50000,    // Full page
      medium: 20000,   // Summary
      small: 8000      // Brief excerpt
    },
    transcript: {
      large: 100000,   // Full transcript
      medium: 30000,   // Major points
      small: 10000     // Key highlights
    }
  };
  
  const lengths = baseLengths[contentType] || baseLengths.webpage;
  
  if (contextWindow >= 1000000) {
    return lengths.large;
  } else if (contextWindow >= 128000) {
    return optimization === 'cheap' ? lengths.small : lengths.medium;
  } else {
    return lengths.small;
  }
}

module.exports = {
  getOptimalMaxTokens,
  getOptimalSearchResultCount,
  getOptimalContentLength
};
```

**Update tools.js:**
```javascript
const { getOptimalSearchResultCount, getOptimalContentLength } = require('./utils/content-optimizer');

// In search_web function
async function search_web(query, context = {}) {
  const { model, optimization } = context;
  
  const resultCount = model 
    ? getOptimalSearchResultCount({ model, optimization })
    : 5;
  
  console.log(`🔍 Searching with ${resultCount} results (model: ${model?.name})`);
  
  // ... perform search with resultCount ...
}

// In get_page_content function
async function get_page_content(url, context = {}) {
  const { model, optimization } = context;
  
  const maxLength = model
    ? getOptimalContentLength({ model, optimization, contentType: 'webpage' })
    : 20000;
  
  console.log(`📄 Fetching page content, max length: ${maxLength}`);
  
  // ... fetch and truncate to maxLength ...
}

// In get_youtube_transcript function
async function get_youtube_transcript(videoId, context = {}) {
  const { model, optimization } = context;
  
  const maxLength = model
    ? getOptimalContentLength({ model, optimization, contentType: 'transcript' })
    : 30000;
  
  console.log(`🎥 Fetching transcript, max length: ${maxLength}`);
  
  // ... fetch and truncate to maxLength ...
}
```

**Pass model context to tools in chat.js:**
```javascript
// When calling tools
const toolContext = {
  user: verifiedUser.email,
  model: {
    name: selectedModel.name,
    contextWindow: selectedModel.contextWindow,
    maxOutput: selectedModel.maxOutput
  },
  optimization: optimizationPreference,
  // ... other context ...
};

const result = await callFunction(toolCall.function.name, args, toolContext);
```

### Phase 5: Performance Tracking (Priority: Medium)

#### Step 12: Add Response Time Tracking to LLM Logger
**Files:** `src/endpoints/chat.js`, `src/utils/llm-logger.js`  
**Effort:** 2-3 hours

**In chat.js, track timing:**
```javascript
// Before LLM request
const requestStartTime = Date.now();
let timeToFirstToken = null;
let responseCompleteTime = null;

// In stream parser (when first chunk received)
if (!timeToFirstToken && delta && delta.content) {
  timeToFirstToken = Date.now() - requestStartTime;
  console.log(`⚡ Time to first token: ${timeToFirstToken}ms`);
}

// After stream complete
responseCompleteTime = Date.now() - requestStartTime;
const totalResponseTime = responseCompleteTime;

console.log(`📊 Response timing: {
  timeToFirstToken: ${timeToFirstToken}ms,
  totalTime: ${totalResponseTime}ms,
  model: ${model},
  provider: ${provider}
}`);
```

**Include in LLM transparency:**
```javascript
const llmInfo = {
  // ... existing fields ...
  timing: {
    timeToFirstToken: timeToFirstToken,
    totalResponseTime: totalResponseTime,
    requestStartTime: new Date(requestStartTime).toISOString()
  }
};
```

**Add to Google Sheets logging:**
```javascript
// In llm-logger.js or sheets logger
const logRow = [
  timestamp,
  user,
  model,
  provider,
  inputTokens,
  outputTokens,
  totalCost,
  timeToFirstToken,    // NEW
  totalResponseTime,   // NEW
  requestType,
  // ... other fields ...
];
```

**Store in rate limit tracker for optimization:**
```javascript
// Enhance RateLimitTracker to track performance
class RateLimitTracker {
  // ... existing code ...
  
  recordPerformance(provider, model, timing) {
    const modelLimit = this.getModelLimit(provider, model);
    
    if (!modelLimit.performance) {
      modelLimit.performance = {
        samples: [],
        avgTimeToFirstToken: 0,
        avgTotalTime: 0
      };
    }
    
    const perf = modelLimit.performance;
    
    // Keep last 20 samples
    perf.samples.push(timing);
    if (perf.samples.length > 20) {
      perf.samples.shift();
    }
    
    // Calculate averages
    const sum = (arr, key) => arr.reduce((s, t) => s + (t[key] || 0), 0);
    perf.avgTimeToFirstToken = sum(perf.samples, 'timeToFirstToken') / perf.samples.length;
    perf.avgTotalTime = sum(perf.samples, 'totalResponseTime') / perf.samples.length;
  }
  
  getAverageLatency(provider, model) {
    const modelLimit = this.getModelLimit(provider, model);
    return modelLimit.performance?.avgTimeToFirstToken || null;
  }
}
```

#### Step 13: Implement Speed Optimization Mode (Future Enhancement)
**File:** `src/model-selection/selector.js`  
**Effort:** 2-3 hours

**Add speed-based prioritization:**
```javascript
/**
 * Prioritize models by response speed
 */
function prioritizeSpeed(models, rateLimitTracker) {
  if (!rateLimitTracker) {
    // Fallback to known fast providers
    const providerSpeed = {
      'groq-free': 1,
      'groq': 1,
      'gemini-free': 2,
      'gemini': 2,
      'openai': 3,
      'together': 4,
      'atlascloud': 5
    };
    
    return [...models].sort((a, b) => {
      const speedA = providerSpeed[a.providerType] || 10;
      const speedB = providerSpeed[b.providerType] || 10;
      return speedA - speedB;
    });
  }
  
  // Use actual performance data
  const withLatency = models.map(m => {
    const latency = rateLimitTracker.getAverageLatency(m.providerType, m.name);
    return {
      ...m,
      avgLatency: latency || 999999 // Unknown = slow
    };
  });
  
  return withLatency.sort((a, b) => a.avgLatency - b.avgLatency);
}
```

**Add 'fastest' strategy:**
```javascript
const SelectionStrategy = {
  COST_OPTIMIZED: 'cost_optimized',
  QUALITY_OPTIMIZED: 'quality_optimized',
  BALANCED: 'balanced',
  FREE_TIER: 'free_tier',
  SPEED_OPTIMIZED: 'speed_optimized'  // NEW
};

// In selectModel()
switch (strategy) {
  // ... existing cases ...
  
  case SelectionStrategy.SPEED_OPTIMIZED:
    candidates = prioritizeSpeed(candidates, rateLimitTracker);
    break;
}
```

**Add to UI:**
```jsx
<option value="fastest">Fastest (Low Latency)</option>
```

### Phase 6: Testing & Documentation (Priority: High)

#### Step 14: Enhance Rate Limit State Tracking
**File:** `src/model-selection/rate-limit-tracker.js`  
**Effort:** 3-4 hours

**Enhancements:**

1. **Rolling Window Tracking:**
```javascript
class ModelRateLimit {
  // ... existing code ...
  
  trackRequest(tokens = 0) {
    const now = Date.now();
    
    // Add to history with timestamp
    this.requestHistory.push({ timestamp: now, tokens });
    this.tokenHistory.push({ timestamp: now, tokens });
    
    // Clean old entries (older than window)
    this.cleanHistory(now);
    
    // Recalculate usage from history
    this.requestsUsed = this.requestHistory.length;
    this.tokensUsed = this.tokenHistory.reduce((sum, h) => sum + h.tokens, 0);
  }
  
  cleanHistory(now) {
    const windowMs = 60000; // 1 minute
    
    this.requestHistory = this.requestHistory.filter(
      h => now - h.timestamp < windowMs
    );
    this.tokenHistory = this.tokenHistory.filter(
      h => now - h.timestamp < windowMs
    );
  }
}
```

2. **Health Score Tracking:**
```javascript
class ModelRateLimit {
  // ... existing code ...
  
  recordSuccess() {
    this.consecutiveErrors = 0;
    this.lastSuccess = Date.now();
    this.updateAvailability();
  }
  
  recordError(error) {
    this.consecutiveErrors++;
    this.lastError = {
      message: error.message,
      timestamp: Date.now()
    };
    this.updateAvailability();
  }
  
  updateAvailability() {
    // Availability decreases with consecutive errors
    if (this.consecutiveErrors === 0) {
      this.availability = 1.0;
    } else if (this.consecutiveErrors < 3) {
      this.availability = 0.8;
    } else if (this.consecutiveErrors < 5) {
      this.availability = 0.5;
    } else {
      this.availability = 0.2; // Nearly unavailable
    }
    
    // Recover over time if no recent errors
    const timeSinceError = this.lastError 
      ? Date.now() - this.lastError.timestamp 
      : Infinity;
    
    if (timeSinceError > 300000) { // 5 minutes
      this.availability = Math.min(1.0, this.availability + 0.1);
      this.consecutiveErrors = Math.max(0, this.consecutiveErrors - 1);
    }
  }
}
```

3. **Provider-Specific Header Parsing:**
```javascript
updateFromHeaders(headers) {
  // OpenAI/Groq format
  if (headers['x-ratelimit-remaining-requests']) {
    this.requestsRemaining = parseInt(headers['x-ratelimit-remaining-requests']);
    this.requestsLimit = parseInt(headers['x-ratelimit-limit-requests']) || this.requestsLimit;
  }
  
  // Gemini format
  if (headers['x-goog-quota-requests-per-minute-remaining']) {
    this.requestsRemaining = parseInt(headers['x-goog-quota-requests-per-minute-remaining']);
  }
  
  // Retry-After header
  if (headers['retry-after']) {
    const retryAfter = parseInt(headers['retry-after']);
    this.unavailableUntil = Date.now() + (retryAfter * 1000);
  }
  
  // Store raw headers for debugging
  this.lastHeaders = { ...headers };
  this.lastHeadersTime = Date.now();
}
```

#### Step 15: Create Model Selection Documentation
**File:** `docs/MODEL_SELECTION.md`  
**Effort:** 2-3 hours

**Document structure:**
```markdown
# Model Selection System

## Overview
Describes the intelligent model selection system that chooses optimal
models based on request characteristics, rate limits, and user preferences.

## Selection Flow
1. Request Analysis
2. Category Recommendation
3. Filtering (context, rate limits, cost)
4. Strategy Application
5. Round-Robin Selection
6. Fallback Logic

## Optimization Preferences
- Cheap: Maximize use of free providers
- Balanced: Optimize cost/quality ratio
- Powerful: Use best models for quality
- Fastest: Minimize latency

## Examples
[Include 5-10 real-world examples with before/after]

## Configuration
[How to configure providers, set preferences, etc.]
```

**Update README.md:**
- Add section on model selection
- Explain optimization preferences
- Provide prompting advice for different modes

#### Step 16: Create Comprehensive Test Suite
**Files:** `tests/integration/model-selection.test.js`, `tests/unit/*.test.js`  
**Effort:** 6-8 hours

**Test categories:**

1. **Unit Tests:**
   - `request-analyzer.test.js`: Request type detection
   - `categorizer.test.js`: Model categorization
   - `token-calculator.test.js`: Token estimation accuracy
   - `rate-limit-tracker.test.js`: Rate limit tracking logic
   - `selector.test.js`: Selection strategies

2. **Integration Tests:**
   - Model selection with different optimization preferences
   - Rate limit checking and fallback
   - Content optimization under constraints
   - Provider switching on errors

3. **Load Tests:**
   - Concurrent requests with rate limiting
   - Provider pool exhaustion scenarios
   - Memory leak detection in tracker

**Example test:**
```javascript
describe('Model Selection - Cheap Mode', () => {
  test('should prefer free providers', async () => {
    const result = selectModel({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: testCatalog,
      preferences: { strategy: 'free_tier' }
    });
    
    expect(result.model.free).toBe(true);
    expect(result.model.providerType).toMatch(/groq-free|gemini-free/);
  });
  
  test('should prefer small models for simple requests', async () => {
    const result = selectModel({
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      catalog: testCatalog,
      preferences: { strategy: 'free_tier' }
    });
    
    expect(result.category).toBe('small');
    expect(result.model.name).toMatch(/8b|mini|flash/);
  });
  
  test('should save large models for complex requests', async () => {
    const longMessage = 'Explain quantum computing in detail. ' + 'a'.repeat(2000);
    
    const result = selectModel({
      messages: [{ role: 'user', content: longMessage }],
      catalog: testCatalog,
      preferences: { strategy: 'free_tier' }
    });
    
    expect(result.category).toMatch(/large|reasoning/);
  });
});
```

### Phase 7: Advanced Features (Priority: Low)

#### Step 17: Add Provider Availability Dashboard
**File:** `ui/src/components/ProviderDashboard.jsx`  
**Effort:** 4-6 hours

**UI Component:**
```jsx
function ProviderDashboard({ rateLimitData }) {
  return (
    <div className="provider-dashboard">
      <h3>Provider Availability</h3>
      
      {Object.entries(rateLimitData).map(([provider, data]) => (
        <div key={provider} className="provider-card">
          <h4>{provider}</h4>
          
          <div className="metrics">
            <div className="metric">
              <span>Requests</span>
              <progress 
                value={data.requestsRemaining} 
                max={data.requestsLimit}
              />
              <span>{data.requestsRemaining}/{data.requestsLimit}</span>
            </div>
            
            <div className="metric">
              <span>Tokens</span>
              <progress 
                value={data.tokensRemaining} 
                max={data.tokensLimit}
              />
              <span>{formatTokens(data.tokensRemaining)}/{formatTokens(data.tokensLimit)}</span>
            </div>
            
            <div className="health">
              <span>Health: </span>
              <span className={`health-${getHealthClass(data.availability)}`}>
                {(data.availability * 100).toFixed(0)}%
              </span>
            </div>
            
            {data.avgLatency && (
              <div className="latency">
                <span>Avg Latency: {data.avgLatency}ms</span>
              </div>
            )}
            
            {data.lastError && (
              <div className="error">
                <span>Last Error: {data.lastError.message}</span>
                <span>{formatRelativeTime(data.lastError.timestamp)}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Backend endpoint:**
```javascript
// GET /api/rate-limits
async function getRateLimits(event, context) {
  const tracker = getRateLimitTracker();
  const summary = tracker.getSummary();
  
  return {
    statusCode: 200,
    body: JSON.stringify(summary)
  };
}
```

#### Step 18: Implement Cost Budget Constraints
**Files:** `ui/src/components/Settings.jsx`, `src/model-selection/selector.js`  
**Effort:** 3-4 hours

**Add to settings:**
```jsx
const [costBudget, setCostBudget] = useState({
  enabled: false,
  maxPerRequest: 0.10,  // $0.10 per request
  dailyLimit: 5.00      // $5.00 per day
});

<div className="setting-group">
  <label>
    <input 
      type="checkbox" 
      checked={costBudget.enabled}
      onChange={(e) => setCostBudget({...costBudget, enabled: e.target.checked})}
    />
    Enable Cost Budget
  </label>
  
  {costBudget.enabled && (
    <>
      <label>Max Cost Per Request ($)</label>
      <input 
        type="number" 
        step="0.01"
        value={costBudget.maxPerRequest}
        onChange={(e) => setCostBudget({...costBudget, maxPerRequest: parseFloat(e.target.value)})}
      />
      
      <label>Daily Limit ($)</label>
      <input 
        type="number" 
        step="0.50"
        value={costBudget.dailyLimit}
        onChange={(e) => setCostBudget({...costBudget, dailyLimit: parseFloat(e.target.value)})}
      />
    </>
  )}
</div>
```

**Enforce in model selection:**
```javascript
// Check budget before selection
if (costBudget.enabled) {
  const estimatedCost = calculateEstimatedCost(selection.model, selection.totalTokens);
  
  if (estimatedCost > costBudget.maxPerRequest) {
    // Try cheaper model
    selection = selectModel({
      ...options,
      preferences: {
        ...preferences,
        maxCostPerMillion: costBudget.maxPerRequest * 1000000 / selection.totalTokens
      }
    });
  }
  
  // Check daily limit
  const todayCost = await getTodayTotalCost(user);
  if (todayCost + estimatedCost > costBudget.dailyLimit) {
    throw new Error('Daily cost budget exceeded');
  }
}
```

---

## Technical Details

### Rate Limit Tracker Persistence Options

**Option 1: In-Memory (Current)**
- ✅ Fast access
- ✅ No external dependencies
- ❌ Lost on cold start
- ❌ No cross-instance sharing

**Option 2: Lambda /tmp Directory**
- ✅ Persists across warm starts
- ✅ No external dependencies
- ❌ Lost on cold start
- ❌ No cross-instance sharing
- ❌ Limited to 512MB

**Option 3: DynamoDB**
- ✅ Persists across all instances
- ✅ Cross-instance synchronization
- ❌ Additional cost (~$0.25/million reads)
- ❌ Slight latency increase
- ❌ Additional setup required

**Recommendation:** Start with Option 1 (in-memory), add Option 2 (/tmp) if needed, consider Option 3 (DynamoDB) for production at scale.

### Model Selection Algorithm Complexity

**Time Complexity:** O(n log n) where n = number of models
- Request analysis: O(m) where m = message count
- Category filtering: O(n)
- Rate limit filtering: O(n)
- Sorting: O(n log n)
- Selection: O(1) or O(n) for round-robin

**Space Complexity:** O(n + k) where k = number of providers
- Model catalog: O(n)
- Rate limit state: O(k * m) where m = models per provider
- Request history: O(h) where h = history window size

**Performance Impact:**
- Typical request: < 10ms overhead
- Cold start: < 50ms additional
- Memory: ~2-5MB for tracker state

### Token Estimation Accuracy

**Current Accuracy:**
- GPT models: ±5% (using tiktoken)
- Llama models: ±10% (approximation)
- Gemini models: ±15% (approximation)

**Impact of Inaccuracy:**
- Slight over/under-estimation of rate limits
- May select slightly suboptimal model
- Not critical as we have fallbacks

**Improvement Opportunities:**
- Use provider-specific tokenizers
- Calibrate estimations against actual usage
- Add safety margins (10-20%) to estimates

---

## Testing Strategy

### Phase 1: Unit Testing (Week 1)
1. Request analyzer correctness
2. Model categorization accuracy
3. Token estimation validation
4. Rate limit logic verification
5. Selection strategy correctness

**Success Criteria:** 90%+ test coverage, all tests passing

### Phase 2: Integration Testing (Week 2)
1. End-to-end model selection
2. Rate limit enforcement
3. Provider fallback scenarios
4. Content optimization
5. Cost tracking

**Success Criteria:** All integration scenarios pass, no regressions

### Phase 3: Load Testing (Week 3)
1. Concurrent request handling
2. Rate limit accuracy under load
3. Memory leak detection
4. Performance benchmarking

**Success Criteria:** 
- Handle 100 concurrent requests
- < 50ms overhead per request
- No memory leaks after 1000 requests
- Rate limit accuracy > 95%

### Phase 4: User Acceptance Testing (Week 4)
1. Deploy to staging
2. Test with real users
3. Gather feedback
4. Iterate on UI/UX

**Success Criteria:**
- User preference settings work correctly
- Cost savings demonstrated for cheap mode
- Quality maintained in balanced/powerful modes
- No unexpected errors or rate limit issues

---

## Success Criteria

### Functional Requirements ✅

1. **Model Selection Integration**
   - ✅ chat.js uses model-selection modules
   - ✅ Request analysis determines model category
   - ✅ Token budgets considered in selection
   - ✅ Provider availability checked

2. **Optimization Preferences**
   - ✅ UI setting for cheap/balanced/powerful
   - ✅ Default to 'cheap' mode
   - ✅ Each mode implements correct strategy
   - ✅ Preferences persist across sessions

3. **Rate Limiting**
   - ✅ Proactive checking before requests
   - ✅ Updates from response headers
   - ✅ Tracks 429 errors
   - ✅ Automatic fallback on exhaustion

4. **Content Optimization**
   - ✅ Dynamic max_tokens adjustment
   - ✅ Search results scaled by capacity
   - ✅ Content length optimized
   - ✅ Respects model constraints

5. **Performance Tracking**
   - ✅ Response time captured
   - ✅ Latency data stored
   - ✅ Used for optimization
   - ✅ Included in logs

### Performance Requirements 📊

1. **Latency:** < 50ms overhead for model selection
2. **Memory:** < 10MB for rate limit tracker
3. **Accuracy:** Rate limit prediction > 90% accurate
4. **Reliability:** < 1% error rate in model selection
5. **Cost Reduction:** 30-50% cost savings in cheap mode (vs. always using gpt-4o)

### Quality Requirements 🎯

1. **Test Coverage:** > 85% code coverage
2. **Documentation:** Complete API and user docs
3. **Logging:** Comprehensive debug information
4. **Error Handling:** Graceful degradation on failures
5. **Monitoring:** Dashboard for rate limit status

---

## Implementation Timeline

### Week 1: Foundation
- Days 1-2: Steps 1-2 (Catalog update & standardization)
- Days 3-4: Step 3 (Rate limit tracker instance)
- Day 5: Testing and validation

### Week 2: Core Integration
- Days 1-3: Step 4 (Model selection integration)
- Days 4-5: Step 5 (Proactive rate limiting)
- Testing throughout

### Week 3: Optimization Features
- Days 1-2: Step 6 (UI preferences)
- Days 3-5: Steps 7-9 (Optimization modes)
- Testing and iteration

### Week 4: Content & Performance
- Days 1-2: Steps 10-11 (Content optimization)
- Days 3-4: Steps 12-13 (Performance tracking)
- Day 5: Integration testing

### Week 5: Testing & Documentation
- Days 1-2: Step 14 (Enhanced tracking)
- Days 3-4: Steps 15-16 (Docs & tests)
- Day 5: Load testing

### Week 6: Advanced Features (Optional)
- Days 1-3: Step 17 (Dashboard)
- Days 4-5: Step 18 (Cost budgets)

### Week 7: Deployment
- Staging deployment
- User acceptance testing
- Bug fixes
- Production deployment

**Total Estimated Effort:** 6-7 weeks

---

## Risk Assessment

### High Risk
1. **Breaking Changes:** Integration may break existing functionality
   - Mitigation: Comprehensive testing, feature flags, gradual rollout

2. **Rate Limit Inaccuracy:** Predictions may not match reality
   - Mitigation: Conservative estimates, fallback mechanisms, continuous calibration

### Medium Risk
1. **Performance Overhead:** Model selection adds latency
   - Mitigation: Optimize algorithms, cache results, monitor metrics

2. **Memory Leaks:** Rate limit tracker may consume excessive memory
   - Mitigation: TTL cleanup, history limits, load testing

### Low Risk
1. **User Confusion:** New settings may confuse users
   - Mitigation: Clear documentation, help text, sensible defaults

2. **Cost Increase:** More sophisticated logic = more compute
   - Mitigation: Negligible cost increase (<1%), offset by better model selection

---

## Rollback Plan

If critical issues arise after deployment:

1. **Immediate:** Feature flag to disable new model selection
2. **Fallback:** Revert to simple heuristic-based selection
3. **Investigation:** Analyze logs and error reports
4. **Fix Forward:** Address issues and redeploy
5. **Gradual Re-enable:** Slowly increase percentage of traffic using new system

**Feature Flag Implementation:**
```javascript
const USE_ADVANCED_MODEL_SELECTION = process.env.USE_ADVANCED_MODEL_SELECTION !== 'false';

if (USE_ADVANCED_MODEL_SELECTION) {
  // New sophisticated selection
  selection = selectModel({ ... });
} else {
  // Old simple selection
  model = selectModelForProvider(provider, model, isComplex);
}
```

---

## Appendix A: Current Code Locations

### Model Selection Modules
- `/src/model-selection/selector.js` - Main selection logic
- `/src/model-selection/request-analyzer.js` - Request type detection
- `/src/model-selection/categorizer.js` - Model categorization
- `/src/model-selection/rate-limit-tracker.js` - Rate limit tracking
- `/src/model-selection/token-calculator.js` - Token estimation

### Chat Endpoint
- `/src/endpoints/chat.js` - Main chat handler (needs integration)
- Lines 950-1050: Current model selection logic (to be replaced)
- Lines 1300-1450: Rate limit error handling (to be enhanced)

### Provider Management
- `/src/credential-pool.js` - Provider pool building
- `/src/providers/provider-factory.js` - Provider creation
- `/PROVIDER_CATALOG.json` - Model metadata

### UI Components
- `/ui/src/components/Settings.jsx` - Settings UI (needs optimization preference)
- `/ui/src/hooks/useSettings.js` - Settings management

### Tools
- `/src/tools.js` - Tool implementations (needs content optimization context)

### Documentation
- `/developer_log/PHASE5-6-7_RATE_LIMITING.md` - Rate limiting design
- `/developer_log/PROVIDER_FALLBACK_ON_RATE_LIMITS.md` - Fallback implementation
- `/developer_log/PHASE5_MODEL_SELECTOR_COMPLETE.md` - Model selector docs

---

## Appendix B: Example Scenarios

### Scenario 1: Simple Question (Cheap Mode)
**Request:** "What is 2+2?"

**Selection Process:**
1. Analyze: Type=SIMPLE, Category=SMALL
2. Filter: All small models with 4k+ context
3. Apply Strategy: FREE_TIER
4. Result: llama-3.1-8b-instant (groq-free)

**Cost:** $0.00 (free)

### Scenario 2: Complex Analysis (Balanced Mode)
**Request:** "Analyze the economic implications of quantum computing on the semiconductor industry."

**Selection Process:**
1. Analyze: Type=COMPLEX, Category=LARGE
2. Estimate: ~25k tokens needed
3. Filter: Large models with 100k+ context, not rate limited
4. Apply Strategy: BALANCED
5. Result: gemini-2.5-flash (gemini-free, 1M context)

**Cost:** $0.00 (free, but uses premium model)

### Scenario 3: Code Generation (Powerful Mode)
**Request:** "Write a complete React application for task management with authentication."

**Selection Process:**
1. Analyze: Type=REASONING, Category=REASONING or LARGE
2. Estimate: ~50k tokens needed (large output)
3. Filter: Models with tools support, 100k+ context
4. Apply Strategy: QUALITY_OPTIMIZED
5. Result: gpt-4o (openai, best quality)

**Cost:** ~$0.125 (but highest quality output)

### Scenario 4: Rate Limited Fallback
**Request:** "Summarize this article..." (large context)

**Selection Process:**
1. Initial: gemini-2.5-flash selected
2. Rate Check: gemini-free exhausted (7k/30k RPM used)
3. Fallback: Try gemini-2.0-flash (also exhausted)
4. Fallback: Switch provider to groq-free
5. Result: llama-3.3-70b-versatile (groq-free)

**Fallback Time:** < 100ms (proactive, no failed request)

---

## Appendix C: Metrics to Track

### Model Selection Metrics
- Selection time (p50, p95, p99)
- Strategy distribution (% cheap/balanced/powerful)
- Fallback frequency
- Category accuracy (does selected category match request?)

### Rate Limiting Metrics
- Prediction accuracy (predicted vs actual exhaustion)
- 429 error rate (before vs after implementation)
- Proactive avoidance success rate
- Fallback trigger frequency

### Cost Metrics
- Average cost per request by mode
- Total daily cost
- Cost savings vs. always using GPT-4o
- Free tier utilization rate

### Performance Metrics
- Time to first token by provider/model
- Total response time by provider/model
- Provider availability percentage
- Model health scores

### User Experience Metrics
- Preference distribution (how many use each mode?)
- Setting change frequency
- Error rate by mode
- User satisfaction (if we add feedback)

---

## Conclusion

This plan provides a comprehensive roadmap for enhancing the routing, model selection, and rate limiting systems. The existing architecture is solid, with sophisticated modules that simply need to be integrated and enhanced with user-facing preferences.

**Key Takeaways:**
1. The hard work is mostly done - we have excellent modules
2. Main task is integration and user preference implementation
3. Focus on cheap/balanced/powerful modes as primary value add
4. Proactive rate limiting will significantly improve UX
5. Content optimization will maximize efficiency

**Next Steps:**
1. Review and approve this plan
2. Begin with Phase 1 (Foundation)
3. Implement in priority order
4. Test thoroughly at each phase
5. Deploy gradually with feature flags

**Questions? Contact the development team.**

---

*Document Version: 1.0*  
*Last Updated: October 12, 2025*  
*Status: Ready for Implementation*
