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
 * - LLAMDA_LLM_PROXY_PROVIDER_TYPE_N=groq-free
 * - LLAMDA_LLM_PROXY_PROVIDER_KEY_N=gsk_...
 * - LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_N=https://api.groq.com/openai/v1 (optional)
 * - LLAMDA_LLM_PROXY_PROVIDER_MODEL_N=llama-3.1-70b-instruct (optional, for openai-compatible)
 * - LLAMDA_LLM_PROXY_PROVIDER_RATE_LIMIT_N=10000 (optional, TPM for openai-compatible)
 * 
 * Where N can be any non-negative integer (0, 1, 2, 5, 10, etc.)
 * Scans indices 0-99 to find all configured providers, allowing gaps in numbering
 * 
 * @returns {Array<Object>} Array of provider configurations
 */
function loadEnvironmentProviders() {
    const providers = [];
    const MAX_PROVIDER_INDEX = 99; // Scan up to index 99
    
    // Scan all possible indices (allows gaps in numbering)
    for (let index = 0; index <= MAX_PROVIDER_INDEX; index++) {
        const typeKey = `LLAMDA_LLM_PROXY_PROVIDER_TYPE_${index}`;
        const keyKey = `LLAMDA_LLM_PROXY_PROVIDER_KEY_${index}`;
        const endpointKey = `LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_${index}`;
        const modelKey = `LLAMDA_LLM_PROXY_PROVIDER_MODEL_${index}`;
        const rateLimitKey = `LLAMDA_LLM_PROXY_PROVIDER_RATE_LIMIT_${index}`;
        
        const type = process.env[typeKey];
        const apiKey = process.env[keyKey];
        
        // Skip if provider not configured at this index
        if (!type || !apiKey) {
            continue;
        }
        
        // Build provider config
        const provider = {
            id: `env-provider-${index}`,
            type: type,
            apiKey: apiKey,
            source: 'environment',
            index: index // Track original index for debugging
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
    }
    
    if (providers.length > 0) {
        console.log(`✅ Loaded ${providers.length} environment provider(s) (scanned indices 0-${MAX_PROVIDER_INDEX})`);
    } else {
        console.log(`ℹ️ No environment providers configured (scanned indices 0-${MAX_PROVIDER_INDEX})`);
    }
    
    return providers;
}

/**
 * Get available models for a provider type from catalog
 * @param {string} providerType - Provider type (e.g., 'groq-free')
 * @returns {Array<string>} Array of model IDs
 */
function getAvailableModelsForProvider(providerType) {
    try {
        const catalogPath = require('path').join(__dirname, '..', 'PROVIDER_CATALOG.json');
        const catalog = require(catalogPath);
        
        if (catalog && catalog.chat && catalog.chat.providers && catalog.chat.providers[providerType]) {
            const provider = catalog.chat.providers[providerType];
            if (provider.models) {
                // Filter out guardrail models and get available models
                const models = Object.keys(provider.models).filter(modelId => {
                    const model = provider.models[modelId];
                    return model.available && !model.guardrailModel;
                });
                return models;
            }
        }
    } catch (error) {
        console.warn(`⚠️ Could not load catalog for ${providerType}:`, error.message);
    }
    return [];
}

/**
 * Expand a single provider into multiple providers (one per model) for load balancing
 * @param {Object} provider - Provider configuration
 * @returns {Array<Object>} Array of expanded providers
 */
function expandProviderForLoadBalancing(provider) {
    // Only expand groq-free and groq providers
    if (provider.type !== 'groq-free' && provider.type !== 'groq') {
        return [provider]; // Return as-is for other providers
    }
    
    // If provider already has a specific model set, don't expand
    if (provider.modelName || provider.model) {
        return [provider];
    }
    
    // Get available models for this provider type
    const models = getAvailableModelsForProvider(provider.type);
    
    if (models.length === 0) {
        console.warn(`⚠️ No models found for ${provider.type}, using provider as-is`);
        return [provider];
    }
    
    // Create one provider instance per model
    const expandedProviders = models.map((modelId, index) => ({
        ...provider,
        id: `${provider.id || provider.type}-${index}`,
        model: modelId,          // Set 'model' property for rate limit tracking
        modelName: modelId,      // Keep 'modelName' for backward compatibility
        originalProvider: provider.id || provider.type
    }));
    
    console.log(`🔄 Expanded ${provider.type} into ${expandedProviders.length} model-specific providers for load balancing`);
    
    return expandedProviders;
}

/**
 * Build provider pool by merging user providers with environment providers
 * @param {Array<Object>} userProviders - Providers from user's settings (UI-managed, respects enabled/disabled)
 * @param {boolean} isAuthorized - Whether user is authorized (in ALLOWED_EMAILS)
 * @returns {Array<Object>} Combined provider pool
 */
function buildProviderPool(userProviders = [], isAuthorized = false) {
    const pool = [];
    
    // Add user providers (always included, regardless of authorization)
    // The UI now properly filters to only send enabled providers (enabled === true)
    if (userProviders && Array.isArray(userProviders) && userProviders.length > 0) {
        const validUserProviders = userProviders.filter(p => {
            // Validate required fields
            if (!p.type || !p.apiKey) {
                console.warn(`⚠️ Skipping invalid user provider: missing type or apiKey`);
                return false;
            }
            return true;
        });
        
        // Expand providers for load balancing and mark with source
        validUserProviders.forEach(p => {
            const expanded = expandProviderForLoadBalancing(p);
            expanded.forEach(ep => {
                pool.push({
                    ...ep,
                    source: 'user'
                });
            });
        });
        
        console.log(`👤 Added ${validUserProviders.length} user provider(s) (expanded to ${pool.length}) to pool`);
    }
    
    // Add environment providers ONLY if user is authorized
    if (isAuthorized) {
        const envProviders = loadEnvironmentProviders();
        // Expand environment providers too
        envProviders.forEach(p => {
            const expanded = expandProviderForLoadBalancing(p);
            expanded.forEach(ep => pool.push(ep));
        });
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
    hasAvailableProviders,
    getAvailableModelsForProvider,
    expandProviderForLoadBalancing
};
