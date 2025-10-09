/**
 * Tests for Model Selector Module
 */

const {
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
} = require('../../src/model-selection/selector');

const { RateLimitTracker } = require('../../src/model-selection/rate-limit-tracker');
const { ModelCategory } = require('../../src/model-selection/categorizer');

// Mock catalog in the format expected by categorizer
const mockCatalog = {
  providers: {
    groq: {
      models: [
        {
          name: 'llama-3.2-8b',
          context_window: 8192,
          pricing: { input: 0.05, output: 0.08 },
          free: true
        },
        {
          name: 'gemma-7b-it',
          context_window: 8192,
          pricing: { input: 0.07, output: 0.07 },
          free: true
        },
        {
          name: 'llama-3.1-70b',
          context_window: 131072,
          pricing: { input: 0.64, output: 0.80 },
          free: false
        }
      ]
    },
    openai: {
      models: [
        {
          name: 'gpt-4o',
          context_window: 128000,
          pricing: { input: 2.50, output: 10.00 },
          free: false
        },
        {
          name: 'o1-preview',
          context_window: 128000,
          pricing: { input: 15.00, output: 60.00 },
          free: false
        }
      ]
    },
    deepseek: {
      models: [
        {
          name: 'deepseek-reasoner',
          context_window: 64000,
          pricing: { input: 0.55, output: 2.19 },
          free: false
        }
      ]
    }
  }
};

// Flat list for filter tests
const mockModelList = [
  {
    name: 'llama-3.2-8b',
    provider: 'groq',
    providerType: 'groq',
    context_window: 8192,
    pricing: { input: 0.05, output: 0.08 },
    free: true
  },
  {
    name: 'gemma-7b-it',
    provider: 'groq',
    providerType: 'groq',
    context_window: 8192,
    pricing: { input: 0.07, output: 0.07 },
    free: true
  },
  {
    name: 'llama-3.1-70b',
    provider: 'groq',
    providerType: 'groq',
    context_window: 131072,
    pricing: { input: 0.64, output: 0.80 },
    free: false
  },
  {
    name: 'gpt-4o',
    provider: 'openai',
    providerType: 'openai',
    context_window: 128000,
    pricing: { input: 2.50, output: 10.00 },
    free: false
  },
  {
    name: 'deepseek-reasoner',
    provider: 'deepseek',
    providerType: 'deepseek',
    context_window: 64000,
    pricing: { input: 0.55, output: 2.19 },
    free: false
  },
  {
    name: 'o1-preview',
    provider: 'openai',
    providerType: 'openai',
    context_window: 128000,
    pricing: { input: 15.00, output: 60.00 },
    free: false
  }
];

describe('SelectionStrategy', () => {
  test('should define all strategies', () => {
    expect(SelectionStrategy.COST_OPTIMIZED).toBe('cost_optimized');
    expect(SelectionStrategy.QUALITY_OPTIMIZED).toBe('quality_optimized');
    expect(SelectionStrategy.BALANCED).toBe('balanced');
    expect(SelectionStrategy.FREE_TIER).toBe('free_tier');
  });
});

describe('filterByRateLimits', () => {
  test('should return all models when no tracker', () => {
    const filtered = filterByRateLimits(mockModelList, null);
    expect(filtered.length).toBe(mockModelList.length);
  });

  test('should filter out rate-limited models', () => {
    const tracker = new RateLimitTracker();
    
    // Mark one model as rate limited
    tracker.updateFrom429('groq', 'llama-3.2-8b', 60);
    
    const filtered = filterByRateLimits(mockModelList, tracker, 100);
    
    expect(filtered.length).toBe(mockModelList.length - 1);
    expect(filtered.find(m => m.name === 'llama-3.2-8b')).toBeUndefined();
  });

  test('should check token requirements', () => {
    const tracker = new RateLimitTracker();
    
    // Set low token limit
    tracker.trackRequest('groq', 'llama-3.2-8b', 9000, { tpm: 10000 });
    
    const filtered = filterByRateLimits(mockModelList, tracker, 2000);
    
    expect(filtered.find(m => m.name === 'llama-3.2-8b')).toBeUndefined();
  });
});

describe('filterByCost', () => {
  test('should return all models when no constraint', () => {
    const filtered = filterByCost(mockModelList, Infinity);
    expect(filtered.length).toBe(mockModelList.length);
  });

  test('should filter by cost constraint', () => {
    const filtered = filterByCost(mockModelList, 1.0);
    
    // Should exclude expensive models
    expect(filtered.find(m => m.name === 'gpt-4o')).toBeUndefined();
    expect(filtered.find(m => m.name === 'o1-preview')).toBeUndefined();
    
    // Should include cheap models
    expect(filtered.find(m => m.name === 'llama-3.2-8b')).toBeDefined();
  });

  test('should calculate average of input and output', () => {
    const models = [
      { name: 'test', pricing: { input: 1.0, output: 3.0 } } // avg = 2.0
    ];
    
    expect(filterByCost(models, 2.0).length).toBe(1);
    expect(filterByCost(models, 1.9).length).toBe(0);
  });
});

describe('prioritizeFreeTier', () => {
  test('should put free models first', () => {
    const prioritized = prioritizeFreeTier(mockModelList);
    
    expect(prioritized[0].free).toBe(true);
    expect(prioritized[1].free).toBe(true);
  });

  test('should maintain order within tiers', () => {
    const models = [
      { name: 'paid1', free: false },
      { name: 'free1', free: true },
      { name: 'paid2', free: false },
      { name: 'free2', free: true }
    ];
    
    const prioritized = prioritizeFreeTier(models);
    
    expect(prioritized[0].name).toBe('free1');
    expect(prioritized[1].name).toBe('free2');
    expect(prioritized[2].name).toBe('paid1');
    expect(prioritized[3].name).toBe('paid2');
  });

  test('should handle all free models', () => {
    const models = [
      { name: 'free1', free: true },
      { name: 'free2', free: true }
    ];
    
    const prioritized = prioritizeFreeTier(models);
    expect(prioritized.length).toBe(2);
  });

  test('should handle no free models', () => {
    const models = [
      { name: 'paid1', free: false },
      { name: 'paid2', free: false }
    ];
    
    const prioritized = prioritizeFreeTier(models);
    expect(prioritized.length).toBe(2);
  });
});

describe('prioritizeQuality', () => {
  test('should sort by context window descending', () => {
    const prioritized = prioritizeQuality(mockModelList);
    
    expect(prioritized[0].context_window).toBeGreaterThanOrEqual(
      prioritized[1].context_window
    );
  });

  test('should not mutate original array', () => {
    const original = [...mockModelList];
    prioritizeQuality(mockModelList);
    
    expect(mockModelList).toEqual(original);
  });
});

describe('prioritizeCost', () => {
  test('should sort by cost ascending', () => {
    const prioritized = prioritizeCost(mockModelList);
    
    const cost0 = (prioritized[0].pricing.input + prioritized[0].pricing.output) / 2;
    const cost1 = (prioritized[1].pricing.input + prioritized[1].pricing.output) / 2;
    
    expect(cost0).toBeLessThanOrEqual(cost1);
  });

  test('should put cheapest model first', () => {
    const prioritized = prioritizeCost(mockModelList);
    
    expect(prioritized[0].name).toBe('llama-3.2-8b');
  });

  test('should not mutate original array', () => {
    const original = [...mockModelList];
    prioritizeCost(mockModelList);
    
    expect(mockModelList).toEqual(original);
  });
});

describe('RoundRobinSelector', () => {
  test('should initialize with empty state', () => {
    const selector = new RoundRobinSelector();
    expect(selector.lastUsedIndex.size).toBe(0);
  });

  test('should select first model initially', () => {
    const selector = new RoundRobinSelector();
    const models = mockModelList.slice(0, 3);
    
    const selected = selector.select(models);
    expect(selected).toBe(models[0]);
  });

  test('should rotate through models', () => {
    const selector = new RoundRobinSelector();
    const models = mockModelList.slice(0, 3);
    
    const sel1 = selector.select(models);
    const sel2 = selector.select(models);
    const sel3 = selector.select(models);
    const sel4 = selector.select(models);
    
    // Should cycle through all models
    expect(sel1).toBe(models[0]);
    expect(sel2).toBe(models[1]);
    expect(sel3).toBe(models[2]);
    expect(sel4).toBe(models[0]); // Wrap around
  });

  test('should handle single model', () => {
    const selector = new RoundRobinSelector();
    const models = [mockModelList[0]];
    
    const sel1 = selector.select(models);
    const sel2 = selector.select(models);
    
    expect(sel1).toBe(models[0]);
    expect(sel2).toBe(models[0]);
  });

  test('should return null for empty array', () => {
    const selector = new RoundRobinSelector();
    expect(selector.select([])).toBeNull();
  });

  test('should track separate keys independently', () => {
    const selector = new RoundRobinSelector();
    const models = mockModelList.slice(0, 3);
    
    const sel1a = selector.select(models, 'key1');
    const sel2a = selector.select(models, 'key2');
    const sel1b = selector.select(models, 'key1');
    
    expect(sel1a).toBe(models[0]);
    expect(sel2a).toBe(models[0]);
    expect(sel1b).toBe(models[1]);
  });

  test('should reset specific key', () => {
    const selector = new RoundRobinSelector();
    const models = mockModelList.slice(0, 3);
    
    selector.select(models, 'key1');
    selector.select(models, 'key1');
    selector.reset('key1');
    
    const sel = selector.select(models, 'key1');
    expect(sel).toBe(models[0]);
  });

  test('should reset all keys', () => {
    const selector = new RoundRobinSelector();
    const models = mockModelList.slice(0, 3);
    
    selector.select(models, 'key1');
    selector.select(models, 'key2');
    selector.reset();
    
    expect(selector.lastUsedIndex.size).toBe(0);
  });
});

describe('selectModel', () => {
  test('should throw when catalog is empty', () => {
    expect(() => {
      selectModel({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: []
      });
    }).toThrow('catalog');
  });

  test('should throw when messages are empty', () => {
    expect(() => {
      selectModel({
        messages: [],
        catalog: mockCatalog
      });
    }).toThrow('Messages');
  });

  test('should select model for simple request', () => {
    const result = selectModel({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog
    });
    
    expect(result.model).toBeDefined();
    expect(result.category).toBe(ModelCategory.SMALL);
    expect(result.analysis).toBeDefined();
  });

  test('should select model for complex request', () => {
    const result = selectModel({
      messages: [{ 
        role: 'user', 
        content: 'Explain in detail how quantum computing works'
      }],
      catalog: mockCatalog
    });
    
    expect(result.category).toBe(ModelCategory.LARGE);
  });

  test('should select model for reasoning request', () => {
    const result = selectModel({
      messages: [{ 
        role: 'user', 
        content: 'Solve this equation: x^2 + 5x + 6 = 0'
      }],
      catalog: mockCatalog
    });
    
    expect(result.category).toBe(ModelCategory.REASONING);
  });

  test('should filter by context window', () => {
    // Create a request that needs large context
    const longContent = 'a'.repeat(40000); // ~10K tokens
    
    const result = selectModel({
      messages: [{ role: 'user', content: longContent }],
      catalog: mockCatalog
    });
    
    // Should select model with large context window
    expect(result.model.context_window).toBeGreaterThan(8192);
  });

  test('should throw when no models have sufficient context', () => {
    const hugeContent = 'a'.repeat(1000000); // Way too big
    
    expect(() => {
      selectModel({
        messages: [{ role: 'user', content: hugeContent }],
        catalog: mockCatalog
      });
    }).toThrow('context window');
  });

  test('should respect rate limits', () => {
    const tracker = new RateLimitTracker();
    tracker.updateFrom429('groq', 'llama-3.2-8b', 60);
    
    const result = selectModel({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog,
      rateLimitTracker: tracker
    });
    
    expect(result.model.name).not.toBe('llama-3.2-8b');
  });

  test('should throw when all models are rate limited', () => {
    const tracker = new RateLimitTracker();
    
    // Rate limit all models
    Object.entries(mockCatalog.providers).forEach(([providerType, provider]) => {
      provider.models.forEach(model => {
        tracker.updateFrom429(providerType, model.name, 60);
      });
    });
    
    expect(() => {
      selectModel({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog,
        rateLimitTracker: tracker
      });
    }).toThrow('rate limited');
  });

  test('should respect cost constraint', () => {
    const result = selectModel({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog,
      preferences: { maxCostPerMillion: 0.5 }
    });
    
    const avgCost = (result.model.pricing.input + result.model.pricing.output) / 2;
    expect(avgCost).toBeLessThanOrEqual(0.5);
  });

  test('should throw when no models within cost constraint', () => {
    expect(() => {
      selectModel({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog,
        preferences: { maxCostPerMillion: 0.01 }
      });
    }).toThrow('cost constraint');
  });

  test('should apply FREE_TIER strategy', () => {
    const result = selectModel({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog,
      preferences: { strategy: SelectionStrategy.FREE_TIER }
    });
    
    expect(result.model.free).toBe(true);
  });

  test('should apply COST_OPTIMIZED strategy', () => {
    const result = selectModel({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog,
      preferences: { strategy: SelectionStrategy.COST_OPTIMIZED }
    });
    
    // Should select cheapest model
    expect(result.model.name).toBe('llama-3.2-8b');
  });

  test('should apply QUALITY_OPTIMIZED strategy', () => {
    const result = selectModel({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog,
      preferences: { strategy: SelectionStrategy.QUALITY_OPTIMIZED }
    });
    
    // Should select model with largest context window in category
    expect(result.model.context_window).toBeGreaterThanOrEqual(8192);
  });

  test('should apply BALANCED strategy', () => {
    const result = selectModel({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog,
      preferences: { strategy: SelectionStrategy.BALANCED }
    });
    
    // Default balanced: free tier first
    expect(result.model.free).toBe(true);
  });

  test('should throw for unknown strategy', () => {
    expect(() => {
      selectModel({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog,
        preferences: { strategy: 'invalid_strategy' }
      });
    }).toThrow('Unknown selection strategy');
  });

  test('should use round-robin when provided', () => {
    const roundRobin = new RoundRobinSelector();
    
    const result1 = selectModel({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog,
      roundRobinSelector: roundRobin
    });
    
    const result2 = selectModel({
      messages: [{ role: 'user', content: 'Hello again' }],
      catalog: mockCatalog,
      roundRobinSelector: roundRobin
    });
    
    // Should select different models (if multiple available)
    if (result1.candidateCount > 1) {
      expect(result2.model.name).not.toBe(result1.model.name);
    }
  });

  test('should include metadata in result', () => {
    const result = selectModel({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog
    });
    
    expect(result.model).toBeDefined();
    expect(result.category).toBeDefined();
    expect(result.analysis).toBeDefined();
    expect(result.candidateCount).toBeGreaterThan(0);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
  });

  test('should handle tools in request', () => {
    const tools = [
      { type: 'function', function: { name: 'search' } }
    ];
    
    const result = selectModel({
      messages: [{ role: 'user', content: 'Search for news' }],
      tools,
      catalog: mockCatalog
    });
    
    expect(result.analysis.hasTools).toBe(true);
  });

  test('should respect max_tokens parameter', () => {
    const result = selectModel({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog,
      max_tokens: 100
    });
    
    expect(result.outputTokens).toBeLessThanOrEqual(100);
  });
});

describe('getFallbackCategories', () => {
  test('should provide fallbacks for REASONING', () => {
    const fallbacks = getFallbackCategories(ModelCategory.REASONING);
    
    expect(fallbacks).toContain(ModelCategory.LARGE);
    expect(fallbacks).toContain(ModelCategory.SMALL);
  });

  test('should provide fallbacks for LARGE', () => {
    const fallbacks = getFallbackCategories(ModelCategory.LARGE);
    
    expect(fallbacks).toContain(ModelCategory.REASONING);
    expect(fallbacks).toContain(ModelCategory.SMALL);
  });

  test('should provide fallbacks for SMALL', () => {
    const fallbacks = getFallbackCategories(ModelCategory.SMALL);
    
    expect(fallbacks).toContain(ModelCategory.LARGE);
    expect(fallbacks).not.toContain(ModelCategory.REASONING);
  });

  test('should handle unknown category', () => {
    const fallbacks = getFallbackCategories('unknown');
    
    expect(fallbacks).toContain(ModelCategory.LARGE);
    expect(fallbacks).toContain(ModelCategory.SMALL);
  });
});

describe('selectWithFallback', () => {
  test('should return primary selection when available', () => {
    const result = selectWithFallback({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog
    });
    
    expect(result.model).toBeDefined();
    expect(result.category).toBe(ModelCategory.SMALL);
  });

  test('should fallback when primary category rate limited', () => {
    const tracker = new RateLimitTracker();
    
    // Rate limit all small models
    tracker.updateFrom429('groq', 'llama-3.2-8b', 60);
    tracker.updateFrom429('groq', 'gemma-7b-it', 60);
    
    const result = selectWithFallback({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog,
      rateLimitTracker: tracker
    });
    
    // Should fallback to large category
    expect(result.model).toBeDefined();
    expect(result.category).not.toBe(ModelCategory.SMALL);
  });

  test('should throw when all fallbacks exhausted', () => {
    const tracker = new RateLimitTracker();
    
    // Rate limit ALL models
    Object.entries(mockCatalog.providers).forEach(([providerType, provider]) => {
      provider.models.forEach(model => {
        tracker.updateFrom429(providerType, model.name, 60);
      });
    });
    
    expect(() => {
      selectWithFallback({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog,
        rateLimitTracker: tracker
      });
    }).toThrow();
  });
});

describe('batchSelect', () => {
  test('should throw for non-array input', () => {
    expect(() => {
      batchSelect('not an array');
    }).toThrow('array');
  });

  test('should select models for multiple requests', () => {
    const requests = [
      {
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog
      },
      {
        messages: [{ role: 'user', content: 'Solve x^2 = 9' }],
        catalog: mockCatalog
      }
    ];
    
    const results = batchSelect(requests);
    
    expect(results.length).toBe(2);
    expect(results[0].model).toBeDefined();
    expect(results[1].model).toBeDefined();
  });

  test('should use round-robin across requests', () => {
    const requests = Array(3).fill({
      messages: [{ role: 'user', content: 'Hello' }],
      catalog: mockCatalog
    });
    
    const results = batchSelect(requests);
    
    // If multiple candidates, should distribute
    const uniqueModels = new Set(results.map(r => r.model.name));
    if (results[0].candidateCount > 1) {
      expect(uniqueModels.size).toBeGreaterThan(1);
    }
  });

  test('should handle errors gracefully', () => {
    const requests = [
      {
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog
      },
      {
        messages: [], // Invalid
        catalog: mockCatalog
      }
    ];
    
    const results = batchSelect(requests);
    
    expect(results.length).toBe(2);
    expect(results[0].model).toBeDefined();
    expect(results[1].error).toBeDefined();
  });

  test('should handle empty array', () => {
    const results = batchSelect([]);
    expect(results).toEqual([]);
  });
});
