/**
 * Load Balancer Tests
 * 
 * Tests for round-robin load balancing across providers
 */

const { LoadBalancer } = require('../../src/routing/load-balancer');
const { RateLimitTracker } = require('../../src/model-selection/rate-limit-tracker');

describe('LoadBalancer', () => {
  let loadBalancer;
  let rateLimitTracker;
  let mockProviders;

  beforeEach(() => {
    rateLimitTracker = new RateLimitTracker();
    loadBalancer = new LoadBalancer(rateLimitTracker);
    
    mockProviders = [
      {
        id: 'provider-1',
        type: 'groq-free',
        apiEndpoint: 'https://api.groq.com/v1',
        apiKey: 'key-1'
      },
      {
        id: 'provider-2',
        type: 'groq-free',
        apiEndpoint: 'https://api.groq.com/v1',
        apiKey: 'key-2'
      },
      {
        id: 'provider-3',
        type: 'groq-free',
        apiEndpoint: 'https://api.groq.com/v1',
        apiKey: 'key-3'
      }
    ];
  });

  describe('Round-Robin Distribution', () => {
    test('should distribute requests evenly across providers', async () => {
      const modelId = 'llama-3.2-8b';
      const selections = [];
      
      // Make 6 requests (2x providers)
      for (let i = 0; i < 6; i++) {
        const provider = await loadBalancer.distributeRequest(mockProviders, modelId);
        selections.push(provider.id);
      }
      
      // Should cycle through providers: 1, 2, 3, 1, 2, 3
      expect(selections).toEqual([
        'provider-1', 'provider-2', 'provider-3',
        'provider-1', 'provider-2', 'provider-3'
      ]);
    });

    test('should maintain separate round-robin state per provider type', async () => {
      const groqProviders = mockProviders;
      const openaiProviders = [
        { id: 'openai-1', type: 'openai', apiEndpoint: 'https://api.openai.com/v1', apiKey: 'key-a' },
        { id: 'openai-2', type: 'openai', apiEndpoint: 'https://api.openai.com/v1', apiKey: 'key-b' }
      ];
      
      // Select from groq
      const groq1 = await loadBalancer.distributeRequest(groqProviders, 'llama-3.2-8b');
      expect(groq1.id).toBe('provider-1');
      
      // Select from openai
      const openai1 = await loadBalancer.distributeRequest(openaiProviders, 'gpt-4o');
      expect(openai1.id).toBe('openai-1');
      
      // Select from groq again
      const groq2 = await loadBalancer.distributeRequest(groqProviders, 'llama-3.2-8b');
      expect(groq2.id).toBe('provider-2');
      
      // Select from openai again
      const openai2 = await loadBalancer.distributeRequest(openaiProviders, 'gpt-4o');
      expect(openai2.id).toBe('openai-2');
    });

    test('should reset to start after reaching end', async () => {
      const provider1 = await loadBalancer.distributeRequest(mockProviders, 'model-1');
      const provider2 = await loadBalancer.distributeRequest(mockProviders, 'model-1');
      const provider3 = await loadBalancer.distributeRequest(mockProviders, 'model-1');
      const provider4 = await loadBalancer.distributeRequest(mockProviders, 'model-1');
      
      expect(provider1.id).toBe('provider-1');
      expect(provider2.id).toBe('provider-2');
      expect(provider3.id).toBe('provider-3');
      expect(provider4.id).toBe('provider-1'); // Back to start
    });
  });

  describe('Rate Limit Aware Distribution', () => {
    test('should skip rate-limited providers', async () => {
      const modelId = 'llama-3.2-8b';
      
      // Rate limit provider-2
      rateLimitTracker.updateFrom429('provider-2', modelId, 60);
      
      const selections = [];
      for (let i = 0; i < 6; i++) {
        const provider = await loadBalancer.distributeRequest(mockProviders, modelId);
        selections.push(provider.id);
      }
      
      // Should skip provider-2: 1, 3, 1, 3, 1, 3
      expect(selections).toEqual([
        'provider-1', 'provider-3', 'provider-1',
        'provider-3', 'provider-1', 'provider-3'
      ]);
    });

    test('should return null when all providers are rate-limited', async () => {
      const modelId = 'llama-3.2-8b';
      
      // Rate limit all providers
      mockProviders.forEach(provider => {
        rateLimitTracker.updateFrom429(provider.id, modelId, 60);
      });
      
      const result = await loadBalancer.distributeRequest(mockProviders, modelId);
      expect(result).toBeNull();
    });

    test('should resume using provider after rate limit expires', async () => {
      const modelId = 'llama-3.2-8b';
      
      // Rate limit provider-2 with short timeout
      rateLimitTracker.updateFrom429('provider-2', modelId, 0.1); // 100ms
      
      // First request should skip provider-2
      const provider1 = await loadBalancer.distributeRequest(mockProviders, modelId);
      expect(provider1.id).not.toBe('provider-2');
      
      // Wait for rate limit to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Now provider-2 should be available again
      const provider2 = await loadBalancer.distributeRequest(mockProviders, modelId);
      const provider3 = await loadBalancer.distributeRequest(mockProviders, modelId);
      const provider4 = await loadBalancer.distributeRequest(mockProviders, modelId);
      
      // Should include provider-2 in rotation
      const ids = [provider2.id, provider3.id, provider4.id];
      expect(ids).toContain('provider-2');
    });
  });

  describe('Single Provider Scenarios', () => {
    test('should return same provider when only one available', async () => {
      const singleProvider = [mockProviders[0]];
      
      const provider1 = await loadBalancer.distributeRequest(singleProvider, 'model-1');
      const provider2 = await loadBalancer.distributeRequest(singleProvider, 'model-1');
      
      expect(provider1.id).toBe('provider-1');
      expect(provider2.id).toBe('provider-1');
    });

    test('should handle empty provider list', async () => {
      const result = await loadBalancer.distributeRequest([], 'model-1');
      expect(result).toBeNull();
    });
  });

  describe('Token Estimation', () => {
    test('should pass token estimate to rate limit check', async () => {
      const modelId = 'llama-3.2-8b';
      const tokens = 5000;
      
      // Simulate provider-1 having used 6500 tokens recently
      rateLimitTracker.trackRequest('provider-1', modelId, 6500, { tpm: 7000 });
      
      const provider = await loadBalancer.distributeRequest(mockProviders, modelId, tokens);
      
      // Should skip provider-1 due to insufficient token capacity
      expect(provider.id).not.toBe('provider-1');
    });
  });

  describe('State Management', () => {
    test('should maintain state across multiple calls', async () => {
      const lb1 = new LoadBalancer(rateLimitTracker);
      
      const p1 = await lb1.distributeRequest(mockProviders, 'model-1');
      const p2 = await lb1.distributeRequest(mockProviders, 'model-1');
      
      expect(p1.id).toBe('provider-1');
      expect(p2.id).toBe('provider-2');
    });

    test('should allow resetting round-robin state', () => {
      loadBalancer.reset('groq-free');
      
      // After reset, should start from beginning
      const p1 = loadBalancer.distributeRequest(mockProviders, 'model-1');
      expect(p1).resolves.toHaveProperty('id', 'provider-1');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid provider list', async () => {
      const result1 = await loadBalancer.distributeRequest(null, 'model-1');
      expect(result1).toBeNull();
      
      const result2 = await loadBalancer.distributeRequest(undefined, 'model-1');
      expect(result2).toBeNull();
    });

    test('should handle missing model ID', async () => {
      const result = await loadBalancer.distributeRequest(mockProviders, null);
      expect(result).toBeDefined(); // Should still distribute, just no rate limit check
    });
  });
});
