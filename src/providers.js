/**
 * Provider configuration and model parsing utilities
 */

// Provider configuration
// Note: API keys are now loaded via credential-pool.js from indexed environment variables
const PROVIDERS = {
    openai: {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-3.5-turbo']
    },
    groq: {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        models: [
            'llama-3.1-8b-instant',
            'llama-3.3-70b-versatile',
            'mixtral-8x7b-32768',
            'openai/gpt-oss-20b',
            'openai/gpt-oss-120b',
            'qwen/qwen3-32b',
            'meta-llama/llama-4-scout-17b-16e-instruct',
            'meta-llama/llama-4-maverick-17b-128e-instruct',
            'moonshotai/kimi-k2-instruct-0905'
        ]
    },
    gemini: {
        hostname: 'generativelanguage.googleapis.com',
        path: '/v1beta/openai/v1/chat/completions',
        models: [
            'gemini-2.5-flash',    // 1M context, best for large context
            'gemini-2.5-pro',      // 1M context, highest quality
            'gemini-2.0-flash',    // 2M context, ultra-large context
            'gemini-1.5-flash',    // 1M context, legacy
            'gemini-1.5-pro'       // 2M context, legacy
        ]
    },
    together: {
        hostname: 'api.together.xyz',
        path: '/v1/chat/completions',
        models: [
            'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
            'meta-llama/Llama-4-Scout-17B-16E-Instruct',
            'meta-llama/Llama-3.3-70B-Instruct-Turbo',
            'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
            'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
            'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
            'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
            'deepseek-ai/DeepSeek-V3.1',
            'deepseek-ai/DeepSeek-V3',
            'deepseek-ai/DeepSeek-R1',
            'deepseek-ai/DeepSeek-R1-0528-tput',
            'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
            'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
            'Qwen/Qwen2.5-72B-Instruct-Turbo',
            'Qwen/Qwen2.5-7B-Instruct-Turbo',
            'Qwen/Qwen2.5-Coder-32B-Instruct',
            'moonshotai/Kimi-K2-Instruct',
            'mistralai/Mistral-Small-24B-Instruct-2501',
            'zai-org/GLM-4.5-Air-FP8'
        ]
    },
    atlascloud: {
        hostname: 'api.atlascloud.ai',
        path: '/v1/chat/completions',
        models: [
            'claude-3-7-sonnet-20250219',
            'claude-3-5-haiku-20241022',
            'gemini-2.5-flash',
            'gemini-2.5-flash-lite',
            'gemini-2.5-pro',
            'zai-org/GLM-4.5-Air',
            'zai-org/GLM-4.5',
            'deepseek-ai/DeepSeek-V3',
            'deepseek-ai/DeepSeek-R1',
            'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
            'meta-llama/Llama-3.3-70B-Instruct-Turbo',
            'meta-llama/Llama-3.1-405B-Instruct-Turbo',
            'meta-llama/Llama-3.1-70B-Instruct-Turbo',
            'meta-llama/Llama-3.1-8B-Instruct-Turbo',
            'Qwen/Qwen2.5-72B-Instruct-Turbo',
            'Qwen/Qwen2.5-Coder-32B-Instruct',
            'mistralai/Mistral-Small-24B-Instruct-2501',
            'moonshotai/Kimi-K2-Instruct'
        ]
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
    
    // Check for explicit provider prefix (e.g., "groq:llama-3.1-8b-instant")
    if (modelString.includes(':')) {
        const [provider, ...modelParts] = modelString.split(':');
        const model = modelParts.join(':') || 'llama-3.1-8b-instant';
        return { provider: provider || 'groq', model };
    }
    
    // Models with openai/, qwen/, meta-llama/, moonshotai/ prefixes are Groq models
    if (modelString.startsWith('openai/') || 
        modelString.startsWith('qwen/') || 
        modelString.startsWith('meta-llama/') ||
        modelString.startsWith('moonshotai/')) {
        return { provider: 'groq', model: modelString };
    }
    
    // Default to Groq provider for all other models
    return { provider: 'groq', model: modelString };
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