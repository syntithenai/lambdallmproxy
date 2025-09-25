/**
 * Provider configuration and model parsing utilities
 */

// Provider configuration
const PROVIDERS = {
    openai: {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        envKey: 'OPENAI_API_KEY',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-3.5-turbo']
    },
    groq: {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        envKey: 'GROQ_API_KEY',
        models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768']
    }
};

/**
 * Parse provider and model from a model string like "groq:llama-3.1-8b-instant"
 * @param {string} modelString - The model string to parse
 * @returns {Object} - {provider, model}
 */
function parseProviderModel(modelString) {
    if (!modelString || typeof modelString !== 'string') {
        return { provider: 'groq', model: 'llama-3.1-8b-instant' };
    }
    
    const [provider, ...modelParts] = modelString.split(':');
    const model = modelParts.join(':') || 'llama-3.1-8b-instant';
    return { provider: provider || 'groq', model };
}

/**
 * Get provider configuration
 * @param {string} provider - Provider name
 * @returns {Object} - Provider configuration
 */
function getProviderConfig(provider) {
    return PROVIDERS[provider] || PROVIDERS.groq;
}

module.exports = {
    PROVIDERS,
    parseProviderModel,
    getProviderConfig
};