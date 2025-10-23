/**
 * Base Provider Interface
 * 
 * Abstract base class for all LLM provider implementations.
 * Provides a unified interface for making requests, handling streaming,
 * and parsing rate limits.
 */

/**
 * Abstract base class for LLM providers
 */
class BaseProvider {
  constructor(config) {
    if (this.constructor === BaseProvider) {
      throw new Error('BaseProvider is abstract and cannot be instantiated directly');
    }
    
    this.config = config;
    this.type = config.type;
    this.apiKey = config.apiKey;
    this.apiEndpoint = config.apiEndpoint;
    this.id = config.id || 'unknown';
    this.source = config.source || 'unknown';
  }

  /**
   * Get the API endpoint URL for this provider
   * @returns {string} Full API endpoint URL
   */
  getEndpoint() {
    throw new Error('getEndpoint() must be implemented by subclass');
  }

  /**
   * Get headers for API requests
   * @returns {Object} Request headers
   */
  getHeaders() {
    throw new Error('getHeaders() must be implemented by subclass');
  }

  /**
   * Build request body for chat completion
   * @param {Array} messages - Chat messages
   * @param {Object} options - Request options (temperature, max_tokens, etc.)
   * @returns {Object} Request body
   */
  buildRequestBody(messages, options = {}) {
    throw new Error('buildRequestBody() must be implemented by subclass');
  }

  /**
   * Make a non-streaming request to the provider
   * @param {Array} messages - Chat messages
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async makeRequest(messages, options = {}) {
    throw new Error('makeRequest() must be implemented by subclass');
  }

  /**
   * Make a streaming request to the provider
   * @param {Array} messages - Chat messages
   * @param {Object} options - Request options
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise<void>}
   */
  async streamRequest(messages, options = {}, onChunk) {
    throw new Error('streamRequest() must be implemented by subclass');
  }

  /**
   * Parse rate limit information from response headers
   * @param {Object} headers - Response headers
   * @returns {Object} Rate limit info {requestsLimit, requestsRemaining, tokensLimit, tokensRemaining, resetTime}
   */
  parseRateLimits(headers) {
    // Default implementation - can be overridden by subclasses
    return {
      requestsLimit: null,
      requestsRemaining: null,
      tokensLimit: null,
      tokensRemaining: null,
      resetTime: null
    };
  }

  /**
   * Get supported models for this provider
   * @returns {Array<string>} List of supported model names
   */
  getSupportedModels() {
    throw new Error('getSupportedModels() must be implemented by subclass');
  }

  /**
   * Check if a specific model is supported by this provider
   * @param {string} modelName - Model name to check
   * @returns {boolean} True if model is supported
   */
  supportsModel(modelName) {
    const models = this.getSupportedModels();
    return models.includes(modelName);
  }

  /**
   * Handle API errors and convert to standard format
   * @param {Error} error - Original error
   * @param {Object} context - Error context (request details, etc.)
   * @returns {Error} Standardized error
   */
  handleError(error, context = {}) {
    const standardError = new Error(error.message || 'Unknown provider error');
    standardError.code = error.code || 'PROVIDER_ERROR';
    standardError.provider = this.type;
    standardError.providerId = this.id;
    standardError.context = context;
    standardError.originalError = error;
    
    // Check for rate limit errors
    // Covers multiple variations: "rate limit", "Request too large", "tokens per minute (TPM)"
    const isRateLimitError = error.statusCode === 429 || 
                             error.message?.toLowerCase().includes('rate limit') ||
                             error.message?.includes('Request too large') ||
                             error.message?.includes('tokens per minute') ||
                             error.message?.includes('TPM');
    
    if (isRateLimitError) {
      standardError.code = 'RATE_LIMIT_EXCEEDED';
      standardError.retryable = true;
    }
    
    // Check for authentication errors
    if (error.statusCode === 401 || error.statusCode === 403) {
      standardError.code = 'AUTHENTICATION_ERROR';
      standardError.retryable = false;
    }
    
    // Check for timeout errors
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      standardError.code = 'TIMEOUT';
      standardError.retryable = true;
    }
    
    // Check for network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      standardError.code = 'NETWORK_ERROR';
      standardError.retryable = true;
    }
    
    return standardError;
  }

  /**
   * Estimate tokens for a message array
   * Basic estimation: ~4 characters per token
   * @param {Array} messages - Chat messages
   * @returns {number} Estimated token count
   */
  estimateTokens(messages) {
    if (!Array.isArray(messages)) {
      return 0;
    }
    
    let totalChars = 0;
    for (const msg of messages) {
      if (msg.content && typeof msg.content === 'string') {
        totalChars += msg.content.length;
      }
      if (msg.role) {
        totalChars += msg.role.length;
      }
    }
    
    // Rough estimation: 4 characters per token
    return Math.ceil(totalChars / 4);
  }

  /**
   * Get provider info for display
   * @returns {Object} Provider display info
   */
  getInfo() {
    return {
      id: this.id,
      type: this.type,
      source: this.source,
      endpoint: this.getEndpoint(),
      supportedModels: this.getSupportedModels()
    };
  }

  /**
   * Log provider activity
   * @param {string} message - Log message
   * @param {Object} data - Additional data to log
   */
  log(message, data = {}) {
    console.log(`[${this.type}:${this.id}] ${message}`, data);
  }
}

module.exports = {
  BaseProvider
};
