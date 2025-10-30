/**
 * Provider Factory
 * 
 * Creates provider instances based on provider configuration.
 * Routes to the appropriate provider implementation based on type.
 */

const { BaseProvider } = require('./base-provider');

// Import provider implementations
const { GroqProvider } = require('./groq-provider');
const { OpenAIProvider } = require('./openai-provider');
const AnthropicProvider = require('./anthropic-provider');
// const { GeminiProvider } = require('./gemini-provider');
// const { OpenAICompatibleProvider } = require('./openai-compatible-provider');

/**
 * Provider type to class mapping
 * Maps provider types to their implementation classes
 */
const PROVIDER_CLASSES = {
  'groq': GroqProvider,
  'groq-free': GroqProvider,
  'openai': OpenAIProvider,
  'together': OpenAIProvider, // Together AI is OpenAI-compatible
  'anthropic': AnthropicProvider,
  // 'gemini': GeminiProvider,
  // 'gemini-free': GeminiProvider,
  // 'openai-compatible': OpenAICompatibleProvider
};

/**
 * Create a provider instance from configuration
 * @param {Object} config - Provider configuration
 * @param {string} config.id - Provider ID
 * @param {string} config.type - Provider type (groq, openai, gemini, etc.)
 * @param {string} config.apiKey - API key
 * @param {string} config.apiEndpoint - API endpoint (optional, auto-filled for known providers)
 * @param {string} config.modelName - Model name (for openai-compatible)
 * @param {number} config.rateLimitTPM - Rate limit in tokens per minute (for openai-compatible)
 * @param {string} config.source - Source of provider (user or environment)
 * @returns {BaseProvider} Provider instance
 * @throws {Error} If provider type is not supported or configuration is invalid
 */
function createProvider(config) {
  // Validate config
  if (!config || typeof config !== 'object') {
    throw new Error('Provider config must be an object');
  }

  if (!config.type) {
    throw new Error('Provider config must have a type');
  }

  if (!config.apiKey) {
    throw new Error('Provider config must have an apiKey');
  }

  // Get provider class
  const ProviderClass = PROVIDER_CLASSES[config.type];

  if (!ProviderClass) {
    throw new Error(`Unsupported provider type: ${config.type}`);
  }

  // Create and return provider instance
  try {
    const provider = new ProviderClass(config);
    console.log(`✅ Created provider: ${config.type} (id: ${config.id}, source: ${config.source})`);
    return provider;
  } catch (error) {
    console.error(`❌ Failed to create provider ${config.type}:`, error.message);
    throw new Error(`Failed to create provider ${config.type}: ${error.message}`);
  }
}

/**
 * Create multiple provider instances from an array of configurations
 * @param {Array<Object>} configs - Array of provider configurations
 * @returns {Array<BaseProvider>} Array of provider instances
 */
function createProviders(configs) {
  if (!Array.isArray(configs)) {
    throw new Error('Configs must be an array');
  }

  const providers = [];
  const errors = [];

  for (const config of configs) {
    try {
      const provider = createProvider(config);
      providers.push(provider);
    } catch (error) {
      errors.push({
        config,
        error: error.message
      });
      console.error(`❌ Skipping provider ${config.type}:`, error.message);
    }
  }

  if (errors.length > 0) {
    console.warn(`⚠️ Created ${providers.length} providers, ${errors.length} failed`);
  } else {
    console.log(`✅ Created ${providers.length} provider(s)`);
  }

  return providers;
}

/**
 * Get list of supported provider types
 * @returns {Array<string>} List of supported provider types
 */
function getSupportedProviderTypes() {
  return Object.keys(PROVIDER_CLASSES);
}

/**
 * Check if a provider type is supported
 * @param {string} type - Provider type to check
 * @returns {boolean} True if provider type is supported
 */
function isProviderTypeSupported(type) {
  return type in PROVIDER_CLASSES;
}

module.exports = {
  createProvider,
  createProviders,
  getSupportedProviderTypes,
  isProviderTypeSupported,
  PROVIDER_CLASSES // Export for testing/extension
};
