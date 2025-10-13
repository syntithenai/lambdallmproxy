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
  FREE_TIER: 'free_tier',                // Prefer free tier models
  SPEED_OPTIMIZED: 'speed_optimized'     // STEP 13: Prefer fastest models
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
 * Prioritize free tier models (STEP 7: Cheap Mode)
 * Prefer smallest capable free models first to save large ones for when needed
 * @param {Array<Object>} models - Candidate models
 * @returns {Array<Object>} Models sorted with free tier first (small to large)
 */
function prioritizeFreeTier(models) {
  const freeTier = models.filter(m => m.free === true);
  const paid = models.filter(m => m.free !== true);
  
  // Within free tier, prefer smallest capable models first
  // Save large context models (gemini-2.0-flash 2M) for when needed
  freeTier.sort((a, b) => {
    // Sort by context window (smaller first) - smaller models are usually faster and less rate-limited
    const contextA = a.context_window || 0;
    const contextB = b.context_window || 0;
    return contextA - contextB;
  });
  
  // Within paid tier, sort by cost (cheapest first) as fallback
  paid.sort((a, b) => {
    const pricingA = a.pricing || { input: 0, output: 0 };
    const pricingB = b.pricing || { input: 0, output: 0 };
    const avgCostA = (pricingA.input + pricingA.output) / 2;
    const avgCostB = (pricingB.input + pricingB.output) / 2;
    return avgCostA - avgCostB;
  });
  
  return [...freeTier, ...paid];
}

/**
 * Prioritize models by quality (STEP 8: Powerful Mode)
 * Prefer best paid models, reasoning models for complex analysis
 * @param {Array<Object>} models - Candidate models
 * @param {Object} analysis - Request analysis (optional)
 * @returns {Array<Object>} Models sorted by quality (best first)
 */
function prioritizeQuality(models, analysis = null) {
  return [...models].sort((a, b) => {
    // Reasoning models get highest priority for complex analysis
    const aIsReasoning = a.category === 'REASONING' || a.name?.includes('o1') || a.name?.includes('deepseek-r1');
    const bIsReasoning = b.category === 'REASONING' || b.name?.includes('o1') || b.name?.includes('deepseek-r1');
    
    if (aIsReasoning && !bIsReasoning) return -1;
    if (!aIsReasoning && bIsReasoning) return 1;
    
    // Within same reasoning tier, prioritize by cost (higher cost = better quality generally)
    // This puts gpt-4o, gemini-2.5-pro before gpt-4o-mini, gemini-2.5-flash
    const avgCostA = (a.pricing.input + a.pricing.output) / 2;
    const avgCostB = (b.pricing.input + b.pricing.output) / 2;
    
    // Higher cost first (reverse sort)
    if (Math.abs(avgCostB - avgCostA) > 0.01) { // Significant cost difference
      return avgCostB - avgCostA;
    }
    
    // If costs similar, prefer larger context window
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
    
    // STEP 14: Filter by health (remove unhealthy models)
    if (typeof rateLimitTracker.filterByHealth === 'function') {
      const healthyCandidates = rateLimitTracker.filterByHealth(candidates);
      if (healthyCandidates.length > 0) {
        candidates = healthyCandidates;
        console.log(`🏥 Health filter: ${candidates.length} healthy models available`);
      } else {
        console.log('⚠️ No healthy models available, using all candidates');
      }
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
      // STEP 7: Cheap mode - free tier with smallest models first
      candidates = prioritizeFreeTier(candidates);
      break;
    
    case SelectionStrategy.COST_OPTIMIZED:
      candidates = prioritizeCost(candidates);
      break;
    
    case SelectionStrategy.QUALITY_OPTIMIZED:
      // STEP 8: Powerful mode - best models with reasoning priority
      candidates = prioritizeQuality(candidates, analysis);
      break;
    
    case SelectionStrategy.SPEED_OPTIMIZED:
      // STEP 13: Fastest mode - prioritize by historical latency
      if (rateLimitTracker && typeof rateLimitTracker.sortBySpeed === 'function') {
        candidates = rateLimitTracker.sortBySpeed(candidates);
        console.log('⚡ Speed-optimized selection based on historical performance');
      } else {
        // Fallback: Groq typically fastest, then Gemini, then others
        const providerSpeedOrder = ['groq', 'groq-free', 'gemini-free', 'gemini', 'together', 'atlascloud', 'openai'];
        candidates = [...candidates].sort((a, b) => {
          const aProvider = (a.providerType || a.provider || '').toLowerCase();
          const bProvider = (b.providerType || b.provider || '').toLowerCase();
          const aIndex = providerSpeedOrder.indexOf(aProvider);
          const bIndex = providerSpeedOrder.indexOf(bProvider);
          return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
        });
        console.log('⚡ Speed-optimized selection using provider heuristics');
      }
      break;
    
    case SelectionStrategy.BALANCED:
      // STEP 9: Balanced mode - optimize cost-per-quality ratio
      // Prefer free tier when quality is equivalent
      // Use paid models when quality difference is significant
      candidates = [...candidates].sort((a, b) => {
        const aIsFree = a.free === true;
        const bIsFree = b.free === true;
        
        // Both free or both paid - compare by capability/cost ratio
        if (aIsFree === bIsFree) {
          if (aIsFree) {
            // Both free: prefer models that are more capable (larger context) but still reasonable
            // Balance between llama-3.1-8b-instant (fast/small) and llama-3.3-70b (capable/large)
            const aCapability = a.context_window / 10000; // Normalize to 0-10 range
            const bCapability = b.context_window / 10000;
            return bCapability - aCapability; // Higher capability first within free tier
          } else {
            // Both paid: optimize cost-per-quality
            // gpt-4o-mini (cheap+capable) should rank higher than gpt-4o (expensive) for simple tasks
            const avgCostA = (a.pricing.input + a.pricing.output) / 2;
            const avgCostB = (b.pricing.input + b.pricing.output) / 2;
            const qualityA = a.context_window / 100000; // Normalize quality metric
            const qualityB = b.context_window / 100000;
            
            // Cost-per-quality ratio (lower is better)
            const ratioA = avgCostA / (qualityA || 1);
            const ratioB = avgCostB / (qualityB || 1);
            
            return ratioA - ratioB;
          }
        }
        
        // One free, one paid
        // For simple/complex requests, free tier is often good enough
        // For reasoning or very complex tasks, paid models win
        const needsHighQuality = analysis.type === 'REASONING' || 
                                analysis.requiresReasoning ||
                                (analysis.type === 'COMPLEX' && analysis.hasTools);
        
        if (needsHighQuality) {
          // Paid models first for high-quality needs
          return aIsFree ? 1 : -1;
        } else {
          // Free models first for standard needs
          return aIsFree ? -1 : 1;
        }
      });
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
