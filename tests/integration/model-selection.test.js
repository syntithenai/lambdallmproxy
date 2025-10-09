/**
 * Integration Tests for Model Selection System
 * 
 * Tests the complete model selection flow with all modules working together
 */

const { selectModel, selectWithFallback, batchSelect } = require('../../src/model-selection/selector');
const { RateLimitTracker } = require('../../src/model-selection/rate-limit-tracker');
const { ModelCategory } = require('../../src/model-selection/categorizer');

describe('Model Selection Integration Tests', () => {
  let mockCatalog;
  
  beforeEach(() => {
    // Create a comprehensive mock catalog for integration testing
    mockCatalog = {
      providers: {
        groq: {
          models: [
            {
              name: 'llama-3.2-1b',
              context_window: 8192,
              pricing: { input: 0.04, output: 0.04 },
              free: true
            },
            {
              name: 'llama-3.2-3b',
              context_window: 8192,
              pricing: { input: 0.06, output: 0.06 },
              free: true
            },
            {
              name: 'llama-3.3-70b',
              context_window: 131072,
              pricing: { input: 0.59, output: 0.79 },
              free: false
            }
          ]
        },
        openai: {
          models: [
            {
              name: 'gpt-3.5-turbo',
              context_window: 16385,
              pricing: { input: 0.50, output: 1.50 },
              free: false
            },
            {
              name: 'gpt-4o-mini',
              context_window: 128000,
              pricing: { input: 0.15, output: 0.60 },
              free: false
            },
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
              name: 'deepseek-chat',
              context_window: 64000,
              pricing: { input: 0.14, output: 0.28 },
              free: false
            },
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
  });

  describe('Simple Request Flow', () => {
    test('should select small free model for simple request', () => {
      const result = selectModel({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog
      });
      
      expect(result.model).toBeDefined();
      expect(result.category).toBe(ModelCategory.SMALL);
      expect(result.model.free).toBe(true);
      expect(['llama-3.2-1b', 'llama-3.2-3b']).toContain(result.model.name);
    });

    test('should estimate tokens correctly for simple request', () => {
      const result = selectModel({
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
        catalog: mockCatalog
      });
      
      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.outputTokens).toBeGreaterThan(0);
      expect(result.totalTokens).toBe(result.inputTokens + result.outputTokens);
    });

    test('should include analysis in result', () => {
      const result = selectModel({
        messages: [{ role: 'user', content: 'Tell me a joke' }],
        catalog: mockCatalog
      });
      
      expect(result.analysis).toBeDefined();
      expect(result.analysis.type).toBeDefined();
      expect(result.analysis.estimatedComplexity).toBeGreaterThan(0);
      expect(result.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('Complex Request Flow', () => {
    test('should select large model for complex request', () => {
      const result = selectModel({
        messages: [{
          role: 'user',
          content: 'Explain in detail how neural networks work, including backpropagation, gradient descent, and various architectures like CNNs and RNNs.'
        }],
        catalog: mockCatalog
      });
      
      expect(result.model).toBeDefined();
      expect(result.category).toBe(ModelCategory.LARGE);
      expect(result.model.context_window).toBeGreaterThan(16000);
    });

    test('should handle multi-turn conversations', () => {
      const messages = [
        { role: 'user', content: 'What is machine learning?' },
        { role: 'assistant', content: 'Machine learning is...' },
        { role: 'user', content: 'Can you give more details about neural networks?' },
        { role: 'assistant', content: 'Neural networks are...' },
        { role: 'user', content: 'Tell me about training methods' }
      ];
      
      const result = selectModel({
        messages,
        catalog: mockCatalog
      });
      
      expect(result.model).toBeDefined();
      expect(result.category).toBeDefined();
      expect(result.totalTokens).toBeGreaterThan(100);
    });

    test('should estimate higher tokens for long conversation', () => {
      const messages = Array(10).fill(null).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'This is a message in a long conversation with substantial content that will require many tokens to process.'
      }));
      
      const result = selectModel({
        messages,
        catalog: mockCatalog
      });
      
      expect(result.totalTokens).toBeGreaterThan(200);
    });
  });

  describe('Reasoning Request Flow', () => {
    test('should select reasoning model for reasoning keywords', () => {
      const result = selectModel({
        messages: [{
          role: 'user',
          content: 'Think step by step and explain the logic behind solving this problem: If x + 2 = 5, what is x?'
        }],
        catalog: mockCatalog
      });
      
      expect(result.model).toBeDefined();
      expect(result.category).toBe(ModelCategory.REASONING);
      expect(['o1-preview', 'deepseek-reasoner']).toContain(result.model.name);
    });

    test('should detect reasoning from analyze keyword', () => {
      const result = selectModel({
        messages: [{
          role: 'user',
          content: 'Analyze the following code and explain the algorithm complexity'
        }],
        catalog: mockCatalog
      });
      
      expect(result.category).toBe(ModelCategory.REASONING);
    });
  });

  describe('Rate Limit Integration', () => {
    test('should skip rate-limited models', () => {
      const tracker = new RateLimitTracker();
      
      // Rate limit ALL small models across all providers
      tracker.updateFrom429('groq', 'llama-3.2-1b', 60);
      tracker.updateFrom429('groq', 'llama-3.2-3b', 60);
      tracker.updateFrom429('openai', 'gpt-3.5-turbo', 60);
      tracker.updateFrom429('openai', 'gpt-4o-mini', 60);
      
      // Verify models are marked as unavailable
      expect(tracker.isAvailable('groq', 'llama-3.2-1b', 100)).toBe(false);
      expect(tracker.isAvailable('openai', 'gpt-3.5-turbo', 100)).toBe(false);
      
      const result = selectWithFallback({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog,
        rateLimitTracker: tracker
      });
      
      // Should have selected a model (fallback should work)
      expect(result.model).toBeDefined();
      expect(result.model.name).toBeDefined();
      // Should not be a rate-limited small model
      expect(['llama-3.2-1b', 'llama-3.2-3b', 'gpt-3.5-turbo', 'gpt-4o-mini']).not.toContain(result.model.name);
    });

    test('should use rate limit info in selection', () => {
      const tracker = new RateLimitTracker();
      
      // Rate limit one free model
      tracker.updateFrom429('groq', 'llama-3.2-1b', 30);
      
      const result = selectModel({
        messages: [{ role: 'user', content: 'Hi' }],
        catalog: mockCatalog,
        rateLimitTracker: tracker
      });
      
      // Should select the other free model
      expect(result.model.name).not.toBe('llama-3.2-1b');
      expect(result.model.free).toBe(true);
    });

    test('should throw when all models are rate-limited', () => {
      const tracker = new RateLimitTracker();
      
      // Rate limit ALL models
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
  });

  describe('Cost Optimization', () => {
    test('should prefer free models over paid', () => {
      const result = selectModel({
        messages: [{ role: 'user', content: 'Hello world' }],
        catalog: mockCatalog,
        preferences: {
          strategy: 'balanced',
          preferFree: true
        }
      });
      
      expect(result.model.free).toBe(true);
    });

    test('should respect cost constraint', () => {
      const result = selectModel({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog,
        preferences: {
          strategy: 'cost_optimized',
          maxCostPerMillion: 0.20
        }
      });
      
      const totalCost = result.model.pricing.input + result.model.pricing.output;
      expect(totalCost).toBeLessThanOrEqual(0.20);
    });

    test('should use cost_optimized strategy', () => {
      const result = selectModel({
        messages: [{ role: 'user', content: 'Tell me about AI' }],
        catalog: mockCatalog,
        preferences: {
          strategy: 'cost_optimized',
          preferFree: false
        }
      });
      
      expect(result.model).toBeDefined();
      // Should select cheapest available model
      const totalCost = result.model.pricing.input + result.model.pricing.output;
      expect(totalCost).toBeLessThan(1.0);
    });
  });

  describe('Fallback Scenarios', () => {
    test('should fallback from small to large when rate-limited', () => {
      const tracker = new RateLimitTracker();
      
      // Rate limit ALL small models
      tracker.updateFrom429('groq', 'llama-3.2-1b', 60);
      tracker.updateFrom429('groq', 'llama-3.2-3b', 60);
      tracker.updateFrom429('openai', 'gpt-3.5-turbo', 60);
      tracker.updateFrom429('openai', 'gpt-4o-mini', 60);
      
      const result = selectWithFallback({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog,
        rateLimitTracker: tracker
      });
      
      expect(result.model).toBeDefined();
      // Should select a non-rate-limited model
      expect(['llama-3.2-1b', 'llama-3.2-3b', 'gpt-3.5-turbo', 'gpt-4o-mini']).not.toContain(result.model.name);
    });

    test('should try multiple fallback categories', () => {
      const tracker = new RateLimitTracker();
      
      // Rate limit small and large models, leave reasoning
      tracker.updateFrom429('groq', 'llama-3.2-1b', 60);
      tracker.updateFrom429('groq', 'llama-3.2-3b', 60);
      tracker.updateFrom429('groq', 'llama-3.3-70b', 60);
      tracker.updateFrom429('openai', 'gpt-4o', 60);
      tracker.updateFrom429('openai', 'gpt-4o-mini', 60);
      
      const result = selectWithFallback({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog,
        rateLimitTracker: tracker
      });
      
      // Should fallback to reasoning or other available category
      expect(result.model).toBeDefined();
    });
  });

  describe('Batch Processing', () => {
    test('should process multiple requests', () => {
      const requests = [
        { messages: [{ role: 'user', content: 'Hello' }], catalog: mockCatalog },
        { messages: [{ role: 'user', content: 'How are you?' }], catalog: mockCatalog },
        { messages: [{ role: 'user', content: 'Tell me a joke' }], catalog: mockCatalog }
      ];
      
      const results = batchSelect(requests);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.model).toBeDefined();
        expect(result.category).toBeDefined();
      });
    });

    test('should handle mix of request types in batch', () => {
      const requests = [
        { messages: [{ role: 'user', content: 'Hi' }], catalog: mockCatalog }, // Simple
        { messages: [{ role: 'user', content: 'Please explain in detail how quantum physics works, including wave-particle duality, superposition, and quantum entanglement' }], catalog: mockCatalog }, // Complex
        { messages: [{ role: 'user', content: 'Think step by step: solve 2x + 5 = 15' }], catalog: mockCatalog } // Reasoning
      ];
      
      const results = batchSelect(requests);
      
      expect(results).toHaveLength(3);
      expect(results[0].category).toBe(ModelCategory.SMALL);
      expect(results[1].category).toBe(ModelCategory.LARGE);
      expect(results[2].category).toBe(ModelCategory.REASONING);
    });
  });

  describe('Context Window Handling', () => {
    test('should filter models by context window requirement', () => {
      // Create a very long message that needs large context
      const longContent = 'word '.repeat(5000); // ~5000 tokens
      
      const result = selectModel({
        messages: [{ role: 'user', content: longContent }],
        catalog: mockCatalog
      });
      
      expect(result.model).toBeDefined();
      expect(result.model.context_window).toBeGreaterThan(10000);
    });

    test('should throw when no model has sufficient context', () => {
      // Create an impossibly long message
      const veryLongContent = 'word '.repeat(200000); // ~200k tokens
      
      expect(() => {
        selectModel({
          messages: [{ role: 'user', content: veryLongContent }],
          catalog: mockCatalog
        });
      }).toThrow('context window');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty message content gracefully', () => {
      const result = selectModel({
        messages: [{ role: 'user', content: '' }],
        catalog: mockCatalog
      });
      
      expect(result.model).toBeDefined();
    });

    test('should handle special characters in messages', () => {
      const result = selectModel({
        messages: [{ role: 'user', content: '🚀 Hello! @#$%^&*()' }],
        catalog: mockCatalog
      });
      
      expect(result.model).toBeDefined();
    });

    test('should handle max_tokens parameter', () => {
      const result = selectModel({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog,
        max_tokens: 100
      });
      
      expect(result.outputTokens).toBeLessThanOrEqual(100);
    });

    test('should handle system messages in conversation', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' }
      ];
      
      const result = selectModel({
        messages,
        catalog: mockCatalog
      });
      
      expect(result.model).toBeDefined();
      expect(result.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    test('should complete selection quickly', () => {
      const start = Date.now();
      
      selectModel({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog
      });
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should be fast
    });

    test('should handle large batch efficiently', () => {
      const requests = Array(50).fill(null).map(() => ({
        messages: [{ role: 'user', content: 'Hello' }],
        catalog: mockCatalog
      }));
      
      const start = Date.now();
      const results = batchSelect(requests);
      const duration = Date.now() - start;
      
      expect(results).toHaveLength(50);
      expect(duration).toBeLessThan(500); // Should process batch quickly
    });
  });
});
