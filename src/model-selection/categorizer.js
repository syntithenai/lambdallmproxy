/**
 * Model Categorization Module
 * 
 * Categorizes models into small, large, and reasoning categories
 * Based on PROVIDER_CATALOG.json structure
 */

/**
 * Model categories
 */
const ModelCategory = {
  SMALL: 'small',
  LARGE: 'large',
  REASONING: 'reasoning'
};

/**
 * Model categorization rules
 * Maps model name patterns to categories
 */
const MODEL_PATTERNS = {
  // Reasoning models
  reasoning: [
    /^o1-/,                          // o1-preview, o1-mini
    /deepseek-reasoner/i,            // DeepSeek R1
    /qwq/i,                          // QwQ reasoning models
  ],
  
  // Large models (70B+)
  large: [
    /llama.*70b/i,
    /llama.*405b/i,
    /mixtral.*8x22b/i,
    /qwen.*72b/i,
    /gpt-4(?!o-mini)/i,              // gpt-4, gpt-4-turbo (but not gpt-4o-mini)
    /claude-3-(opus|sonnet)/i,
    /gemini.*pro/i,
  ],
  
  // Small models (everything else, typically 7B-32B)
  small: [
    /llama.*8b/i,
    /llama.*32b/i,
    /mixtral.*8x7b/i,
    /gemma/i,
    /qwen.*32b/i,
    /gpt-4o-mini/i,
    /gpt-3\.5/i,
    /claude-3-haiku/i,
    /gemini.*flash/i,
  ]
};

/**
 * Categorize a model by name
 * @param {string} modelName - Model name to categorize
 * @returns {string} Category: 'small', 'large', or 'reasoning'
 */
function categorizeModel(modelName) {
  if (!modelName || typeof modelName !== 'string') {
    return ModelCategory.SMALL; // Default to small
  }

  const name = modelName.toLowerCase();

  // Check reasoning patterns first (highest priority)
  for (const pattern of MODEL_PATTERNS.reasoning) {
    if (pattern.test(name)) {
      return ModelCategory.REASONING;
    }
  }

  // Check large patterns
  for (const pattern of MODEL_PATTERNS.large) {
    if (pattern.test(name)) {
      return ModelCategory.LARGE;
    }
  }

  // Check small patterns (most common)
  for (const pattern of MODEL_PATTERNS.small) {
    if (pattern.test(name)) {
      return ModelCategory.SMALL;
    }
  }

  // Default to small for unknown models
  return ModelCategory.SMALL;
}

/**
 * Get all models in a specific category from provider catalog
 * @param {Object} providerCatalog - PROVIDER_CATALOG.json content
 * @param {string} category - Category to filter by
 * @returns {Array<Object>} Models in the category with provider info
 */
function getModelsByCategory(providerCatalog, category) {
  if (!providerCatalog || !providerCatalog.providers) {
    return [];
  }

  const results = [];

  for (const [providerType, providerInfo] of Object.entries(providerCatalog.providers)) {
    if (!providerInfo.models) {
      continue;
    }

    // Handle both object and array formats
    const models = Array.isArray(providerInfo.models) 
      ? providerInfo.models 
      : Object.values(providerInfo.models);

    for (const model of models) {
      // Use catalog's category if available, otherwise categorize by name
      const modelCategory = model.category || categorizeModel(model.name || model.id);
      if (modelCategory === category) {
        results.push({
          ...model,
          providerType,
          category: modelCategory
        });
      }
    }
  }

  return results;
}

/**
 * Get recommended model category based on request characteristics
 * @param {Object} options - Category selection options
 * @param {string} options.requestType - Request type from analyzeRequest (simple, complex, reasoning, etc)
 * @param {number} options.estimatedTokens - Total estimated tokens
 * @param {boolean} options.requiresReasoning - Whether reasoning is needed
 * @param {boolean} options.requiresLargeContext - Whether large context is needed
 * @param {number} options.maxCost - Maximum acceptable cost
 * @returns {string} Recommended category
 */
function getRecommendedCategory(options = {}) {
  const {
    requestType = 'simple',
    estimatedTokens = 0,
    requiresReasoning = false,
    requiresLargeContext = false,
    maxCost = Infinity
  } = options;

  // Reasoning required -> use reasoning models
  if (requiresReasoning) {
    return ModelCategory.REASONING;
  }

  // Complex requests need large models
  if (requestType === 'complex') {
    return ModelCategory.LARGE;
  }

  // Large context or many tokens -> use large models
  if (requiresLargeContext || estimatedTokens > 8000) {
    return ModelCategory.LARGE;
  }

  // Default to small for efficiency
  return ModelCategory.SMALL;
}

/**
 * Check if a model supports a minimum context window
 * @param {Object} model - Model object from catalog
 * @param {number} requiredTokens - Required context window size
 * @returns {boolean} True if model supports the context window
 */
function supportsContextWindow(model, requiredTokens) {
  if (!model) {
    return false;
  }
  // Support both contextWindow and context_window
  const contextWindow = model.contextWindow || model.context_window;
  if (!contextWindow) {
    return false;
  }
  return contextWindow >= requiredTokens;
}

/**
 * Filter models by context window requirement
 * @param {Array<Object>} models - Array of model objects
 * @param {number} requiredTokens - Required context window size
 * @returns {Array<Object>} Filtered models
 */
function filterByContextWindow(models, requiredTokens) {
  if (!requiredTokens || requiredTokens <= 0) {
    return models;
  }

  return models.filter(model => supportsContextWindow(model, requiredTokens));
}

/**
 * Get model info with category
 * @param {string} modelName - Model name
 * @param {Object} providerCatalog - Provider catalog
 * @returns {Object|null} Model info with category
 */
function getModelInfo(modelName, providerCatalog) {
  if (!modelName || !providerCatalog || !providerCatalog.providers) {
    return null;
  }

  for (const [providerType, providerInfo] of Object.entries(providerCatalog.providers)) {
    if (!providerInfo.models) continue;

    const model = providerInfo.models.find(m => m.name === modelName);
    if (model) {
      return {
        ...model,
        providerType,
        category: categorizeModel(modelName)
      };
    }
  }

  return null;
}

module.exports = {
  ModelCategory,
  categorizeModel,
  getModelsByCategory,
  getRecommendedCategory,
  supportsContextWindow,
  filterByContextWindow,
  getModelInfo
};
