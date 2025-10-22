/**
 * Content Guardrails Configuration
 * Auto-detects available providers and models at runtime
 */

const path = require('path');

/**
 * Load provider catalog
 * @returns {Object|null} Provider catalog or null if not found
 */
function loadProviderCatalog() {
  try {
    // Try multiple locations
    let catalog;
    try {
      catalog = require('../../PROVIDER_CATALOG.json');
    } catch (e) {
      try {
        catalog = require('/var/task/PROVIDER_CATALOG.json');
      } catch (e2) {
        const catalogPath = path.join(__dirname, '..', '..', 'PROVIDER_CATALOG.json');
        catalog = require(catalogPath);
      }
    }
    return catalog;
  } catch (error) {
    console.warn('⚠️ Could not load PROVIDER_CATALOG.json:', error.message);
    return null;
  }
}

/**
 * Check if a provider has an available API key
 * Only checks indexed provider format (LLAMDA_LLM_PROXY_PROVIDER_*)
 * @param {string} providerType - Provider type (e.g., 'groq-free', 'gemini-free')
 * @param {Object} context - Request context with API keys
 * @returns {boolean} True if API key available
 */
function hasProviderApiKey(providerType, context = {}) {
  const providerLower = providerType.toLowerCase();
  
  // Map provider types to context keys
  const contextKeyMap = {
    'openai': 'openaiApiKey',
    'anthropic': 'anthropicApiKey',
    'groq': 'groqApiKey',
    'groq-free': 'groqApiKey',
    'gemini': 'geminiApiKey',
    'gemini-free': 'geminiApiKey',
    'together': 'togetherApiKey',
    'replicate': 'replicateApiKey',
    'atlascloud': 'atlascloudApiKey'
  };
  
  // Check context (from UI)
  const contextKey = contextKeyMap[providerLower];
  if (contextKey && context[contextKey]) {
    return true;
  }
  
  // Check indexed providers (LLAMDA_LLM_PROXY_PROVIDER_TYPE_*)
  let index = 0;
  while (true) {
    const typeVar = `LLAMDA_LLM_PROXY_PROVIDER_TYPE_${index}`;
    const keyVar = `LLAMDA_LLM_PROXY_PROVIDER_KEY_${index}`;
    
    const providerType = process.env[typeVar];
    const providerKey = process.env[keyVar];
    
    if (!providerType) break;
    
    if (providerType.toLowerCase() === providerLower && providerKey && providerKey.trim().length > 0) {
      return true;
    }
    
    index++;
  }
  
  return false;
}

/**
 * Auto-detect best available provider and model for guardrails
 * Preference order: groq-free > gemini-free > groq > other free tiers > paid tiers
 * @param {Object} context - Request context with API keys
 * @returns {Object|null} {provider, model} or null if none available
 */
function autoDetectGuardrailProvider(context = {}) {
  const catalog = loadProviderCatalog();
  if (!catalog || !catalog.chat || !catalog.chat.providers) {
    console.warn('⚠️ Provider catalog not available for guardrail auto-detection');
    return null;
  }
  
  // Priority order for providers
  const preferredProviders = [
    'groq-free',      // #1 priority: Groq free (fast, free, good quality)
    'gemini-free',    // #2: Gemini free (fast, free)
    'groq',           // #3: Groq paid (fast, cheap)
    'together',       // #4: Together (various models)
    'gemini',         // #5: Gemini paid
    'openai',         // #6: OpenAI (expensive but reliable)
    'anthropic',      // #7: Anthropic (expensive)
  ];
  
  for (const providerType of preferredProviders) {
    const providerInfo = catalog.chat.providers[providerType];
    
    if (!providerInfo) continue;
    
    // Check if we have API key for this provider
    if (!hasProviderApiKey(providerType, context)) {
      continue;
    }
    
    // Find a suitable guardrail model
    const models = providerInfo.models || {};
    
    // First, look for dedicated guardrail models (Llama Guard, etc.)
    for (const [modelId, modelInfo] of Object.entries(models)) {
      if (modelInfo.guardrailModel === true && modelInfo.available !== false) {
        console.log(`🛡️ Selected dedicated guardrail model: ${modelId}`);
        return {
          provider: providerType,
          inputModel: modelId,
          outputModel: modelId
        };
      }
    }
    
    // Fallback: Look for small, fast general models
    const fallbackModelPriority = [
      'llama-3.1-8b-instant',           // Groq 8B (fast)
      'llama-3.2-3b-preview',           // Groq 3B
      'gemini-1.5-flash',               // Gemini flash
      'gemini-1.5-flash-8b',            // Gemini 8B
      'virtueguard-text-lite',          // Together AI VirtueGuard
      'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',  // Together AI 8B
      'gpt-4o-mini',                    // OpenAI mini
      'claude-3-haiku-20240307',        // Anthropic haiku
    ];
    
    // Try fallback models
    for (const modelId of fallbackModelPriority) {
      if (models[modelId] && models[modelId].available !== false) {
        console.log(`⚠️ No dedicated guardrail model found, using fallback: ${modelId}`);
        return {
          provider: providerType,
          inputModel: modelId,
          outputModel: modelId
        };
      }
    }
    
    // Last resort: use first available small/medium model
    for (const [modelId, modelInfo] of Object.entries(models)) {
      if (modelInfo.available !== false && 
          (modelInfo.category === 'small' || modelInfo.category === 'medium' || modelInfo.category === 'guardrail')) {
        console.log(`⚠️ Using first available model for guardrails: ${modelId}`);
        return {
          provider: providerType,
          inputModel: modelId,
          outputModel: modelId
        };
      }
    }
  }
  
  return null;
}

/**
 * Load guardrail configuration from environment variables
 * Auto-detects provider and models if ENABLE_GUARDRAILS=true
 * @param {Object} context - Request context with API keys
 * @returns {Object|null} Configuration object or null if disabled
 */
function loadGuardrailConfig(context = {}) {
  const enabled = process.env.ENABLE_GUARDRAILS === 'true';
  
  if (!enabled) {
    console.log('🛡️ Content guardrails: DISABLED');
    return null;
  }
  
  // Auto-detect best available provider and model
  const detected = autoDetectGuardrailProvider(context);
  
  if (!detected) {
    console.warn('⚠️ Content guardrails: ENABLED but no suitable provider available');
    console.warn('   Continuing without guardrails. Provide API keys for groq-free, gemini-free, or other providers.');
    return null;
  }
  
  const config = {
    enabled: true,
    provider: detected.provider,
    inputModel: detected.inputModel,
    outputModel: detected.outputModel,
    strictness: 'moderate' // Always moderate for now
  };
  
  console.log('🛡️ Content guardrails: ENABLED (auto-detected)', {
    provider: config.provider,
    model: config.inputModel
  });
  
  return config;
}


module.exports = {
  loadGuardrailConfig
};
