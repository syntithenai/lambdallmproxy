# Phase 5, 6, 7: Rate Limiting, Model Selection, and Failover

## Table of Contents
1. [Phase 5: Intelligent Model Selection & Rate Limiting](#phase-5-intelligent-model-selection--rate-limiting)
2. [Phase 6: Request Routing & Load Balancing](#phase-6-request-routing--load-balancing)
3. [Phase 7: Retry & Failover Logic](#phase-7-retry--failover-logic)

---

# Phase 5: Intelligent Model Selection & Rate Limiting

## Overview
Phase 5 implements the core intelligence of the multi-provider system: selecting the optimal model for each request while respecting rate limits and maximizing use of free-tier providers.

## Objectives
1. **Smart Model Selection** - Choose the best model based on request characteristics
2. **Rate Limit Tracking** - Monitor usage across all providers in real-time
3. **Free Tier Optimization** - Maximize use of free providers before using paid ones
4. **Cost Awareness** - Track and minimize costs while maintaining quality
5. **Predictive Availability** - Anticipate rate limit exhaustion before making requests

---

## 1. Rate Limiting Architecture

### 1.1 Rate Limit State Structure

The rate limit tracker maintains state for each provider, tracking both request and token consumption:

```javascript
// Global rate limit state (in-memory or DynamoDB)
const RateLimitState = {
  'provider-id-1': {
    providerType: 'groq-free',
    models: {
      'llama-3.1-8b-instant': {
        // Token-based limits
        tokens: {
          limit: 7000,              // Tokens per minute (from PROVIDER_CATALOG)
          consumed: 3450,           // Tokens used in current window
          remaining: 3550,          // Available tokens
          resetAt: 1728523200000,   // Unix timestamp for reset
          windowStart: 1728523140000 // Window start time
        },
        // Request-based limits
        requests: {
          limit: 30,                // Requests per minute (from PROVIDER_CATALOG)
          consumed: 12,             // Requests made in current window
          remaining: 18,            // Available requests
          resetAt: 1728523200000,   // Unix timestamp for reset
          windowStart: 1728523140000
        },
        // Provider-reported limits (from response headers)
        providerLimits: {
          tokensPerMinute: 7000,
          requestsPerMinute: 30,
          tokensPerDay: 14400,
          lastUpdated: 1728523180000
        },
        // Health tracking
        health: {
          consecutiveErrors: 0,
          lastError: null,
          lastSuccess: 1728523180000,
          availability: 1.0         // 0.0 (unavailable) to 1.0 (healthy)
        }
      }
    },
    // Provider-level aggregates
    aggregate: {
      totalTokens: {
        consumed: 3450,
        limit: 7000,
        remaining: 3550
      },
      totalRequests: {
        consumed: 12,
        limit: 30,
        remaining: 18
      }
    }
  },
  'provider-id-2': {
    // Similar structure for other providers...
  }
};
```

### 1.2 Rate Limit Detection Sources

Rate limits are detected and updated from multiple sources:

#### A. PROVIDER_CATALOG.json (Initial Limits)
```javascript
// Pre-configured limits from catalog
{
  "groq-free": {
    "models": {
      "llama-3.1-8b-instant": {
        "rateLimits": {
          "requestsPerMinute": 30,
          "tokensPerMinute": 7000,
          "tokensPerDay": 14400
        }
      }
    }
  }
}
```

#### B. HTTP Response Headers (Runtime Updates)
```javascript
// Parse rate limit headers from provider responses
function parseRateLimitHeaders(response) {
  const headers = {
    // OpenAI/Groq format
    'x-ratelimit-limit-requests': '30',
    'x-ratelimit-remaining-requests': '18',
    'x-ratelimit-reset-requests': '2024-10-09T12:00:00Z',
    'x-ratelimit-limit-tokens': '7000',
    'x-ratelimit-remaining-tokens': '3550',
    'x-ratelimit-reset-tokens': '2024-10-09T12:00:00Z',
    
    // Gemini format
    'x-goog-quota-requests-per-minute': '15',
    'x-goog-quota-requests-per-minute-remaining': '8',
    
    // Generic format
    'retry-after': '30'  // Seconds to wait
  };
  
  return {
    requestsLimit: parseInt(headers['x-ratelimit-limit-requests']),
    requestsRemaining: parseInt(headers['x-ratelimit-remaining-requests']),
    tokensLimit: parseInt(headers['x-ratelimit-limit-tokens']),
    tokensRemaining: parseInt(headers['x-ratelimit-remaining-tokens']),
    resetAt: new Date(headers['x-ratelimit-reset-tokens']).getTime()
  };
}
```

#### C. Error Responses (429 Rate Limit Exceeded)
```javascript
// 429 error structure
{
  "error": {
    "message": "Rate limit exceeded. Retry after 30 seconds.",
    "type": "rate_limit_error",
    "code": 429,
    "retry_after": 30  // Seconds
  }
}
```

### 1.3 Rate Limit Tracker Implementation

**File**: `src/model-selection/rate-limit-tracker.js`

```javascript
class RateLimitTracker {
  constructor(stateStore) {
    this.state = stateStore;  // DynamoDB or in-memory
    this.updateInterval = 1000; // Check every second for resets
    this.startWindowManager();
  }
  
  /**
   * Initialize rate limits from PROVIDER_CATALOG.json
   */
  async initializeProvider(providerId, providerType, models) {
    const catalog = await this.loadProviderCatalog();
    const providerData = catalog.chat.providers[providerType];
    
    const state = {
      providerType,
      models: {},
      aggregate: {
        totalTokens: { consumed: 0, limit: 0, remaining: 0 },
        totalRequests: { consumed: 0, limit: 0, remaining: 0 }
      }
    };
    
    // Initialize each model's rate limits
    for (const [modelId, modelData] of Object.entries(providerData.models)) {
      state.models[modelId] = {
        tokens: {
          limit: modelData.rateLimits.tokensPerMinute,
          consumed: 0,
          remaining: modelData.rateLimits.tokensPerMinute,
          resetAt: Date.now() + 60000,
          windowStart: Date.now()
        },
        requests: {
          limit: modelData.rateLimits.requestsPerMinute,
          consumed: 0,
          remaining: modelData.rateLimits.requestsPerMinute,
          resetAt: Date.now() + 60000,
          windowStart: Date.now()
        },
        providerLimits: {
          tokensPerMinute: modelData.rateLimits.tokensPerMinute,
          requestsPerMinute: modelData.rateLimits.requestsPerMinute,
          tokensPerDay: modelData.rateLimits.tokensPerDay,
          lastUpdated: Date.now()
        },
        health: {
          consecutiveErrors: 0,
          lastError: null,
          lastSuccess: Date.now(),
          availability: 1.0
        }
      };
      
      // Update aggregates
      state.aggregate.totalTokens.limit += modelData.rateLimits.tokensPerMinute;
      state.aggregate.totalTokens.remaining += modelData.rateLimits.tokensPerMinute;
      state.aggregate.totalRequests.limit += modelData.rateLimits.requestsPerMinute;
      state.aggregate.totalRequests.remaining += modelData.rateLimits.requestsPerMinute;
    }
    
    await this.state.set(providerId, state);
    return state;
  }
  
  /**
   * Check if a request can be made without hitting rate limits
   */
  async canMakeRequest(providerId, modelId, estimatedTokens) {
    const state = await this.state.get(providerId);
    if (!state || !state.models[modelId]) {
      console.warn(`No rate limit state for ${providerId}/${modelId}`);
      return { allowed: true, reason: 'no-state' };
    }
    
    const model = state.models[modelId];
    const now = Date.now();
    
    // Check if rate limit window has reset
    if (now >= model.tokens.resetAt) {
      await this.resetWindow(providerId, modelId);
      return { allowed: true, reason: 'window-reset' };
    }
    
    // Check request limit
    if (model.requests.remaining <= 0) {
      const waitTime = model.requests.resetAt - now;
      return {
        allowed: false,
        reason: 'request-limit-exceeded',
        waitMs: waitTime,
        resetAt: model.requests.resetAt
      };
    }
    
    // Check token limit
    if (model.tokens.remaining < estimatedTokens) {
      const waitTime = model.tokens.resetAt - now;
      return {
        allowed: false,
        reason: 'token-limit-exceeded',
        waitMs: waitTime,
        resetAt: model.tokens.resetAt,
        available: model.tokens.remaining,
        required: estimatedTokens
      };
    }
    
    // Check health status
    if (model.health.availability < 0.5) {
      return {
        allowed: false,
        reason: 'provider-unhealthy',
        availability: model.health.availability,
        lastError: model.health.lastError
      };
    }
    
    return {
      allowed: true,
      reason: 'capacity-available',
      requestsRemaining: model.requests.remaining,
      tokensRemaining: model.tokens.remaining
    };
  }
  
  /**
   * Record a request and update consumption
   */
  async recordRequest(providerId, modelId, tokensUsed, responseHeaders) {
    const state = await this.state.get(providerId);
    if (!state || !state.models[modelId]) return;
    
    const model = state.models[modelId];
    
    // Update consumption from our tracking
    model.requests.consumed += 1;
    model.requests.remaining = Math.max(0, model.requests.remaining - 1);
    model.tokens.consumed += tokensUsed;
    model.tokens.remaining = Math.max(0, model.tokens.remaining - tokensUsed);
    
    // Update from provider headers (if available)
    if (responseHeaders) {
      const limits = this.parseRateLimitHeaders(responseHeaders);
      if (limits.requestsRemaining !== null) {
        model.requests.remaining = limits.requestsRemaining;
        model.requests.consumed = model.requests.limit - limits.requestsRemaining;
      }
      if (limits.tokensRemaining !== null) {
        model.tokens.remaining = limits.tokensRemaining;
        model.tokens.consumed = model.tokens.limit - limits.tokensRemaining;
      }
      if (limits.resetAt) {
        model.requests.resetAt = limits.resetAt;
        model.tokens.resetAt = limits.resetAt;
      }
      model.providerLimits.lastUpdated = Date.now();
    }
    
    // Update health
    model.health.lastSuccess = Date.now();
    model.health.consecutiveErrors = 0;
    model.health.availability = Math.min(1.0, model.health.availability + 0.1);
    
    // Update aggregates
    this.updateAggregates(state);
    
    await this.state.set(providerId, state);
    
    console.log(`✓ Rate limit updated: ${providerId}/${modelId} - Requests: ${model.requests.remaining}/${model.requests.limit}, Tokens: ${model.tokens.remaining}/${model.tokens.limit}`);
  }
  
  /**
   * Record an error (429 or other failure)
   */
  async recordError(providerId, modelId, error) {
    const state = await this.state.get(providerId);
    if (!state || !state.models[modelId]) return;
    
    const model = state.models[modelId];
    
    // Update health
    model.health.consecutiveErrors += 1;
    model.health.lastError = {
      code: error.code,
      message: error.message,
      timestamp: Date.now()
    };
    
    // Degrade availability based on error type
    if (error.code === 429) {
      // Rate limit - mark as temporarily unavailable
      model.tokens.remaining = 0;
      model.requests.remaining = 0;
      model.health.availability = 0.0;
      
      // Update reset time from retry-after header
      if (error.retryAfter) {
        const resetAt = Date.now() + (error.retryAfter * 1000);
        model.tokens.resetAt = resetAt;
        model.requests.resetAt = resetAt;
      }
    } else if (error.code >= 500) {
      // Server error - degrade gradually
      model.health.availability = Math.max(0.0, model.health.availability - 0.3);
    } else {
      // Other error - minor degradation
      model.health.availability = Math.max(0.0, model.health.availability - 0.1);
    }
    
    // Auto-recover after 3+ consecutive errors
    if (model.health.consecutiveErrors >= 3) {
      console.warn(`⚠️ Provider ${providerId}/${modelId} degraded after ${model.health.consecutiveErrors} errors`);
    }
    
    await this.state.set(providerId, state);
  }
  
  /**
   * Reset rate limit window
   */
  async resetWindow(providerId, modelId) {
    const state = await this.state.get(providerId);
    if (!state || !state.models[modelId]) return;
    
    const model = state.models[modelId];
    const now = Date.now();
    
    model.tokens.consumed = 0;
    model.tokens.remaining = model.tokens.limit;
    model.tokens.windowStart = now;
    model.tokens.resetAt = now + 60000; // 1 minute window
    
    model.requests.consumed = 0;
    model.requests.remaining = model.requests.limit;
    model.requests.windowStart = now;
    model.requests.resetAt = now + 60000;
    
    this.updateAggregates(state);
    await this.state.set(providerId, state);
    
    console.log(`↻ Rate limit window reset: ${providerId}/${modelId}`);
  }
  
  /**
   * Background task to check for window resets
   */
  startWindowManager() {
    setInterval(async () => {
      const allProviders = await this.state.getAll();
      const now = Date.now();
      
      for (const [providerId, state] of Object.entries(allProviders)) {
        for (const [modelId, model] of Object.entries(state.models)) {
          if (now >= model.tokens.resetAt) {
            await this.resetWindow(providerId, modelId);
          }
        }
      }
    }, this.updateInterval);
  }
  
  /**
   * Parse rate limit headers from provider responses
   */
  parseRateLimitHeaders(headers) {
    // OpenAI/Groq format
    if (headers['x-ratelimit-remaining-tokens']) {
      return {
        tokensRemaining: parseInt(headers['x-ratelimit-remaining-tokens']),
        requestsRemaining: parseInt(headers['x-ratelimit-remaining-requests']),
        resetAt: new Date(headers['x-ratelimit-reset-tokens']).getTime()
      };
    }
    
    // Gemini format
    if (headers['x-goog-quota-requests-per-minute-remaining']) {
      return {
        requestsRemaining: parseInt(headers['x-goog-quota-requests-per-minute-remaining']),
        tokensRemaining: null,
        resetAt: null
      };
    }
    
    return { tokensRemaining: null, requestsRemaining: null, resetAt: null };
  }
  
  /**
   * Update aggregate statistics
   */
  updateAggregates(state) {
    state.aggregate.totalTokens.consumed = 0;
    state.aggregate.totalTokens.remaining = 0;
    state.aggregate.totalRequests.consumed = 0;
    state.aggregate.totalRequests.remaining = 0;
    
    for (const model of Object.values(state.models)) {
      state.aggregate.totalTokens.consumed += model.tokens.consumed;
      state.aggregate.totalTokens.remaining += model.tokens.remaining;
      state.aggregate.totalRequests.consumed += model.requests.consumed;
      state.aggregate.totalRequests.remaining += model.requests.remaining;
    }
  }
  
  /**
   * Get provider statistics for monitoring
   */
  async getProviderStats(providerId) {
    const state = await this.state.get(providerId);
    if (!state) return null;
    
    return {
      providerType: state.providerType,
      aggregate: state.aggregate,
      models: Object.entries(state.models).map(([modelId, model]) => ({
        modelId,
        requests: {
          consumed: model.requests.consumed,
          remaining: model.requests.remaining,
          limit: model.requests.limit,
          utilization: (model.requests.consumed / model.requests.limit * 100).toFixed(1) + '%'
        },
        tokens: {
          consumed: model.tokens.consumed,
          remaining: model.tokens.remaining,
          limit: model.tokens.limit,
          utilization: (model.tokens.consumed / model.tokens.limit * 100).toFixed(1) + '%'
        },
        health: model.health
      }))
    };
  }
}

module.exports = { RateLimitTracker };
```

---

## 2. Model Selection Algorithm

### 2.1 Request Analysis

**File**: `src/model-selection/request-analyzer.js`

```javascript
class RequestAnalyzer {
  /**
   * Analyze request to determine optimal model category
   */
  analyzeRequest(messages, tools, context) {
    const analysis = {
      category: 'large',  // Default to large
      requiresTools: false,
      requiresVision: false,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      complexity: 'medium',
      contextSize: 'medium'
    };
    
    // Check for tool usage
    if (tools && tools.length > 0) {
      analysis.requiresTools = true;
      analysis.category = 'large'; // Tools need larger models
    }
    
    // Check for images (vision requirement)
    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'image_url') {
            analysis.requiresVision = true;
            analysis.category = 'large'; // Vision needs larger models
            break;
          }
        }
      }
    }
    
    // Estimate tokens
    const totalText = messages.map(m => 
      typeof m.content === 'string' ? m.content : 
      Array.isArray(m.content) ? m.content.filter(p => p.text).map(p => p.text).join('') : ''
    ).join('');
    
    analysis.estimatedInputTokens = this.estimateTokens(totalText);
    analysis.estimatedOutputTokens = 1000; // Default estimate
    
    // Determine context size
    if (analysis.estimatedInputTokens < 1000) {
      analysis.contextSize = 'small';
    } else if (analysis.estimatedInputTokens < 10000) {
      analysis.contextSize = 'medium';
    } else {
      analysis.contextSize = 'large';
    }
    
    // Check for reasoning indicators
    const reasoningKeywords = [
      'explain', 'analyze', 'reasoning', 'think step by step',
      'break down', 'logic', 'proof', 'derive', 'calculate'
    ];
    
    const hasReasoningKeywords = reasoningKeywords.some(keyword =>
      totalText.toLowerCase().includes(keyword)
    );
    
    if (hasReasoningKeywords) {
      analysis.category = 'reasoning';
      analysis.complexity = 'high';
    }
    
    // Simple requests can use small models
    if (!analysis.requiresTools && 
        !analysis.requiresVision && 
        analysis.estimatedInputTokens < 500 &&
        !hasReasoningKeywords) {
      analysis.category = 'small';
      analysis.complexity = 'low';
    }
    
    return analysis;
  }
  
  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text) {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}

module.exports = { RequestAnalyzer };
```

### 2.2 Model Selector

**File**: `src/model-selection/selector.js`

```javascript
class ModelSelector {
  constructor(rateLimitTracker, providerCatalog) {
    this.rateLimitTracker = rateLimitTracker;
    this.catalog = providerCatalog;
    this.analyzer = new RequestAnalyzer();
  }
  
  /**
   * Select the best model for a request
   */
  async selectModel(providers, messages, tools, context = {}) {
    // Analyze request requirements
    const analysis = this.analyzer.analyzeRequest(messages, tools, context);
    
    console.log('📊 Request analysis:', {
      category: analysis.category,
      requiresTools: analysis.requiresTools,
      requiresVision: analysis.requiresVision,
      estimatedTokens: analysis.estimatedInputTokens + analysis.estimatedOutputTokens
    });
    
    // Get all candidate models
    const candidates = await this.getCandidateModels(providers, analysis);
    
    if (candidates.length === 0) {
      throw new Error('No suitable models available for this request');
    }
    
    // Sort by priority
    const sorted = this.prioritizeCandidates(candidates, analysis);
    
    // Return top choice
    const selected = sorted[0];
    console.log(`✓ Selected model: ${selected.providerId}/${selected.modelId} (${selected.providerType})`);
    
    return {
      providerId: selected.providerId,
      providerType: selected.providerType,
      modelId: selected.modelId,
      apiEndpoint: selected.apiEndpoint,
      apiKey: selected.apiKey,
      rationale: selected.rationale
    };
  }
  
  /**
   * Get candidate models that meet requirements
   */
  async getCandidateModels(providers, analysis) {
    const candidates = [];
    
    for (const provider of providers) {
      const providerData = this.catalog.chat.providers[provider.type];
      if (!providerData) continue;
      
      for (const [modelId, modelData] of Object.entries(providerData.models)) {
        // Check basic requirements
        if (analysis.requiresTools && !modelData.supportsTools) continue;
        if (analysis.requiresVision && !modelData.supportsVision) continue;
        
        // Check if model is in desired category
        const modelCategories = this.catalog.modelCategories;
        const inCategory = modelCategories[analysis.category]?.includes(modelId);
        
        // Allow models from higher categories (e.g., large models for small requests)
        const isAcceptable = inCategory || 
          (analysis.category === 'small' && modelCategories.large.includes(modelId)) ||
          (analysis.category === 'small' && modelCategories.reasoning.includes(modelId));
        
        if (!isAcceptable) continue;
        
        // Check rate limits
        const totalTokens = analysis.estimatedInputTokens + analysis.estimatedOutputTokens;
        const canMake = await this.rateLimitTracker.canMakeRequest(
          provider.id,
          modelId,
          totalTokens
        );
        
        if (!canMake.allowed) {
          console.log(`⏭️  Skipping ${provider.type}/${modelId}: ${canMake.reason}`);
          continue;
        }
        
        // Add to candidates
        candidates.push({
          providerId: provider.id,
          providerType: provider.type,
          modelId,
          apiEndpoint: provider.apiEndpoint,
          apiKey: provider.apiKey,
          modelData,
          rateLimitStatus: canMake,
          isFree: modelData.pricing.free === true,
          cost: modelData.pricing.input + modelData.pricing.output
        });
      }
    }
    
    return candidates;
  }
  
  /**
   * Prioritize candidates by multiple factors
   */
  prioritizeCandidates(candidates, analysis) {
    return candidates.sort((a, b) => {
      // Priority 1: Free tier first
      if (a.isFree && !b.isFree) return -1;
      if (!a.isFree && b.isFree) return 1;
      
      // Priority 2: Higher available capacity
      const aCapacity = a.rateLimitStatus.tokensRemaining / a.modelData.rateLimits.tokensPerMinute;
      const bCapacity = b.rateLimitStatus.tokensRemaining / b.modelData.rateLimits.tokensPerMinute;
      if (aCapacity > bCapacity) return -1;
      if (bCapacity > aCapacity) return 1;
      
      // Priority 3: Lower cost (for paid providers)
      if (!a.isFree && !b.isFree) {
        if (a.cost < b.cost) return -1;
        if (b.cost < a.cost) return 1;
      }
      
      // Priority 4: Better health score
      const aHealth = a.modelData.health?.availability || 1.0;
      const bHealth = b.modelData.health?.availability || 1.0;
      if (aHealth > bHealth) return -1;
      if (bHealth > aHealth) return 1;
      
      return 0;
    }).map((candidate, index) => ({
      ...candidate,
      rationale: this.buildRationale(candidate, index, analysis)
    }));
  }
  
  /**
   * Build human-readable rationale for selection
   */
  buildRationale(candidate, rank, analysis) {
    const reasons = [];
    
    if (rank === 0) reasons.push('Best available option');
    if (candidate.isFree) reasons.push('Free tier');
    if (candidate.rateLimitStatus.tokensRemaining > 1000) reasons.push('High capacity');
    if (candidate.modelData.supportsTools && analysis.requiresTools) reasons.push('Supports tools');
    if (candidate.modelData.supportsVision && analysis.requiresVision) reasons.push('Supports vision');
    
    return reasons.join(', ');
  }
}

module.exports = { ModelSelector };
```

---

## 3. Token Estimation & Cost Calculation

**File**: `src/model-selection/token-calculator.js`

```javascript
class TokenCalculator {
  /**
   * Estimate tokens using tiktoken-style algorithm
   */
  estimateTokens(text) {
    // Simple approximation: ~4 chars per token
    // For production, use tiktoken or similar library
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Estimate tokens for entire conversation
   */
  estimateConversationTokens(messages) {
    let total = 0;
    
    for (const msg of messages) {
      // Message overhead (role, delimiters, etc.)
      total += 4;
      
      // Content
      if (typeof msg.content === 'string') {
        total += this.estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.text) {
            total += this.estimateTokens(part.text);
          }
          if (part.type === 'image_url') {
            total += 765; // Fixed cost for vision processing
          }
        }
      }
      
      // Tool calls
      if (msg.tool_calls) {
        for (const call of msg.tool_calls) {
          total += this.estimateTokens(JSON.stringify(call.function));
        }
      }
    }
    
    return total;
  }
  
  /**
   * Calculate cost for a request
   */
  calculateCost(inputTokens, outputTokens, pricing) {
    const inputCost = (inputTokens / pricing.unit) * pricing.input;
    const outputCost = (outputTokens / pricing.unit) * pricing.output;
    return inputCost + outputCost;
  }
}

module.exports = { TokenCalculator };
```

---

## 4. State Persistence

**File**: `src/model-selection/state-store.js`

```javascript
class StateStore {
  constructor(type = 'memory') {
    this.type = type;
    this.memory = new Map();
  }
  
  async get(key) {
    if (this.type === 'memory') {
      return this.memory.get(key);
    }
    // DynamoDB implementation would go here
  }
  
  async set(key, value) {
    if (this.type === 'memory') {
      this.memory.set(key, value);
      return;
    }
    // DynamoDB implementation would go here
  }
  
  async getAll() {
    if (this.type === 'memory') {
      return Object.fromEntries(this.memory);
    }
    // DynamoDB implementation would go here
  }
  
  async delete(key) {
    if (this.type === 'memory') {
      this.memory.delete(key);
      return;
    }
    // DynamoDB implementation would go here
  }
}

module.exports = { StateStore };
```

---

# Phase 6: Request Routing & Load Balancing

## Overview
Phase 6 implements intelligent request routing with load balancing across multiple providers, ensuring optimal distribution and failover capabilities.

## 1. Load Balancer Implementation

**File**: `src/routing/load-balancer.js`

```javascript
class LoadBalancer {
  constructor(rateLimitTracker) {
    this.rateLimitTracker = rateLimitTracker;
    this.roundRobinIndex = new Map(); // Per-provider-type round-robin
  }
  
  /**
   * Distribute requests across providers using round-robin
   */
  async distributeRequest(providers, modelId) {
    const providerType = providers[0].type; // Assume same type
    const currentIndex = this.roundRobinIndex.get(providerType) || 0;
    
    // Try each provider in round-robin order
    for (let i = 0; i < providers.length; i++) {
      const index = (currentIndex + i) % providers.length;
      const provider = providers[index];
      
      // Check if provider can handle request
      const canMake = await this.rateLimitTracker.canMakeRequest(
        provider.id,
        modelId,
        1000 // Estimated tokens
      );
      
      if (canMake.allowed) {
        this.roundRobinIndex.set(providerType, (index + 1) % providers.length);
        return provider;
      }
    }
    
    return null; // No available provider
  }
}

module.exports = { LoadBalancer };
```

## 2. Health Checker

**File**: `src/routing/health-checker.js`

```javascript
class HealthChecker {
  constructor(rateLimitTracker) {
    this.rateLimitTracker = rateLimitTracker;
    this.checkInterval = 60000; // 1 minute
    this.startHealthChecks();
  }
  
  /**
   * Periodic health checks for all providers
   */
  startHealthChecks() {
    setInterval(async () => {
      const allProviders = await this.rateLimitTracker.state.getAll();
      
      for (const [providerId, state] of Object.entries(allProviders)) {
        for (const [modelId, model] of Object.entries(state.models)) {
          // Auto-recover unhealthy providers after cooldown
          if (model.health.availability < 1.0) {
            const timeSinceError = Date.now() - model.health.lastError?.timestamp;
            if (timeSinceError > 60000) { // 1 minute cooldown
              model.health.consecutiveErrors = 0;
              model.health.availability = Math.min(1.0, model.health.availability + 0.2);
            }
          }
        }
      }
    }, this.checkInterval);
  }
}

module.exports = { HealthChecker };
```

## 3. Circuit Breaker

**File**: `src/routing/circuit-breaker.js`

```javascript
class CircuitBreaker {
  constructor() {
    this.states = new Map(); // providerId -> state
  }
  
  /**
   * Circuit breaker states: CLOSED, OPEN, HALF_OPEN
   */
  async checkCircuit(providerId) {
    const state = this.states.get(providerId) || {
      status: 'CLOSED',
      failures: 0,
      lastFailure: null,
      nextRetry: null
    };
    
    if (state.status === 'OPEN') {
      if (Date.now() < state.nextRetry) {
        return { allowed: false, reason: 'circuit-open' };
      }
      // Try half-open state
      state.status = 'HALF_OPEN';
    }
    
    return { allowed: true };
  }
  
  /**
   * Record success/failure
   */
  async recordResult(providerId, success) {
    const state = this.states.get(providerId) || {
      status: 'CLOSED',
      failures: 0,
      lastFailure: null,
      nextRetry: null
    };
    
    if (success) {
      state.failures = 0;
      state.status = 'CLOSED';
    } else {
      state.failures += 1;
      state.lastFailure = Date.now();
      
      if (state.failures >= 5) {
        state.status = 'OPEN';
        state.nextRetry = Date.now() + 60000; // 1 minute
      }
    }
    
    this.states.set(providerId, state);
  }
}

module.exports = { CircuitBreaker };
```

---

# Phase 7: Retry & Failover Logic

## Overview
Phase 7 implements resilient error handling with automatic retry and failover across providers.

## 1. Retry Handler

**File**: `src/retry/retry-handler.js`

```javascript
class RetryHandler {
  constructor(modelSelector, rateLimitTracker) {
    this.modelSelector = modelSelector;
    this.rateLimitTracker = rateLimitTracker;
    this.maxRetries = 3;
  }
  
  /**
   * Execute request with automatic retry and failover
   */
  async executeWithRetry(providers, messages, tools, context) {
    let lastError = null;
    const attemptedProviders = new Set();
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Select model (excluding already-failed providers)
        const availableProviders = providers.filter(p => 
          !attemptedProviders.has(p.id)
        );
        
        if (availableProviders.length === 0) {
          throw new Error('All providers exhausted');
        }
        
        const selected = await this.modelSelector.selectModel(
          availableProviders,
          messages,
          tools,
          context
        );
        
        attemptedProviders.add(selected.providerId);
        
        // Make request
        console.log(`🔄 Attempt ${attempt + 1}/${this.maxRetries}: ${selected.providerType}/${selected.modelId}`);
        
        const result = await this.makeRequest(selected, messages, tools);
        
        // Success - update rate limits
        await this.rateLimitTracker.recordRequest(
          selected.providerId,
          selected.modelId,
          result.tokensUsed,
          result.headers
        );
        
        return result;
        
      } catch (error) {
        lastError = error;
        console.error(`❌ Attempt ${attempt + 1} failed:`, error.message);
        
        // Record error
        if (error.providerId && error.modelId) {
          await this.rateLimitTracker.recordError(
            error.providerId,
            error.modelId,
            error
          );
        }
        
        // Check if we should retry
        if (!this.shouldRetry(error, attempt)) {
          break;
        }
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await this.sleep(delay);
      }
    }
    
    throw new Error(`Request failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }
  
  /**
   * Determine if error is retryable
   */
  shouldRetry(error, attempt) {
    // Always retry 429 (rate limit)
    if (error.code === 429) return true;
    
    // Retry 5xx server errors
    if (error.code >= 500 && error.code < 600) return true;
    
    // Don't retry 4xx client errors (except 429)
    if (error.code >= 400 && error.code < 500) return false;
    
    // Retry network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
    
    // Don't exceed max retries
    return attempt < this.maxRetries - 1;
  }
  
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async makeRequest(selected, messages, tools) {
    // Implementation depends on provider
    throw new Error('Not implemented - use provider-specific implementation');
  }
}

module.exports = { RetryHandler };
```

## 2. Error Classifier

**File**: `src/retry/error-classifier.js`

```javascript
class ErrorClassifier {
  /**
   * Classify errors for appropriate handling
   */
  classify(error) {
    return {
      type: this.getErrorType(error),
      retryable: this.isRetryable(error),
      severity: this.getSeverity(error),
      suggestedAction: this.getSuggestedAction(error)
    };
  }
  
  getErrorType(error) {
    if (error.code === 429) return 'RATE_LIMIT';
    if (error.code === 401) return 'AUTH';
    if (error.code === 403) return 'FORBIDDEN';
    if (error.code >= 500) return 'SERVER_ERROR';
    if (error.code >= 400) return 'CLIENT_ERROR';
    if (error.code === 'ECONNRESET') return 'NETWORK';
    return 'UNKNOWN';
  }
  
  isRetryable(error) {
    const type = this.getErrorType(error);
    return ['RATE_LIMIT', 'SERVER_ERROR', 'NETWORK'].includes(type);
  }
  
  getSeverity(error) {
    const type = this.getErrorType(error);
    if (type === 'RATE_LIMIT') return 'LOW';
    if (type === 'SERVER_ERROR') return 'MEDIUM';
    if (type === 'AUTH') return 'HIGH';
    return 'MEDIUM';
  }
  
  getSuggestedAction(error) {
    const type = this.getErrorType(error);
    if (type === 'RATE_LIMIT') return 'Switch to different provider';
    if (type === 'AUTH') return 'Check API key configuration';
    if (type === 'SERVER_ERROR') return 'Retry with backoff';
    return 'Contact support';
  }
}

module.exports = { ErrorClassifier };
```

## 3. Backoff Strategy

**File**: `src/retry/backoff-strategy.js`

```javascript
class BackoffStrategy {
  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  calculateDelay(attempt, baseDelay = 1000, maxDelay = 30000) {
    // Exponential backoff: delay = baseDelay * 2^attempt
    const exponential = baseDelay * Math.pow(2, attempt);
    
    // Add jitter (±25%)
    const jitter = exponential * (0.75 + Math.random() * 0.5);
    
    // Cap at maxDelay
    return Math.min(jitter, maxDelay);
  }
  
  /**
   * Calculate delay from retry-after header
   */
  calculateFromRetryAfter(retryAfter) {
    // Parse retry-after (seconds or HTTP date)
    if (typeof retryAfter === 'number') {
      return retryAfter * 1000;
    }
    
    if (typeof retryAfter === 'string') {
      // Try parsing as date
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        return Math.max(0, date.getTime() - Date.now());
      }
      
      // Try parsing as seconds
      const seconds = parseInt(retryAfter);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
    }
    
    return 0;
  }
}

module.exports = { BackoffStrategy };
```

---

## Summary

These three phases work together to create a robust, intelligent request routing system:

1. **Phase 5** provides the foundation with rate limit tracking and model selection
2. **Phase 6** adds load balancing and health monitoring
3. **Phase 7** ensures resilience with retry and failover

The rate limiting system is the key to making smart decisions about which provider and model to use for each request, maximizing free tier usage while maintaining quality and reliability.
