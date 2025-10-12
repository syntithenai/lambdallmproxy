/**
 * Rate Limit Tracker Module
 * 
 * Tracks rate limits per provider and model
 * Handles 429 errors and automatic failover
 */

/**
 * Rate limit state for a single model
 */
class ModelRateLimit {
  constructor(modelName, limits = {}) {
    this.modelName = modelName;
    this.requestsPerMinute = limits.rpm || Infinity;
    this.tokensPerMinute = limits.tpm || Infinity;
    this.requestsPerDay = limits.rpd || Infinity;
    
    // Current usage
    this.requestsUsed = 0;
    this.tokensUsed = 0;
    this.requestsToday = 0;
    
    // Tracking
    this.lastReset = Date.now();
    this.lastDayReset = Date.now();
    this.unavailableUntil = null;
    this.retryAfter = null;
    
    // History for rolling windows
    this.requestHistory = [];
    this.tokenHistory = [];
    
    // STEP 12: Performance tracking
    this.performanceHistory = [];
    
    // STEP 14: Health tracking
    this.consecutiveErrors = 0;
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.lastResponseHeaders = null; // For debugging
  }

  /**
   * Check if rate limit allows a new request
   * @param {number} tokens - Number of tokens for request
   * @returns {boolean} True if request is allowed
   */
  canMakeRequest(tokens = 0) {
    const now = Date.now();
    
    // Check if unavailable due to 429
    if (this.unavailableUntil && now < this.unavailableUntil) {
      return false;
    }

    // Clear unavailable state if time has passed
    if (this.unavailableUntil && now >= this.unavailableUntil) {
      this.unavailableUntil = null;
      this.retryAfter = null;
    }

    // Clean old history entries (older than 1 minute)
    this.cleanHistory(now);

    // Check current usage against limits
    if (this.requestsUsed >= this.requestsPerMinute) {
      return false;
    }

    if (tokens > 0 && this.tokensUsed + tokens > this.tokensPerMinute) {
      return false;
    }

    if (this.requestsToday >= this.requestsPerDay) {
      return false;
    }

    return true;
  }

  /**
   * Record a request
   * @param {number} tokens - Number of tokens used
   */
  trackRequest(tokens = 0) {
    const now = Date.now();
    
    this.requestsUsed++;
    this.tokensUsed += tokens;
    this.requestsToday++;
    
    // Add to history
    this.requestHistory.push({ timestamp: now, tokens });
    this.tokenHistory.push({ timestamp: now, tokens });
  }

  /**
   * Update from response headers (STEP 14: Enhanced for multiple providers)
   * @param {Object} headers - HTTP response headers
   */
  updateFromHeaders(headers) {
    // STEP 14: Store headers for debugging
    this.lastResponseHeaders = headers;
    
    // Parse standard x-ratelimit-* headers (OpenAI, Groq, Together)
    const remaining = this.parseHeader(headers['x-ratelimit-remaining-requests']);
    const limit = this.parseHeader(headers['x-ratelimit-limit-requests']);
    const reset = this.parseHeader(headers['x-ratelimit-reset-requests']);
    
    const tokensRemaining = this.parseHeader(headers['x-ratelimit-remaining-tokens']);
    const tokensLimit = this.parseHeader(headers['x-ratelimit-limit-tokens']);
    
    // STEP 14: Parse Google/Gemini specific headers (x-goog-quota-user-*)
    const googRemaining = this.parseHeader(headers['x-goog-quota-user-remaining-requests-per-minute']);
    const googLimit = this.parseHeader(headers['x-goog-quota-user-limit-requests-per-minute']);
    const googTokensRemaining = this.parseHeader(headers['x-goog-quota-user-remaining-tokens-per-minute']);
    const googTokensLimit = this.parseHeader(headers['x-goog-quota-user-limit-tokens-per-minute']);

    // Update limits if present (standard headers)
    if (limit !== null) {
      this.requestsPerMinute = limit;
      if (remaining !== null) {
        this.requestsRemaining = remaining;
        this.requestsUsed = limit - remaining;
      }
    }

    if (tokensLimit !== null) {
      this.tokensPerMinute = tokensLimit;
      if (tokensRemaining !== null) {
        this.tokensRemaining = tokensRemaining;
        this.tokensUsed = tokensLimit - tokensRemaining;
      }
    }
    
    // STEP 14: Update from Google headers if standard headers not present
    if (limit === null && googLimit !== null) {
      this.requestsPerMinute = googLimit;
      if (googRemaining !== null) {
        this.requestsRemaining = googRemaining;
        this.requestsUsed = googLimit - googRemaining;
      }
    }
    
    if (tokensLimit === null && googTokensLimit !== null) {
      this.tokensPerMinute = googTokensLimit;
      if (googTokensRemaining !== null) {
        this.tokensRemaining = googTokensRemaining;
        this.tokensUsed = googTokensLimit - googTokensRemaining;
      }
    }

    // Update reset time if present
    if (reset !== null) {
      // Reset can be Unix timestamp or seconds until reset
      if (reset > 9999999999) {
        // Looks like milliseconds timestamp
        this.lastReset = reset;
      } else if (reset > 999999999) {
        // Looks like seconds timestamp
        this.lastReset = reset * 1000;
      } else {
        // Seconds until reset
        this.lastReset = Date.now() + (reset * 1000);
      }
    }
  }

  /**
   * Update from 429 error
   * @param {number} retryAfter - Seconds until retry (optional)
   */
  updateFrom429(retryAfter = null) {
    const now = Date.now();
    
    if (retryAfter !== null) {
      this.retryAfter = retryAfter;
      this.unavailableUntil = now + (retryAfter * 1000);
    } else {
      // Default to 60 seconds if no retry-after header
      this.retryAfter = 60;
      this.unavailableUntil = now + 60000;
    }
  }

  /**
   * Get available capacity
   * @returns {Object} Remaining capacity
   */
  getCapacity() {
    const now = Date.now();
    
    // If unavailable, return zero capacity
    if (this.unavailableUntil && now < this.unavailableUntil) {
      return {
        requests: 0,
        tokens: 0,
        requestsToday: 0,
        available: false,
        retryAfter: Math.ceil((this.unavailableUntil - now) / 1000)
      };
    }

    return {
      requests: Math.max(0, this.requestsPerMinute - this.requestsUsed),
      tokens: Math.max(0, this.tokensPerMinute - this.tokensUsed),
      requestsToday: Math.max(0, this.requestsPerDay - this.requestsToday),
      available: true,
      retryAfter: 0
    };
  }

  /**
   * Reset counters (called automatically based on time)
   */
  reset() {
    const now = Date.now();
    
    // Reset minute counters if a minute has passed
    if (now - this.lastReset >= 60000) {
      this.requestsUsed = 0;
      this.tokensUsed = 0;
      this.lastReset = now;
      this.requestHistory = [];
      this.tokenHistory = [];
    }

    // Reset daily counters if a day has passed
    if (now - this.lastDayReset >= 86400000) {
      this.requestsToday = 0;
      this.lastDayReset = now;
    }
  }

  /**
   * Clean old history entries
   * @param {number} now - Current timestamp
   */
  cleanHistory(now) {
    const oneMinuteAgo = now - 60000;
    
    this.requestHistory = this.requestHistory.filter(
      entry => entry.timestamp > oneMinuteAgo
    );
    
    this.tokenHistory = this.tokenHistory.filter(
      entry => entry.timestamp > oneMinuteAgo
    );
    
    // Recalculate usage from history
    this.requestsUsed = this.requestHistory.length;
    this.tokensUsed = this.tokenHistory.reduce(
      (sum, entry) => sum + entry.tokens, 
      0
    );
  }

  /**
   * Parse header value to number
   * @param {string|number} value - Header value
   * @returns {number|null} Parsed number or null
   */
  parseHeader(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * STEP 12: Record performance metrics for speed optimization
   * @param {Object} metrics - Performance metrics
   */
  recordPerformance(metrics) {
    if (!this.performanceHistory) {
      this.performanceHistory = [];
    }
    
    this.performanceHistory.push({
      timeToFirstToken: metrics.timeToFirstToken,
      totalDuration: metrics.totalDuration,
      timestamp: metrics.timestamp || Date.now()
    });
    
    // Keep only last 100 entries to prevent memory bloat
    if (this.performanceHistory.length > 100) {
      this.performanceHistory.shift();
    }
  }

  /**
   * STEP 12: Get average performance metrics
   * @returns {Object} Average TTFT and duration
   */
  getAveragePerformance() {
    if (!this.performanceHistory || this.performanceHistory.length === 0) {
      return null;
    }
    
    const recent = this.performanceHistory.slice(-20); // Last 20 requests
    const avgTTFT = recent.reduce((sum, m) => sum + m.timeToFirstToken, 0) / recent.length;
    const avgDuration = recent.reduce((sum, m) => sum + m.totalDuration, 0) / recent.length;
    
    return {
      avgTTFT: Math.round(avgTTFT),
      avgDuration: Math.round(avgDuration),
      sampleSize: recent.length
    };
  }

  /**
   * STEP 14: Record successful request (health tracking)
   */
  recordSuccess() {
    this.consecutiveErrors = 0;
    this.totalRequests++;
    this.successfulRequests++;
  }

  /**
   * STEP 14: Record failed request (health tracking)
   */
  recordError() {
    this.consecutiveErrors++;
    this.totalRequests++;
  }

  /**
   * STEP 14: Get health score (0-100)
   * @returns {number} Health score
   */
  getHealthScore() {
    if (this.totalRequests === 0) {
      return 100; // No data, assume healthy
    }
    
    // Success rate (70% weight)
    const successRate = this.successfulRequests / this.totalRequests;
    const successScore = successRate * 70;
    
    // Consecutive error penalty (deduct 3 points per error, max 30)
    const errorPenalty = Math.min(this.consecutiveErrors * 3, 30);
    
    // If no errors, add 30 bonus points (total can reach 100)
    const consecutiveErrorBonus = this.consecutiveErrors === 0 ? 30 : 0;
    
    const totalScore = successScore - errorPenalty + consecutiveErrorBonus;
    return Math.max(0, Math.min(100, Math.round(totalScore)));
  }

  /**
   * STEP 14: Check if model is healthy enough to use
   * @returns {boolean} True if healthy
   */
  isHealthy() {
    // Unhealthy if: 3+ consecutive errors OR health score < 10
    if (this.consecutiveErrors >= 3) {
      return false;
    }
    
    const healthScore = this.getHealthScore();
    return healthScore >= 10;
  }
}

/**
 * Rate Limit Tracker - Manages rate limits for all providers and models
 */
class RateLimitTracker {
  constructor(options = {}) {
    this.providers = new Map(); // provider -> Map(model -> ModelRateLimit)
    this.persistence = options.persistence || null;
    this.autoReset = options.autoReset !== false; // Default true
    
    // Load persisted state if available
    if (this.persistence && typeof this.persistence.load === 'function') {
      this.loadState();
    }
  }

  /**
   * Get or create model rate limit state
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {Object} limits - Rate limits (optional)
   * @returns {ModelRateLimit} Rate limit state
   */
  getModelLimit(provider, model, limits = null) {
    if (!this.providers.has(provider)) {
      this.providers.set(provider, new Map());
    }

    const providerModels = this.providers.get(provider);
    
    if (!providerModels.has(model)) {
      providerModels.set(model, new ModelRateLimit(model, limits || {}));
    }

    return providerModels.get(model);
  }

  /**
   * Track a request
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {number} tokens - Tokens used
   * @param {Object} limits - Rate limits (optional)
   */
  trackRequest(provider, model, tokens = 0, limits = null) {
    const modelLimit = this.getModelLimit(provider, model, limits);
    
    if (this.autoReset) {
      modelLimit.reset();
    }
    
    modelLimit.trackRequest(tokens);
    this.persistState();
  }

  /**
   * Update from response headers
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {Object} headers - Response headers
   */
  updateFromHeaders(provider, model, headers) {
    const modelLimit = this.getModelLimit(provider, model);
    modelLimit.updateFromHeaders(headers);
    this.persistState();
  }

  /**
   * Update from 429 error
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {number} retryAfter - Seconds until retry
   */
  updateFrom429(provider, model, retryAfter = null) {
    const modelLimit = this.getModelLimit(provider, model);
    modelLimit.updateFrom429(retryAfter);
    this.persistState();
  }

  /**
   * Check if provider/model can handle request
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {number} tokens - Tokens needed
   * @returns {boolean} True if available
   */
  isAvailable(provider, model, tokens = 0) {
    if (!this.providers.has(provider)) {
      return true; // No limits tracked yet
    }

    const providerModels = this.providers.get(provider);
    if (!providerModels.has(model)) {
      return true; // No limits tracked yet
    }

    const modelLimit = providerModels.get(model);
    
    if (this.autoReset) {
      modelLimit.reset();
    }
    
    return modelLimit.canMakeRequest(tokens);
  }

  /**
   * Get available capacity
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @returns {Object} Capacity information
   */
  getCapacity(provider, model) {
    if (!this.providers.has(provider)) {
      return {
        requests: Infinity,
        tokens: Infinity,
        requestsToday: Infinity,
        available: true,
        retryAfter: 0
      };
    }

    const providerModels = this.providers.get(provider);
    if (!providerModels.has(model)) {
      return {
        requests: Infinity,
        tokens: Infinity,
        requestsToday: Infinity,
        available: true,
        retryAfter: 0
      };
    }

    const modelLimit = providerModels.get(model);
    
    if (this.autoReset) {
      modelLimit.reset();
    }
    
    return modelLimit.getCapacity();
  }

  /**
   * Reset all limits for provider/model
   * @param {string} provider - Provider name (optional)
   * @param {string} model - Model name (optional)
   */
  resetLimits(provider = null, model = null) {
    if (provider === null) {
      // Reset all
      this.providers.clear();
      this.persistState();
      return;
    }

    if (!this.providers.has(provider)) {
      return;
    }

    if (model === null) {
      // Reset all models for provider
      this.providers.delete(provider);
      this.persistState();
      return;
    }

    // Reset specific model
    const providerModels = this.providers.get(provider);
    if (providerModels.has(model)) {
      providerModels.delete(model);
      this.persistState();
    }
  }

  /**
   * Get all tracked providers
   * @returns {Array<string>} Provider names
   */
  getProviders() {
    return Array.from(this.providers.keys());
  }

  /**
   * Get all tracked models for provider
   * @param {string} provider - Provider name
   * @returns {Array<string>} Model names
   */
  getModels(provider) {
    if (!this.providers.has(provider)) {
      return [];
    }
    return Array.from(this.providers.get(provider).keys());
  }

  /**
   * Persist state to storage
   */
  persistState() {
    if (!this.persistence || typeof this.persistence.save !== 'function') {
      return;
    }

    const state = this.toJSON();
    this.persistence.save(state);
  }

  /**
   * Load state from storage
   */
  loadState() {
    if (!this.persistence || typeof this.persistence.load !== 'function') {
      return;
    }

    const state = this.persistence.load();
    if (state) {
      this.fromJSON(state);
    }
  }

  /**
   * Serialize to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    const state = {};
    
    for (const [provider, models] of this.providers.entries()) {
      state[provider] = {};
      
      for (const [modelName, modelLimit] of models.entries()) {
        state[provider][modelName] = {
          modelName: modelLimit.modelName,
          requestsPerMinute: modelLimit.requestsPerMinute,
          tokensPerMinute: modelLimit.tokensPerMinute,
          requestsPerDay: modelLimit.requestsPerDay,
          requestsUsed: modelLimit.requestsUsed,
          tokensUsed: modelLimit.tokensUsed,
          requestsToday: modelLimit.requestsToday,
          lastReset: modelLimit.lastReset,
          lastDayReset: modelLimit.lastDayReset,
          unavailableUntil: modelLimit.unavailableUntil,
          retryAfter: modelLimit.retryAfter
        };
      }
    }
    
    return state;
  }

  /**
   * Deserialize from JSON
   * @param {Object} state - JSON state
   */
  fromJSON(state) {
    if (!state || typeof state !== 'object') {
      return;
    }

    this.providers.clear();

    for (const [provider, models] of Object.entries(state)) {
      const providerMap = new Map();
      
      for (const [modelName, data] of Object.entries(models)) {
        const modelLimit = new ModelRateLimit(modelName, {
          rpm: data.requestsPerMinute,
          tpm: data.tokensPerMinute,
          rpd: data.requestsPerDay
        });
        
        modelLimit.requestsUsed = data.requestsUsed || 0;
        modelLimit.tokensUsed = data.tokensUsed || 0;
        modelLimit.requestsToday = data.requestsToday || 0;
        modelLimit.lastReset = data.lastReset || Date.now();
        modelLimit.lastDayReset = data.lastDayReset || Date.now();
        modelLimit.unavailableUntil = data.unavailableUntil || null;
        modelLimit.retryAfter = data.retryAfter || null;
        
        providerMap.set(modelName, modelLimit);
      }
      
      this.providers.set(provider, providerMap);
    }
  }

  /**
   * STEP 12: Record performance metrics for a model
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {Object} metrics - Performance metrics
   */
  recordPerformance(provider, model, metrics) {
    const modelLimit = this.getModelLimit(provider, model);
    if (modelLimit) {
      modelLimit.recordPerformance(metrics);
    }
  }

  /**
   * STEP 12: Get average performance for a model
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @returns {Object|null} Average performance metrics
   */
  getAveragePerformance(provider, model) {
    const modelLimit = this.getModelLimit(provider, model);
    return modelLimit ? modelLimit.getAveragePerformance() : null;
  }

  /**
   * STEP 13: Get fastest available models
   * @param {Array<Object>} models - Candidate models
   * @returns {Array<Object>} Models sorted by speed (fastest first)
   */
  sortBySpeed(models) {
    return models.map(model => {
      const perf = this.getAveragePerformance(model.providerType || model.provider, model.name);
      return {
        ...model,
        avgTTFT: perf?.avgTTFT || Infinity
      };
    }).sort((a, b) => a.avgTTFT - b.avgTTFT);
  }

  /**
   * STEP 14: Record successful request
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   */
  recordSuccess(provider, model) {
    const modelLimit = this.getModelLimit(provider, model);
    if (modelLimit) {
      modelLimit.recordSuccess();
    }
  }

  /**
   * STEP 14: Record failed request
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   */
  recordError(provider, model) {
    const modelLimit = this.getModelLimit(provider, model);
    if (modelLimit) {
      modelLimit.recordError();
    }
  }

  /**
   * STEP 14: Get health score for a model
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @returns {number} Health score (0-100)
   */
  getHealthScore(provider, model) {
    const modelLimit = this.getModelLimit(provider, model);
    return modelLimit ? modelLimit.getHealthScore() : 100;
  }

  /**
   * STEP 14: Filter models by health
   * @param {Array<Object>} models - Candidate models
   * @returns {Array<Object>} Healthy models only
   */
  filterByHealth(models) {
    return models.filter(model => {
      const modelLimit = this.getModelLimit(model.providerType || model.provider, model.name);
      return !modelLimit || modelLimit.isHealthy();
    });
  }
}

module.exports = {
  ModelRateLimit,
  RateLimitTracker
};
