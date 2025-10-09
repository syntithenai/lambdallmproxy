/**
 * Credential Pool Management
 * Loads environment-based providers and merges with user-provided credentials
 */

// Simple UUID v4 generator (no external dependencies)
function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
const uuidv4 = generateUuid;

/**
 * Load providers from environment variables
 * Reads indexed environment variables in the format:
 * - LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=groq-free
 * - LLAMDA_LLM_PROXY_PROVIDER_KEY_0=gsk_...
 * - LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_0=https://api.groq.com/openai/v1 (optional)
 * - LLAMDA_LLM_PROXY_PROVIDER_MODEL_0=llama-3.1-70b-instruct (optional, for openai-compatible)
 * - LLAMDA_LLM_PROXY_PROVIDER_RATE_LIMIT_0=10000 (optional, TPM for openai-compatible)
 * 
 * @returns {Array<Object>} Array of provider configurations
 */
function loadEnvironmentProviders() {
    const providers = [];
    let index = 0;
    
    // Read indexed environment variables
    while (true) {
        const typeKey = `LLAMDA_LLM_PROXY_PROVIDER_TYPE_${index}`;
        const keyKey = `LLAMDA_LLM_PROXY_PROVIDER_KEY_${index}`;
        const endpointKey = `LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_${index}`;
        const modelKey = `LLAMDA_LLM_PROXY_PROVIDER_MODEL_${index}`;
        const rateLimitKey = `LLAMDA_LLM_PROXY_PROVIDER_RATE_LIMIT_${index}`;
        
        const type = process.env[typeKey];
        const apiKey = process.env[keyKey];
        
        // Stop when no more providers found
        if (!type || !apiKey) {
            break;
        }
        
        // Build provider config
        const provider = {
            id: `env-provider-${index}`,
            type: type,
            apiKey: apiKey,
            source: 'environment'
        };
        
        // Add optional endpoint (for openai-compatible)
        if (process.env[endpointKey]) {
            provider.apiEndpoint = process.env[endpointKey];
        }
        
        // Add optional model name (for openai-compatible)
        if (process.env[modelKey]) {
            provider.modelName = process.env[modelKey];
        }
        
        // Add optional rate limit (for openai-compatible)
        if (process.env[rateLimitKey]) {
            provider.rateLimitTPM = parseInt(process.env[rateLimitKey], 10);
        }
        
        providers.push(provider);
        console.log(`📦 Loaded environment provider ${index}: ${type} (source: environment)`);
        
        index++;
    }
    
    if (providers.length > 0) {
        console.log(`✅ Loaded ${providers.length} environment provider(s)`);
    } else {
        console.log(`ℹ️ No environment providers configured`);
    }
    
    return providers;
}

/**
 * Build provider pool by merging user providers with environment providers
 * @param {Array<Object>} userProviders - Providers from user's settings
 * @param {boolean} isAuthorized - Whether user is authorized (in ALLOWED_EMAILS)
 * @returns {Array<Object>} Combined provider pool
 */
function buildProviderPool(userProviders = [], isAuthorized = false) {
    const pool = [];
    
    // Add user providers (always included, regardless of authorization)
    if (userProviders && Array.isArray(userProviders) && userProviders.length > 0) {
        const validUserProviders = userProviders.filter(p => {
            // Validate required fields
            if (!p.type || !p.apiKey) {
                console.warn(`⚠️ Skipping invalid user provider: missing type or apiKey`);
                return false;
            }
            return true;
        });
        
        // Mark user providers with source
        validUserProviders.forEach(p => {
            pool.push({
                ...p,
                source: 'user'
            });
        });
        
        console.log(`👤 Added ${validUserProviders.length} user provider(s) to pool`);
    }
    
    // Add environment providers ONLY if user is authorized
    if (isAuthorized) {
        const envProviders = loadEnvironmentProviders();
        envProviders.forEach(p => pool.push(p));
        console.log(`🔓 User authorized: added ${envProviders.length} environment provider(s)`);
    } else {
        console.log(`🔒 User not authorized: environment providers not available`);
    }
    
    console.log(`🎯 Final provider pool size: ${pool.length} provider(s)`);
    
    return pool;
}

/**
 * Check if user has any available providers (user + environment if authorized)
 * @param {Array<Object>} userProviders - Providers from user's settings
 * @param {boolean} isAuthorized - Whether user is authorized
 * @returns {boolean} True if user has at least one provider
 */
function hasAvailableProviders(userProviders = [], isAuthorized = false) {
    // Count valid user providers
    const validUserProviders = (userProviders || []).filter(p => p.type && p.apiKey);
    const userProviderCount = validUserProviders.length;
    
    // If authorized, also count environment providers
    if (isAuthorized) {
        const envProviders = loadEnvironmentProviders();
        const totalCount = userProviderCount + envProviders.length;
        return totalCount > 0;
    }
    
    // Not authorized, only user providers count
    return userProviderCount > 0;
}

module.exports = {
    loadEnvironmentProviders,
    buildProviderPool,
    hasAvailableProviders
};
