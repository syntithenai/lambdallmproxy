/**
 * Provider Health and Availability Checker
 * 
 * Checks if image generation providers are available by:
 * 1. Verifying API keys exist in environment
 * 2. Checking enable/disable flags
 * 3. Consulting circuit breaker state
 * 4. (Optional) Pinging health endpoints
 */

const { isAvailable: isCircuitAvailable, getState } = require('./circuit-breaker');

// Cache for availability checks (5 minutes TTL)
const availabilityCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if provider has required API key configured
 */
function hasApiKey(provider) {
  const envVarMap = {
    'openai': 'OPENAI_API_KEY',
    'together': 'TOGETHER_API_KEY',
    'gemini': 'GEMINI_API_KEY',
    'replicate': 'REPLICATE_API_TOKEN'
  };
  
  const envVar = envVarMap[provider.toLowerCase()];
  if (!envVar) return false;
  
  const apiKey = process.env[envVar];
  return apiKey && apiKey.trim().length > 0;
}

/**
 * Check if provider is enabled via feature flag
 */
function isEnabled(provider) {
  const envVar = `ENABLE_IMAGE_GENERATION_${provider.toUpperCase()}`;
  const value = process.env[envVar];
  
  // If not explicitly set, default to true if API key exists
  if (value === undefined || value === '') {
    return hasApiKey(provider);
  }
  
  return value === 'true' || value === '1';
}

/**
 * Get cached availability or null if expired/missing
 */
function getCachedAvailability(provider) {
  const cached = availabilityCache.get(provider);
  if (!cached) return null;
  
  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL) {
    availabilityCache.delete(provider);
    return null;
  }
  
  return cached.result;
}

/**
 * Cache availability result
 */
function cacheAvailability(provider, result) {
  availabilityCache.set(provider, {
    result,
    timestamp: Date.now()
  });
}

/**
 * Check provider availability (with caching)
 * 
 * @param {string} provider - Provider name (openai, together, gemini, replicate)
 * @param {boolean} skipCache - Force fresh check
 * @returns {Promise<Object>} - {available, reason, details}
 */
async function checkProviderAvailability(provider, skipCache = false) {
  // Check cache first
  if (!skipCache) {
    const cached = getCachedAvailability(provider);
    if (cached) {
      return cached;
    }
  }
  
  const result = {
    provider,
    available: false,
    reason: '',
    details: {},
    lastCheck: new Date().toISOString()
  };
  
  // Check 1: API key exists
  const keyExists = hasApiKey(provider);
  result.details.hasApiKey = keyExists;
  
  if (!keyExists) {
    result.reason = `No API key configured for ${provider}`;
    cacheAvailability(provider, result);
    return result;
  }
  
  // Check 2: Feature flag enabled
  const enabled = isEnabled(provider);
  result.details.enabled = enabled;
  
  if (!enabled) {
    result.reason = `Image generation disabled for ${provider}`;
    cacheAvailability(provider, result);
    return result;
  }
  
  // Check 3: Circuit breaker state
  const circuitAvailable = isCircuitAvailable(provider);
  const circuitState = getState(provider);
  result.details.circuitState = circuitState;
  result.details.circuitAvailable = circuitAvailable;
  
  if (!circuitAvailable) {
    result.reason = `Circuit breaker ${circuitState} for ${provider}`;
    cacheAvailability(provider, result);
    return result;
  }
  
  // All checks passed
  result.available = true;
  result.reason = 'Available';
  
  // Optional: Add health check ping here in future
  // const health = await pingProviderHealth(provider);
  // result.details.health = health;
  
  cacheAvailability(provider, result);
  return result;
}

/**
 * Check availability for multiple providers
 */
async function checkMultipleProviders(providers) {
  const checks = await Promise.all(
    providers.map(p => checkProviderAvailability(p))
  );
  
  return checks.reduce((acc, check) => {
    acc[check.provider] = check;
    return acc;
  }, {});
}

/**
 * Get all configured image generation providers
 */
function getAllImageProviders() {
  return ['openai', 'together', 'gemini', 'replicate'];
}

/**
 * Get health status for all providers
 */
async function getProviderHealthStatus() {
  const providers = getAllImageProviders();
  const statuses = await checkMultipleProviders(providers);
  
  return {
    timestamp: new Date().toISOString(),
    providers: statuses,
    summary: {
      total: providers.length,
      available: Object.values(statuses).filter(s => s.available).length,
      unavailable: Object.values(statuses).filter(s => !s.available).length
    }
  };
}

/**
 * Clear availability cache for provider or all
 */
function clearCache(provider = null) {
  if (provider) {
    availabilityCache.delete(provider);
  } else {
    availabilityCache.clear();
  }
}

module.exports = {
  checkProviderAvailability,
  checkMultipleProviders,
  getAllImageProviders,
  getProviderHealthStatus,
  hasApiKey,
  isEnabled,
  clearCache
};
