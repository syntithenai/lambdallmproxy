/**
 * Content Optimizer Module (STEP 10 & 11)
 * 
 * Dynamically adjusts max_tokens and content input based on:
 * - Selected model's capabilities
 * - Optimization preference (cheap/balanced/powerful)
 * - Rate limit headroom
 * - Request complexity
 * - Current context usage
 */

/**
 * Get optimal max_tokens for a model and request
 * @param {Object} options - Configuration options
 * @param {Object} options.model - Selected model with maxOutput, context_window
 * @param {string} options.optimization - User preference: cheap/balanced/powerful/fastest
 * @param {string} options.requestType - SIMPLE/COMPLEX/REASONING/CREATIVE/TOOL_HEAVY
 * @param {number} options.inputTokens - Estimated input tokens
 * @param {Object} options.rateLimitTracker - Rate limit tracker (optional)
 * @param {string} options.provider - Provider type (optional)
 * @returns {number} Optimal max_tokens value
 */
function getOptimalMaxTokens(options = {}) {
  const {
    model,
    optimization = 'cheap',
    requestType = 'SIMPLE',
    inputTokens = 1000,
    rateLimitTracker = null,
    provider = null
  } = options;

  if (!model) {
    // Safe default
    return 4096;
  }

  // Get model's maximum output capability
  const modelMaxOutput = model.maxOutput || model.max_output || 16384;
  const modelContextWindow = model.context_window || 128000;

  // Base multiplier by optimization preference
  const optimizationMultipliers = {
    'cheap': 0.5,      // Shorter responses to save costs/rate limits
    'balanced': 1.0,   // Standard responses
    'powerful': 1.5,   // Longer, more detailed responses
    'fastest': 0.7     // Shorter for speed
  };

  const multiplier = optimizationMultipliers[optimization] || 1.0;

  // Base max_tokens by request type
  let baseMaxTokens = 4096; // Conservative default
  
  switch (requestType) {
    case 'SIMPLE':
      baseMaxTokens = 2048;  // Short answers
      break;
    case 'COMPLEX':
      baseMaxTokens = 8192;  // Detailed analysis
      break;
    case 'REASONING':
      baseMaxTokens = 16384; // Long reasoning chains
      break;
    case 'CREATIVE':
      baseMaxTokens = 8192;  // Creative content generation
      break;
    case 'TOOL_HEAVY':
      baseMaxTokens = 4096;  // Tool results need processing
      break;
  }

  // Apply optimization multiplier
  let optimalTokens = Math.round(baseMaxTokens * multiplier);

  // Constrain by model capabilities
  optimalTokens = Math.min(optimalTokens, modelMaxOutput);

  // Ensure we leave room for input in context window
  const availableContext = modelContextWindow - inputTokens;
  optimalTokens = Math.min(optimalTokens, Math.floor(availableContext * 0.8)); // Use max 80% of available

  // Check rate limit headroom if available
  if (rateLimitTracker && provider && model.name) {
    const isRateLimitConstrained = !rateLimitTracker.isAvailable(provider, model.name, optimalTokens);
    
    if (isRateLimitConstrained) {
      // Reduce by 50% if rate limited
      optimalTokens = Math.round(optimalTokens * 0.5);
      console.log(`⚠️ Rate limit constrained, reducing max_tokens to ${optimalTokens}`);
    }
  }

  // Ensure minimum reasonable value
  optimalTokens = Math.max(optimalTokens, 512);

  return optimalTokens;
}

/**
 * Get optimal search result count based on model capacity (STEP 11)
 * @param {Object} options - Configuration options
 * @param {Object} options.model - Selected model
 * @param {number} options.inputTokens - Current input tokens
 * @param {string} options.optimization - User preference
 * @returns {number} Optimal number of search results (1-10)
 */
function getOptimalSearchResultCount(options = {}) {
  const {
    model,
    inputTokens = 1000,
    optimization = 'cheap'
  } = options;

  if (!model) {
    return 3; // Conservative default
  }

  const contextWindow = model.context_window || 128000;
  const availableContext = contextWindow - inputTokens;

  // Each search result ~2000 tokens (title + snippet + content)
  const tokensPerResult = 2000;

  // Calculate how many results we can fit
  let maxResults = Math.floor(availableContext / (tokensPerResult * 2)); // Leave 50% headroom

  // Apply optimization preference
  if (optimization === 'cheap') {
    maxResults = Math.min(maxResults, 3); // Limit to 3 for cheap
  } else if (optimization === 'powerful' && contextWindow > 1000000) {
    maxResults = Math.min(maxResults, 10); // Up to 10 for large context models
  } else {
    maxResults = Math.min(maxResults, 5); // 5 for balanced
  }

  // Ensure reasonable bounds
  return Math.max(1, Math.min(maxResults, 10));
}

/**
 * Get optimal content truncation length for web pages/transcripts (STEP 11)
 * @param {Object} options - Configuration options
 * @param {Object} options.model - Selected model
 * @param {number} options.inputTokens - Current input tokens
 * @param {string} options.optimization - User preference
 * @param {string} options.contentType - 'webpage' or 'transcript'
 * @returns {number} Maximum characters to include (approximation)
 */
function getOptimalContentLength(options = {}) {
  const {
    model,
    inputTokens = 1000,
    optimization = 'cheap',
    contentType = 'webpage'
  } = options;

  if (!model) {
    return 10000; // Conservative default (~2500 tokens)
  }

  const contextWindow = model.context_window || 128000;
  const availableContext = contextWindow - inputTokens;

  // Rough estimate: 1 token ≈ 4 characters
  let maxChars = availableContext * 4 * 0.3; // Use 30% of available context

  // Adjust by content type
  if (contentType === 'transcript') {
    // Transcripts can be verbose, be more generous
    maxChars *= 1.5;
  }

  // Apply optimization preference
  const optimizationFactors = {
    'cheap': 0.5,      // Aggressive truncation
    'balanced': 1.0,   // Standard
    'powerful': 2.0,   // Generous, especially for large context models
    'fastest': 0.7     // Moderate truncation for speed
  };

  maxChars *= (optimizationFactors[optimization] || 1.0);

  // Large context models (>1M tokens) can handle much more
  if (contextWindow > 1000000) {
    maxChars = Math.max(maxChars, 100000); // At least 100k chars for large models
  }

  // Ensure reasonable bounds
  return Math.max(5000, Math.min(maxChars, 500000));
}

/**
 * Get optimization summary for logging
 * @param {Object} options - All optimization parameters
 * @returns {Object} Summary of optimization decisions
 */
function getOptimizationSummary(options = {}) {
  return {
    maxTokens: getOptimalMaxTokens(options),
    searchResults: getOptimalSearchResultCount(options),
    contentLength: getOptimalContentLength(options),
    reasoning: {
      model: options.model?.name || 'unknown',
      contextWindow: options.model?.context_window || 0,
      optimization: options.optimization || 'cheap',
      requestType: options.requestType || 'SIMPLE',
      inputTokens: options.inputTokens || 0
    }
  };
}

module.exports = {
  getOptimalMaxTokens,
  getOptimalSearchResultCount,
  getOptimalContentLength,
  getOptimizationSummary
};
