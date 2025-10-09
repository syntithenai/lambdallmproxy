/**
 * Model Selector Module
 * 
 * Main selection logic combining all model-selection modules
 * Chooses optimal model based on request analysis, rate limits, and preferences
 */

const { analyzeRequest } = require('./request-analyzer');
const { 
  getModelsByCategory, 
  getRecommendedCategory,
  filterByContextWindow,
  ModelCategory 
} = require('./categorizer');
const { estimateInputTokens, estimateOutputTokens } = require('./token-calculator');

/**
 * Selection preferences
 */
const SelectionStrategy = {
  COST_OPTIMIZED: 'cost_optimized',     // Prefer cheapest models
  QUALITY_OPTIMIZED: 'quality_optimized', // Prefer best models
  BALANCED: 'balanced',                  // Balance cost and quality
  FREE_TIER: 'free_tier'                 // Prefer free tier models
};

/**
 * Filter models by provider availability
 * @param {Array<Object>} models - Candidate models
 * @param {RateLimitTracker} rateLimitTracker - Rate limit tracker
 * @param {number} tokens - Required tokens
 * @returns {Array<Object>} Available models
 */
function filterByRateLimits(models, rateLimitTracker, tokens = 0) {
  if (!rateLimitTracker) {
    return models;
  }

  return models.filter(model => {
    const provider = model.providerType || model.provider;
    return rateLimitTracker.isAvailable(provider, model.name, tokens);
  });
}

/**
 * Filter models by cost constraint
 * @param {Array<Object>} models - Candidate models
 * @param {number} maxCostPerMillion - Maximum cost per million tokens
 * @returns {Array<Object>} Models within cost limit
 */
function filterByCost(models, maxCostPerMillion) {
  if (!maxCostPerMillion || maxCostPerMillion === Infinity) {
    return models;
  }

  return models.filter(model => {
    const avgCost = (model.pricing.input + model.pricing.output) / 2;
    return avgCost <= maxCostPerMillion;
  });
}

/**
 * Prioritize free tier models
 * @param {Array<Object>} models - Candidate models
 * @returns {Array<Object>} Models sorted with free tier first
 */
function prioritizeFreeTier(models) {
  const freeTier = models.filter(m => m.free === true);
  const paid = models.filter(m => m.free !== true);
  return [...freeTier, ...paid];
}

/**
 * Prioritize models by quality (context window size as proxy)
 * @param {Array<Object>} models - Candidate models
 * @returns {Array<Object>} Models sorted by quality
 */
function prioritizeQuality(models) {
  return [...models].sort((a, b) => {
    // Larger context window = better model (generally)
    return b.context_window - a.context_window;
  });
}

/**
 * Prioritize models by cost (cheaper first)
 * @param {Array<Object>} models - Candidate models
 * @returns {Array<Object>} Models sorted by cost
 */
function prioritizeCost(models) {
  return [...models].sort((a, b) => {
    const avgCostA = (a.pricing.input + a.pricing.output) / 2;
    const avgCostB = (b.pricing.input + b.pricing.output) / 2;
    return avgCostA - avgCostB;
  });
}

/**
 * Round-robin selection (tracks last used index per category)
 */
class RoundRobinSelector {
  constructor() {
    this.lastUsedIndex = new Map(); // category -> index
  }

  /**
   * Select next model using round-robin
   * @param {Array<Object>} models - Candidate models
   * @param {string} key - Key for round-robin tracking (default: 'global')
   * @returns {Object|null} Selected model
   */
  select(models, key = 'global') {
    if (!Array.isArray(models) || models.length === 0) {
      return null;
    }

    if (models.length === 1) {
      return models[0];
    }

    // Get last used index for this key (use ?? instead of || to handle 0)
    const lastIndex = this.lastUsedIndex.has(key) ? this.lastUsedIndex.get(key) : -1;
    
    // Get next index (wrap around)
    const nextIndex = (lastIndex + 1) % models.length;
    
    // Update tracking
    this.lastUsedIndex.set(key, nextIndex);
    
    return models[nextIndex];
  }

  /**
   * Reset round-robin state
   * @param {string} key - Key to reset (optional, resets all if null)
   */
  reset(key = null) {
    if (key === null) {
      this.lastUsedIndex.clear();
    } else {
      this.lastUsedIndex.delete(key);
    }
  }
}

/**
 * Select optimal model for request
 * @param {Object} options - Selection options
 * @returns {Object} Selection result
 */
function selectModel(options = {}) {
  const {
    messages = [],
    tools = [],
    catalog = [],
    rateLimitTracker = null,
    preferences = {},
    roundRobinSelector = null,
    max_tokens = null
  } = options;

  // Validate inputs
  if (!catalog || typeof catalog !== 'object') {
    throw new Error('Model catalog is required');
  }

  // Check if catalog has providers (provider catalog format)
  if (!catalog.providers || Object.keys(catalog.providers).length === 0) {
    throw new Error('Model catalog must have providers');
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Messages array is required and must not be empty');
  }

  // Set defaults
  const strategy = preferences.strategy || SelectionStrategy.BALANCED;
  const maxCostPerMillion = preferences.maxCostPerMillion || Infinity;
  const preferFree = preferences.preferFree !== false; // Default true

  // Step 1: Analyze request
  const analysis = analyzeRequest({ messages, tools, max_tokens });

  // Step 2: Get recommended category
  const category = getRecommendedCategory({
    requestType: analysis.type,
    requiresReasoning: analysis.requiresReasoning,
    requiresLargeContext: analysis.requiresLargeContext,
    hasTools: analysis.hasTools
  });

  // Step 3: Get candidate models by category
  let candidates = getModelsByCategory(catalog, category);

  if (candidates.length === 0) {
    throw new Error(`No models found for category: ${category}`);
  }

  // Step 4: Filter by context window
  const inputTokens = estimateInputTokens({ messages, tools, modelName: 'gpt-4' });
  const outputTokens = estimateOutputTokens({ 
    requestType: analysis.type,
    max_tokens: max_tokens || 4096
  });
  const totalTokens = inputTokens + outputTokens;

  candidates = filterByContextWindow(candidates, totalTokens);

  if (candidates.length === 0) {
    throw new Error('No models with sufficient context window');
  }

  // Step 5: Filter by rate limits
  if (rateLimitTracker) {
    candidates = filterByRateLimits(candidates, rateLimitTracker, inputTokens);
    
    if (candidates.length === 0) {
      throw new Error('All models are rate limited');
    }
  }

  // Step 6: Filter by cost constraint
  if (maxCostPerMillion && maxCostPerMillion !== Infinity) {
    candidates = filterByCost(candidates, maxCostPerMillion);
    
    if (candidates.length === 0) {
      throw new Error('No models within cost constraint');
    }
  }

  // Step 7: Apply strategy
  switch (strategy) {
    case SelectionStrategy.FREE_TIER:
      candidates = prioritizeFreeTier(candidates);
      break;
    
    case SelectionStrategy.COST_OPTIMIZED:
      candidates = prioritizeCost(candidates);
      break;
    
    case SelectionStrategy.QUALITY_OPTIMIZED:
      candidates = prioritizeQuality(candidates);
      break;
    
    case SelectionStrategy.BALANCED:
      // Free tier first, then sort by cost within each tier
      if (preferFree) {
        candidates = prioritizeFreeTier(candidates);
      } else {
        candidates = prioritizeCost(candidates);
      }
      break;
    
    default:
      throw new Error(`Unknown selection strategy: ${strategy}`);
  }

  // Step 8: Select model (round-robin if selector provided)
  let selectedModel;
  
  if (roundRobinSelector) {
    selectedModel = roundRobinSelector.select(candidates, category);
  } else {
    selectedModel = candidates[0]; // Just pick first
  }

  if (!selectedModel) {
    throw new Error('Failed to select model');
  }

  // Step 9: Return result
  return {
    model: selectedModel,
    category,
    analysis,
    candidateCount: candidates.length,
    totalTokens,
    inputTokens,
    outputTokens
  };
}

/**
 * Select model with automatic fallback
 * @param {Object} options - Selection options
 * @returns {Object} Selection result
 */
function selectWithFallback(options = {}) {
  const {
    messages,
    tools,
    catalog,
    rateLimitTracker,
    preferences,
    roundRobinSelector,
    max_tokens
  } = options;

  try {
    // Try primary selection
    return selectModel(options);
  } catch (error) {
    // If rate limited or no models in primary category, try fallback
    if (error.message.includes('rate limited') || 
        error.message.includes('No models found')) {
      
      // Analyze request to get category
      const analysis = analyzeRequest({ messages, tools, max_tokens });
      const primaryCategory = getRecommendedCategory({
        requestType: analysis.type,
        requiresReasoning: analysis.requiresReasoning,
        requiresLargeContext: analysis.requiresLargeContext,
        hasTools: analysis.hasTools
      });

      // Try fallback categories
      const fallbackOrder = getFallbackCategories(primaryCategory);
      const inputTokens = estimateInputTokens({ messages, tools, modelName: 'gpt-4' });
      const outputTokens = estimateOutputTokens({ 
        requestType: analysis.type,
        max_tokens: max_tokens || 4096
      });
      const totalTokens = inputTokens + outputTokens;
      
      for (const fallbackCategory of fallbackOrder) {
        try {
          // Get models from the fallback category
          let candidates = getModelsByCategory(catalog, fallbackCategory);
          
          if (candidates.length === 0) {
            continue; // No models in this category
          }
          
          // Apply same filters as selectModel
          candidates = filterByContextWindow(candidates, totalTokens);
          
          if (candidates.length === 0) {
            continue;
          }
          
          if (rateLimitTracker) {
            candidates = filterByRateLimits(candidates, rateLimitTracker, inputTokens);
            
            if (candidates.length === 0) {
              continue;
            }
          }
          
          // Apply strategy
          const strategy = (preferences && preferences.strategy) || SelectionStrategy.BALANCED;
          const preferFree = preferences && preferences.preferFree !== false;
          
          if (strategy === SelectionStrategy.FREE_TIER || preferFree) {
            candidates = prioritizeFreeTier(candidates);
          } else if (strategy === SelectionStrategy.COST_OPTIMIZED) {
            candidates = prioritizeCost(candidates);
          } else if (strategy === SelectionStrategy.QUALITY_OPTIMIZED) {
            candidates = prioritizeQuality(candidates);
          }
          
          // Select with round-robin if available
          const selectedModel = roundRobinSelector 
            ? roundRobinSelector.select(candidates, 'fallback')
            : candidates[0];
          
          return {
            model: selectedModel,
            category: fallbackCategory,
            analysis,
            candidateCount: candidates.length,
            totalTokens,
            inputTokens,
            outputTokens
          };
        } catch (fallbackError) {
          // Continue to next fallback
          continue;
        }
      }
    }

    // No fallback worked, throw original error
    throw error;
  }
}

/**
 * Get fallback category order
 * @param {string} primaryCategory - Primary category
 * @returns {Array<string>} Fallback categories in order
 */
function getFallbackCategories(primaryCategory) {
  // Fallback strategy: reasoning -> large -> small
  // Exception: small can't fallback to reasoning (too weak)
  
  if (primaryCategory === ModelCategory.REASONING) {
    return [ModelCategory.LARGE, ModelCategory.SMALL];
  }
  
  if (primaryCategory === ModelCategory.LARGE) {
    return [ModelCategory.REASONING, ModelCategory.SMALL];
  }
  
  if (primaryCategory === ModelCategory.SMALL) {
    return [ModelCategory.LARGE]; // Don't fallback to reasoning from simple
  }
  
  return [ModelCategory.LARGE, ModelCategory.SMALL];
}

/**
 * Batch select models for multiple requests
 * @param {Array<Object>} requests - Array of request options
 * @returns {Array<Object>} Selection results
 */
function batchSelect(requests) {
  if (!Array.isArray(requests)) {
    throw new Error('Requests must be an array');
  }

  const roundRobin = new RoundRobinSelector();
  
  return requests.map(request => {
    try {
      return selectModel({
        ...request,
        roundRobinSelector: roundRobin
      });
    } catch (error) {
      return {
        error: error.message,
        request
      };
    }
  });
}

module.exports = {
  SelectionStrategy,
  RoundRobinSelector,
  selectModel,
  selectWithFallback,
  batchSelect,
  filterByRateLimits,
  filterByCost,
  prioritizeFreeTier,
  prioritizeQuality,
  prioritizeCost,
  getFallbackCategories
};
