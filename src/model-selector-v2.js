/**
 * Intelligent Model Selection Engine V2
 * Multi-provider support with automatic model rotation
 */

const PROVIDER_CATALOG = require('../PROVIDER_CATALOG.json');

/**
 * Get all available models for a provider type
 * @param {string} providerType - Provider type (e.g., 'groq-free', 'gemini-free')
 * @returns {Array<{id: string, category: string, tokensPerMinute: number}>}
 */
function getAvailableModelsForProvider(providerType) {
    const provider = PROVIDER_CATALOG.chat?.providers?.[providerType];
    
    if (!provider || !provider.models) {
        console.log(`⚠️ No models found for provider: ${providerType}`);
        return [];
    }
    
    // Filter to available, non-deprecated, non-guardrail models
    const models = Object.entries(provider.models)
        .filter(([_, model]) => 
            model.available !== false && 
            model.deprecated !== true && 
            model.guardrailModel !== true &&
            model.excludeFromChat !== true
        )
        .map(([id, model]) => ({
            id,
            category: model.category || 'general',
            tokensPerMinute: model.rateLimits?.tokensPerMinute || 0,
            tokensPerDay: model.rateLimits?.tokensPerDay || Infinity,
            contextWindow: model.contextWindow || 0,
            supportsTools: model.supportsTools !== false,
            supportsVision: model.supportsVision || false
        }));
    
    console.log(`📋 Found ${models.length} available models for ${providerType}`);
    return models;
}

/**
 * Estimate token requirements
 * @param {Array} messages - Chat messages  
 * @param {boolean} hasTools - Whether tools are used
 * @returns {number} Estimated tokens
 */
function estimateTokenRequirements(messages, hasTools) {
    let totalChars = 0;
    
    if (Array.isArray(messages)) {
        for (const msg of messages) {
            if (msg.content) {
                totalChars += String(msg.content).length;
            }
        }
    }
    
    const baseTokens = Math.ceil(totalChars / 4);
    const toolOverhead = hasTools ? 2000 : 0;
    const responseBuffer = 4000;
    
    return baseTokens + toolOverhead + responseBuffer;
}

/**
 * Build model rotation sequence - tries all models within provider before switching
 * @param {Array} uiProviders - Provider configs [{type, apiKey, enabled}]
 * @param {Object} requirements - {needsTools, needsVision, needsReasoning, estimatedTokens, optimization}
 * @returns {Array<{providerType, model, apiKey, tokensPerMinute, category}>}
 */
function buildModelRotationSequence(uiProviders, requirements) {
    if (!Array.isArray(uiProviders) || uiProviders.length === 0) {
        console.log('⚠️ No UI providers available');
        return [];
    }
    
    const sequence = [];
    
    // Filter to enabled providers with API keys
    // Note: Environment providers don't have 'enabled' property, treat them as enabled unless explicitly disabled
    const enabledProviders = uiProviders.filter(p => 
        (p.enabled !== false) && p.apiKey && p.type
    );
    
    if (enabledProviders.length === 0) {
        console.log('⚠️ No enabled providers with API keys');
        return [];
    }
    
    // Sort providers: groq/groq-free first, then others
    enabledProviders.sort((a, b) => {
        const aIsGroq = a.type.startsWith('groq');
        const bIsGroq = b.type.startsWith('groq');
        if (aIsGroq && !bIsGroq) return -1;
        if (!aIsGroq && bIsGroq) return 1;
        return 0;
    });
    
    console.log(`🔄 Building rotation with providers: ${enabledProviders.map(p => p.type).join(', ')}`);
    
    // For each provider, add ALL suitable models
    for (const provider of enabledProviders) {
        const models = getAvailableModelsForProvider(provider.type);
        
        // Filter and sort models
        const suitableModels = models
            .filter(model => {
                if (requirements.needsTools && !model.supportsTools) return false;
                if (requirements.needsVision && !model.supportsVision) return false;
                if (requirements.estimatedTokens > model.tokensPerMinute) return false;
                // Filter for reasoning models if required
                if (requirements.needsReasoning && model.category !== 'reasoning') return false;
                return true;
            })
            .sort((a, b) => {
                // Sort by optimization strategy
                if (requirements.optimization === 'fast') {
                    // Prefer small models with high TPM
                    if (a.category === 'small' && b.category !== 'small') return -1;
                    if (a.category !== 'small' && b.category === 'small') return 1;
                    return b.tokensPerMinute - a.tokensPerMinute;
                } else if (requirements.optimization === 'quality') {
                    // Prefer reasoning models first, then large models
                    if (a.category === 'reasoning' && b.category !== 'reasoning') return -1;
                    if (a.category !== 'reasoning' && b.category === 'reasoning') return 1;
                    if (a.category === 'large' && b.category !== 'large') return -1;
                    if (a.category !== 'large' && b.category === 'large') return 1;
                    return b.contextWindow - a.contextWindow;
                } else {
                    // 'cheap': Prefer highest TPM (can handle more load)
                    return b.tokensPerMinute - a.tokensPerMinute;
                }
            });
        
        // Add each model to sequence
        for (const model of suitableModels) {
            sequence.push({
                providerType: provider.type,
                model: `${provider.type}:${model.id}`,
                apiKey: provider.apiKey,
                tokensPerMinute: model.tokensPerMinute,
                category: model.category
            });
        }
    }
    
    console.log(`🔄 Built rotation sequence with ${sequence.length} models`);
    if (sequence.length <= 10) {
        sequence.forEach((item, idx) => {
            console.log(`  ${idx + 1}. ${item.model} (${item.tokensPerMinute} TPM)`);
        });
    } else {
        console.log(`  First 5: ${sequence.slice(0, 5).map(s => s.model).join(', ')}`);
        console.log(`  Last 5: ${sequence.slice(-5).map(s => s.model).join(', ')}`);
    }
    
    return sequence;
}

module.exports = {
    getAvailableModelsForProvider,
    estimateTokenRequirements,
    buildModelRotationSequence
};
