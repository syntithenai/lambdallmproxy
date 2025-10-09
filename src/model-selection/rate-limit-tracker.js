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
   * Update from response headers
   * @param {Object} headers - HTTP response headers
   */
  updateFromHeaders(headers) {
    // Parse x-ratelimit-* headers
    const remaining = this.parseHeader(headers['x-ratelimit-remaining-requests']);
    const limit = this.parseHeader(headers['x-ratelimit-limit-requests']);
    const reset = this.parseHeader(headers['x-ratelimit-reset-requests']);
    
    const tokensRemaining = this.parseHeader(headers['x-ratelimit-remaining-tokens']);
    const tokensLimit = this.parseHeader(headers['x-ratelimit-limit-tokens']);

    // Update limits if present
    if (limit !== null) {
      this.requestsPerMinute = limit;
      if (remaining !== null) {
        this.requestsUsed = limit - remaining;
      }
    }

    if (tokensLimit !== null) {
      this.tokensPerMinute = tokensLimit;
      if (tokensRemaining !== null) {
        this.tokensUsed = tokensLimit - tokensRemaining;
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
}

module.exports = {
  ModelRateLimit,
  RateLimitTracker
};
