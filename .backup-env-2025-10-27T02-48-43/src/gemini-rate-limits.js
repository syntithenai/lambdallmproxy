/**
 * Gemini API Rate Limits and Model Configuration
 * 
 * Gemini API free tier limits (as of January 2025):
 * - 15 RPM (requests per minute)
 * - 1M TPM (tokens per minute) for free tier
 * - 4M TPM for paid tier
 * 
 * Context windows:
 * - Gemini 2.5 Flash: 1,048,576 tokens (1M)
 * - Gemini 2.5 Pro: 1,048,576 tokens (1M)  
 * - Gemini 2.0 Flash: 2,097,152 tokens (2M)
 * - Gemini 1.5 Flash: 1,048,576 tokens (1M)
 * - Gemini 1.5 Pro: 2,097,152 tokens (2M)
 */

const GEMINI_RATE_LIMITS = {
  'gemini-2.5-flash': {
    rpm: 15,               // Requests per minute (free tier)
    tpm: 1000000,          // Tokens per minute (free tier)
    context_window: 1048576, // 1M token context window
    output_limit: 8192,    // Max output tokens
    paid_tpm: 4000000      // Tokens per minute (paid tier)
  },
  'gemini-2.5-pro': {
    rpm: 15,
    tpm: 1000000,
    context_window: 1048576, // 1M token context window
    output_limit: 8192,
    paid_tpm: 4000000
  },
  'gemini-2.0-flash': {
    rpm: 15,
    tpm: 1000000,
    context_window: 2097152, // 2M token context window (largest!)
    output_limit: 8192,
    paid_tpm: 4000000
  },
  'gemini-1.5-flash': {
    rpm: 15,
    tpm: 1000000,
    context_window: 1048576, // 1M token context window
    output_limit: 8192,
    paid_tpm: 4000000
  },
  'gemini-1.5-pro': {
    rpm: 15,
    tpm: 1000000,
    context_window: 2097152, // 2M token context window
    output_limit: 8192,
    paid_tpm: 4000000
  }
};

/**
 * Get rate limit info for a Gemini model
 * @param {string} modelName - Model name (e.g., 'gemini-2.5-flash')
 * @returns {Object|null} Rate limit configuration or null if unknown
 */
function getGeminiLimits(modelName) {
  return GEMINI_RATE_LIMITS[modelName] || null;
}

/**
 * Check if a model has large context capability (>1M tokens)
 * @param {string} modelName - Model name
 * @returns {boolean} True if model supports >1M token context
 */
function hasLargeContext(modelName) {
  const limits = getGeminiLimits(modelName);
  return limits && limits.context_window >= 1048576; // All Gemini models have >=1M
}

/**
 * Check if a model has ultra-large context capability (>1.5M tokens)
 * @param {string} modelName - Model name
 * @returns {boolean} True if model supports >1.5M token context
 */
function hasUltraLargeContext(modelName) {
  const limits = getGeminiLimits(modelName);
  return limits && limits.context_window >= 2000000; // 2.0-flash and 1.5-pro
}

/**
 * Get all Gemini model names
 * @returns {Array<string>} List of model names
 */
function getAllGeminiModels() {
  return Object.keys(GEMINI_RATE_LIMITS);
}

module.exports = {
  GEMINI_RATE_LIMITS,
  getGeminiLimits,
  hasLargeContext,
  hasUltraLargeContext,
  getAllGeminiModels
};
