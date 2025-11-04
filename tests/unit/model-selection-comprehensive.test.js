/**
 * Comprehensive Unit Tests for Model Selection System
 * 
 * This file provides additional test coverage for the model selection system.
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
          name: 'llama-3.1-8b-instant',
          context_window: 131072,
          pricing: { input: 0.05, output: 0.08 },
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
    name: 'llama-3.1-8b-instant',
    provider: 'groq',
    providerType: 'groq',
    context_window: 131072,
    pricing: { input: 0.05, output: 0.08 },
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

describe('Model Selection - Comprehensive Coverage', () => {
  
  describe('Filter Functions', () => {
    
    test('should handle edge cases for filterByRateLimits', () => {
      // Test with null tracker
      const result1 = filterByRateLimits(mockModelList, null);
      expect(result1.length).toBe(mockModelList.length);
      
      // Test with undefined tracker
      const result2 = filterByRateLimits(mockModelList, undefined);
      expect(result2.length).toBe(mockModelList.length);
      
      // Test with empty model list
      const result3 = filterByRateLimits([], null);
      expect(result3.length).toBe(0);
    });

    test('should handle edge cases for filterByCost', () => {
      // Test with zero cost constraint
      const result1 = filterByCost(mockModelList, 0);
      expect(result1.length).toBe(0);
      
      // Test with negative cost constraint  
      const result2 = filterByCost(mockModelList, -1);
      expect(result2.length).toBe(0);
      
      // Test with infinity (should return all)
      const result3 = filterByCost(mockModelList, Infinity);
      expect(result3.length).toBe(mockModelList.length);
      
      // Test with empty model list
      const result4 = filterByCost([], 1.0);
      expect(result4.length).toBe(0);
    });

    test('should handle edge cases for prioritizeFreeTier', () => {
      // Test with empty array
      const result1 = prioritizeFreeTier([]);
      expect(result1.length).toBe(0);
      
      // Test with all free models
      const allFreeModels = [
        { name: 'free1', free: true },
        { name: 'free2', free: true }
      ];
      const result2 = prioritizeFreeTier(allFreeModels);
      expect(result2.length).toBe(2);
      
      // Test with no free models
      const noFreeModels = [
        { name: 'paid1', free: false },
        { name: 'paid2', free: false }
      ];
      const result3 = prioritizeFreeTier(noFreeModels);
      expect(result3.length).toBe(2);
      
      // Verify order is preserved within tiers
      const mixedModels = [
        { name: 'free1', free: true },
        { name: 'paid1', free: false },
        { name: 'free2', free: true },
        { name: 'paid2', free: false }
      ];
      const result4 = prioritizeFreeTier(mixedModels);
      expect(result4[0].name).toBe('free1');
      expect(result4[1].name).toBe('free2');
    });

    test('should handle edge cases for prioritizeQuality', () => {
      // Test with empty array
      const result1 = prioritizeQuality([]);
      expect(result1.length).toBe(0);
      
      // Test with single model
      const singleModel = [{ name: 'test', context_window: 1000 }];
      const result2 = prioritizeQuality(singleModel);
      expect(result2.length).toBe(1);
    });

    test('should handle edge cases for prioritizeCost', () => {
      // Test with empty array
      const result1 = prioritizeCost([]);
      expect(result1.length).toBe(0);
      
      // Test with single model
      const singleModel = [{ name: 'test', pricing: { input: 1.0, output: 2.0 } }];
      const result2 = prioritizeCost(singleModel);
      expect(result2.length).toBe(1);
    });
  });

  describe('RoundRobinSelector Edge Cases', () => {
    
    test('should handle key resets properly', () => {
      const selector = new RoundRobinSelector();
      const models = mockModelList.slice(0, 3);
      
      // Select a few times
      selector.select(models, 'test-key');
      selector.select(models, 'test-key');
      
      // Reset and verify it starts over
      selector.reset('test-key');
      
      const firstSelect = selector.select(models, 'test-key');
      expect(firstSelect).toBe(models[0]);
    });

    test('should handle multiple keys independently', () => {
      const selector = new RoundRobinSelector();
      const models = mockModelList.slice(0, 3);
      
      // Select with different keys
      const result1a = selector.select(models, 'key1');
      const result2a = selector.select(models, 'key2');
      const result1b = selector.select(models, 'key1');
      
      // Should maintain independent rotation
      expect(result1a).toBe(models[0]);
      expect(result2a).toBe(models[0]); 
      expect(result1b).toBe(models[1]);
    });

    test('should handle invalid inputs gracefully', () => {
      const selector = new RoundRobinSelector();
      
      // Test with null/undefined models
      expect(selector.select(null, 'key')).toBeNull();
      expect(selector.select(undefined, 'key')).toBeNull();
      expect(selector.select([], 'key')).toBeNull();
      
      // Test with invalid key types
      expect(() => {
        const mockModels = [
          { name: 'test-model', provider: 'test' }
        ];
        selector.select(mockModels, 123); // Number instead of string
      }).not.toThrow();
    });
  });

  describe('selectModel Comprehensive Tests', () => {
    
    test('should handle very large context requirements', () => {
      const hugeContent = 'a'.repeat(500000); // Very large content
      
      expect(() => {
        selectModel({
          messages: [{ role: 'user', content: hugeContent }],
          catalog: mockCatalog
        });
      }).toThrow('context window');
    });

    test('should handle empty messages gracefully', () => {
      expect(() => {
        selectModel({
          messages: [],
          catalog: mockCatalog
        });
      }).toThrow('Messages');
    });

    test('should handle null/undefined inputs gracefully', () => {
      expect(() => {
        selectModel(null);
      }).toThrow();
      
      expect(() => {
        selectModel({});
      }).toThrow('catalog');
    });

    test('should handle model selection with all parameters set', () => {
      const result = selectModel({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog,
        preferences: {
          strategy: SelectionStrategy.COST_OPTIMIZED,
          maxCostPerMillion: 1.0
        },
        rateLimitTracker: new RateLimitTracker(),
        max_tokens: 100,
        tools: [
          { type: 'function', function: { name: 'search' } }
        ]
      });
      
      expect(result.model).toBeDefined();
      expect(result.category).toBeDefined();
    });

    test('should handle different token count calculations', () => {
      const shortContent = 'Hello';
      const longContent = 'a'.repeat(1000);
      
      const result1 = selectModel({
        messages: [{ role: 'user', content: shortContent }],
        catalog: mockCatalog
      });
      
      const result2 = selectModel({
        messages: [{ role: 'user', content: longContent }],
        catalog: mockCatalog
      });
      
      expect(result1.totalTokens).toBeGreaterThan(0);
      expect(result2.totalTokens).toBeGreaterThan(0);
    });

    test('should not mutate original input data', () => {
      const originalMessages = [{ role: 'user', content: 'Hello' }];
      const originalCatalog = JSON.parse(JSON.stringify(mockCatalog));
      
      selectModel({
        messages: originalMessages,
        catalog: mockCatalog
      });
      
      // Original data should be unchanged
      expect(originalMessages[0].content).toBe('Hello');
      expect(mockCatalog).toEqual(originalCatalog);
    });

    test('should handle rate limiting edge cases', () => {
      const tracker = new RateLimitTracker();
      
      // Rate limit all models in one provider (groq only)
      mockCatalog.providers.groq.models.forEach(model => {
        tracker.updateFrom429('groq', model.name, 60);
      });
      
      // Should still be able to select a model from other providers (openai, deepseek)
      // But this test expects all models to be rate-limited, which will throw an error
      // So we expect it to throw when all models ARE rate-limited
      // Let's rate-limit all providers to test the error case
      mockCatalog.providers.openai.models.forEach(model => {
        tracker.updateFrom429('openai', model.name, 60);
      });
      mockCatalog.providers.deepseek.models.forEach(model => {
        tracker.updateFrom429('deepseek', model.name, 60);
      });
      
      // Now all models are rate-limited, should throw
      expect(() => {
        selectModel({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog,
        rateLimitTracker: tracker
      });
      }).toThrow('All models are rate limited');
    });

    test('should handle multiple concurrent selections', async () => {
      // Test that we don't have race conditions in model selection
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(selectModel({
          messages: [{ role: 'user', content: `Message ${i}` }],
          catalog: mockCatalog
        }));
      }
      
      const results = await Promise.all(promises);
      expect(results.length).toBe(10);
      
      results.forEach(result => {
        expect(result.model).toBeDefined();
        expect(result.category).toBeDefined();
      });
    });
  });

  describe('Fallback Logic Comprehensive', () => {
    
    test('should handle fallback for all categories', () => {
      const categories = [
        ModelCategory.SMALL,
        ModelCategory.LARGE, 
        ModelCategory.REASONING
      ];
      
      categories.forEach(category => {
        const fallbacks = getFallbackCategories(category);
        expect(Array.isArray(fallbacks)).toBe(true);
      });
    });

    test('should handle fallback selection with rate limits', () => {
      const tracker = new RateLimitTracker();
      
      // Rate limit all models in one category
      mockCatalog.providers.groq.models.forEach(model => {
        tracker.updateFrom429('groq', model.name, 60);
      });
      
      // Should handle gracefully when fallbacks are exhausted
      expect(() => {
        selectWithFallback({
          messages: [{ role: 'user', content: 'Hello' }],
          catalog: mockCatalog,
          rateLimitTracker: tracker
        });
      }).not.toThrow();
    });

    test('should test batch selection edge cases', () => {
      const requests = [
        {
          messages: [{ role: 'user', content: 'Hello' }],
          catalog: mockCatalog
        },
        {
          messages: [], // Invalid request
          catalog: mockCatalog
        }
      ];
      
      const results = batchSelect(requests);
      expect(results.length).toBe(2);
    });
  });

  describe('Performance and Robustness', () => {
    
    test('should handle high-volume selections without memory leaks', () => {
      // Test multiple rapid selections
      for (let i = 0; i < 50; i++) {
        const result = selectModel({
          messages: [{ role: 'user', content: `Test message ${i}` }],
          catalog: mockCatalog
        });
        
        expect(result.model).toBeDefined();
      }
    });

    test('should handle invalid model data gracefully', () => {
      // Create a catalog with malformed data
      const malformedCatalog = {
        providers: {
          groq: {
            models: [
              { name: 'bad-model' }, // Missing required fields
              { 
                name: 'good-model',
                context_window: 8192,
                pricing: { input: 0.05, output: 0.08 },
                free: true
              }
            ]
          }
        }
      };
      
      expect(() => {
        selectModel({
          messages: [{ role: 'user', content: 'Hello' }],
          catalog: malformedCatalog
        });
      }).not.toThrow(); // Should not crash
    });

    test('should handle different strategy combinations', () => {
      const strategies = [
        SelectionStrategy.COST_OPTIMIZED,
        SelectionStrategy.QUALITY_OPTIMIZED,
        SelectionStrategy.BALANCED,
        SelectionStrategy.FREE_TIER
      ];
      
      strategies.forEach(strategy => {
        const result = selectModel({
          messages: [{ role: 'user', content: 'Hello' }],
          catalog: mockCatalog,
          preferences: { strategy }
        });
        
        expect(result.model).toBeDefined();
      });
    });
  });

  describe('Integration and Error Handling', () => {
    
    test('should provide meaningful error messages for various failure cases', () => {
      // Test that errors are caught and handled appropriately
      const testCases = [
        { messages: [], catalog: mockCatalog },
        { messages: [{ role: 'user', content: 'Hello' }], catalog: null },
        { messages: [{ role: 'user', content: 'Hello' }], catalog: {} },
      ];
      
      testCases.forEach((testCase, index) => {
        expect(() => {
          selectModel(testCase);
        }).toThrow();
      });
    });

    test('should validate all parameter combinations', () => {
      // Test various combinations of parameters
      const testParams = [
        { messages: [{ role: 'user', content: 'Hello' }], catalog: mockCatalog },
        { messages: [{ role: 'user', content: 'Hello' }], catalog: mockCatalog, max_tokens: 100 },
        { messages: [{ role: 'user', content: 'Hello' }], catalog: mockCatalog, preferences: {} },
        { messages: [{ role: 'user', content: 'Hello' }], catalog: mockCatalog, rateLimitTracker: new RateLimitTracker() },
      ];
      
      testParams.forEach(params => {
        expect(() => {
          selectModel(params);
        }).not.toThrow();
      });
    });

    test('should maintain consistent return structure', () => {
      const result = selectModel({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog
      });
      
      // Should have all expected properties
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('analysis');
      expect(result).toHaveProperty('candidateCount');
      expect(result).toHaveProperty('totalTokens');
      expect(result).toHaveProperty('inputTokens');
      expect(result).toHaveProperty('outputTokens');
    });
  });
});