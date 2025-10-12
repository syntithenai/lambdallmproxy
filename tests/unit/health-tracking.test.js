/**
 * Tests for Health Tracking (Step 14)
 * Tests health scores, consecutive error tracking, and health-based filtering
 */

const { ModelRateLimit, RateLimitTracker } = require('../../src/model-selection/rate-limit-tracker');

describe('Health Tracking', () => {
  let rateLimitTracker;

  beforeEach(() => {
    rateLimitTracker = new RateLimitTracker();
  });

  describe('ModelRateLimit - Health Score Calculation', () => {
    test('should initialize with perfect health', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      expect(limit.consecutiveErrors).toBe(0);
      expect(limit.totalRequests).toBe(0);
      expect(limit.successfulRequests).toBe(0);
      expect(limit.getHealthScore()).toBe(100);
      expect(limit.isHealthy()).toBe(true);
    });

    test('should record successful requests', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      limit.recordSuccess();
      limit.recordSuccess();
      limit.recordSuccess();

      expect(limit.totalRequests).toBe(3);
      expect(limit.successfulRequests).toBe(3);
      expect(limit.consecutiveErrors).toBe(0);
      expect(limit.getHealthScore()).toBe(100);
    });

    test('should record errors and reduce health score', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      // 10 successes, then 5 errors
      for (let i = 0; i < 10; i++) limit.recordSuccess();
      for (let i = 0; i < 5; i++) limit.recordError();

      expect(limit.totalRequests).toBe(15);
      expect(limit.successfulRequests).toBe(10);
      expect(limit.consecutiveErrors).toBe(5);

      const score = limit.getHealthScore();
      
      // Success rate: 10/15 = 66.7% * 70 = 46.7 points
      // Error penalty: min(5, 10) = 5 * 3 = 15 points deducted
      // Score = 70 * 0.667 - 15 ≈ 31.7
      expect(score).toBeCloseTo(31.7, 0);
    });

    test('should mark unhealthy after 3 consecutive errors', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      limit.recordSuccess();
      limit.recordError();
      limit.recordError();
      
      expect(limit.isHealthy()).toBe(true); // Still healthy at 2 errors

      limit.recordError();
      
      expect(limit.consecutiveErrors).toBe(3);
      expect(limit.isHealthy()).toBe(false); // Unhealthy at 3 errors
    });

    test('should reset consecutive errors on success', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      limit.recordError();
      limit.recordError();
      expect(limit.consecutiveErrors).toBe(2);

      limit.recordSuccess();
      expect(limit.consecutiveErrors).toBe(0);
      expect(limit.isHealthy()).toBe(true);
    });

    test('should mark unhealthy when health score < 30', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      // 20 requests: 5 successes, 15 failures
      for (let i = 0; i < 5; i++) limit.recordSuccess();
      for (let i = 0; i < 15; i++) limit.recordError();

      const score = limit.getHealthScore();
      
      // Success rate: 5/20 = 25% * 70 = 17.5 points
      // Error penalty: min(15, 10) = 10 * 3 = 30 points deducted
      // Score = 17.5 - 30 = -12.5, clamped to 0
      expect(score).toBeLessThan(30);
      expect(limit.isHealthy()).toBe(false);
    });

    test('should handle zero requests gracefully', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      expect(limit.getHealthScore()).toBe(100);
      expect(limit.isHealthy()).toBe(true);
    });

    test('should cap error penalty at 30 points', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      // 20 consecutive errors
      for (let i = 0; i < 20; i++) limit.recordError();

      const score = limit.getHealthScore();
      
      // Success rate: 0% * 70 = 0 points
      // Error penalty: min(20, 10) = 10 * 3 = 30 points (capped)
      // Score = 0 - 30 = -30, clamped to 0
      expect(score).toBe(0);
    });

    test('should recover health score after errors clear', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      // Start with some errors
      for (let i = 0; i < 5; i++) limit.recordError();
      
      const unhealthyScore = limit.getHealthScore();
      expect(unhealthyScore).toBeLessThan(100);

      // Recover with successes
      for (let i = 0; i < 10; i++) limit.recordSuccess();

      const recoveredScore = limit.getHealthScore();
      
      // Success rate: 10/15 = 66.7% * 70 = 46.7 points
      // Consecutive errors reset to 0, no penalty
      // Score = 46.7 - 0 = 46.7
      expect(recoveredScore).toBeGreaterThan(unhealthyScore);
      expect(limit.consecutiveErrors).toBe(0);
      expect(limit.isHealthy()).toBe(true);
    });
  });

  describe('RateLimitTracker - Health Methods', () => {
    test('should record success via tracker', () => {
      rateLimitTracker.recordSuccess('openai', 'gpt-4o');
      
      const score = rateLimitTracker.getHealthScore('openai', 'gpt-4o');
      expect(score).toBe(100);
    });

    test('should record error via tracker', () => {
      rateLimitTracker.recordSuccess('openai', 'gpt-4o');
      rateLimitTracker.recordError('openai', 'gpt-4o');
      rateLimitTracker.recordError('openai', 'gpt-4o');
      rateLimitTracker.recordError('openai', 'gpt-4o');
      
      const score = rateLimitTracker.getHealthScore('openai', 'gpt-4o');
      expect(score).toBeLessThan(100);
    });

    test('should return 100 for unknown model', () => {
      const score = rateLimitTracker.getHealthScore('unknown', 'unknown-model');
      expect(score).toBe(100);
    });

    test('should track health across multiple models', () => {
      // Healthy model
      rateLimitTracker.recordSuccess('groq', 'llama-3.1-8b-instant');
      rateLimitTracker.recordSuccess('groq', 'llama-3.1-8b-instant');
      rateLimitTracker.recordSuccess('groq', 'llama-3.1-8b-instant');

      // Unhealthy model
      rateLimitTracker.recordError('openai', 'gpt-4o');
      rateLimitTracker.recordError('openai', 'gpt-4o');
      rateLimitTracker.recordError('openai', 'gpt-4o');
      rateLimitTracker.recordError('openai', 'gpt-4o');

      const groqScore = rateLimitTracker.getHealthScore('groq', 'llama-3.1-8b-instant');
      const openaiScore = rateLimitTracker.getHealthScore('openai', 'gpt-4o');

      expect(groqScore).toBe(100);
      expect(openaiScore).toBeLessThan(30);
    });
  });

  describe('Health-Based Filtering - filterByHealth', () => {
    test('should filter out unhealthy models', () => {
      // Create healthy model
      for (let i = 0; i < 5; i++) {
        rateLimitTracker.recordSuccess('groq', 'llama-3.1-8b-instant');
      }

      // Create unhealthy model
      for (let i = 0; i < 5; i++) {
        rateLimitTracker.recordError('openai', 'gpt-4o');
      }

      const models = [
        { provider: 'groq', name: 'llama-3.1-8b-instant', providerType: 'groq' },
        { provider: 'openai', name: 'gpt-4o', providerType: 'openai' }
      ];

      const healthy = rateLimitTracker.filterByHealth(models);

      expect(healthy).toHaveLength(1);
      expect(healthy[0].name).toBe('llama-3.1-8b-instant');
    });

    test('should keep models with no history (assume healthy)', () => {
      const models = [
        { provider: 'groq', name: 'llama-3.1-8b-instant', providerType: 'groq' },
        { provider: 'openai', name: 'gpt-4o', providerType: 'openai' },
        { provider: 'gemini', name: 'gemini-2.5-flash', providerType: 'gemini' }
      ];

      const healthy = rateLimitTracker.filterByHealth(models);

      expect(healthy).toHaveLength(3); // All healthy by default
    });

    test('should return empty array if all models unhealthy', () => {
      const models = [
        { provider: 'openai', name: 'gpt-4o', providerType: 'openai' },
        { provider: 'gemini', name: 'gemini-2.5-flash', providerType: 'gemini' }
      ];

      // Make both unhealthy
      for (let i = 0; i < 5; i++) {
        rateLimitTracker.recordError('openai', 'gpt-4o');
        rateLimitTracker.recordError('gemini', 'gemini-2.5-flash');
      }

      const healthy = rateLimitTracker.filterByHealth(models);

      expect(healthy).toHaveLength(0);
    });

    test('should handle empty input', () => {
      const healthy = rateLimitTracker.filterByHealth([]);
      expect(healthy).toEqual([]);
    });

    test('should preserve model order after filtering', () => {
      const models = [
        { provider: 'groq', name: 'llama-3.1-8b-instant', providerType: 'groq' },
        { provider: 'gemini', name: 'gemini-2.5-flash', providerType: 'gemini' },
        { provider: 'openai', name: 'gpt-4o', providerType: 'openai' }
      ];

      // Make middle model unhealthy
      for (let i = 0; i < 5; i++) {
        rateLimitTracker.recordError('gemini', 'gemini-2.5-flash');
      }

      const healthy = rateLimitTracker.filterByHealth(models);

      expect(healthy).toHaveLength(2);
      expect(healthy[0].name).toBe('llama-3.1-8b-instant');
      expect(healthy[1].name).toBe('gpt-4o');
    });
  });

  describe('Header Parsing - updateFromHeaders', () => {
    test('should parse standard x-ratelimit-* headers', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      const headers = {
        'x-ratelimit-limit-requests': '500',
        'x-ratelimit-remaining-requests': '450',
        'x-ratelimit-limit-tokens': '150000',
        'x-ratelimit-remaining-tokens': '100000',
        'x-ratelimit-reset-requests': '60s',
        'x-ratelimit-reset-tokens': '60s'
      };

      limit.updateFromHeaders(headers);

      expect(limit.requestsRemaining).toBe(450);
      expect(limit.tokensRemaining).toBe(100000);
      expect(limit.lastResponseHeaders).toEqual(headers);
    });

    test('should parse Google x-goog-quota-* headers', () => {
      const limit = new ModelRateLimit('gemini', 'gemini-2.5-flash', {
        requestsPerMinute: 15,
        tokensPerMinute: 1000000
      });

      const headers = {
        'x-goog-quota-user-limit-requests-per-minute': '15',
        'x-goog-quota-user-remaining-requests-per-minute': '12',
        'x-goog-quota-user-limit-tokens-per-minute': '1000000',
        'x-goog-quota-user-remaining-tokens-per-minute': '800000'
      };

      limit.updateFromHeaders(headers);

      expect(limit.requestsRemaining).toBe(12);
      expect(limit.tokensRemaining).toBe(800000);
    });

    test('should store lastResponseHeaders for debugging', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      const headers = {
        'x-ratelimit-limit-requests': '500',
        'x-ratelimit-remaining-requests': '450'
      };

      limit.updateFromHeaders(headers);

      expect(limit.lastResponseHeaders).toEqual(headers);
    });

    test('should handle missing headers gracefully', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      limit.updateFromHeaders({});

      // Should not crash, just not update anything
      expect(limit.lastResponseHeaders).toEqual({});
    });
  });

  describe('Real-World Health Scenarios', () => {
    test('should handle transient errors', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      // 10 successes
      for (let i = 0; i < 10; i++) limit.recordSuccess();
      
      // 1 transient error
      limit.recordError();
      
      // More successes
      for (let i = 0; i < 10; i++) limit.recordSuccess();

      expect(limit.isHealthy()).toBe(true);
      expect(limit.consecutiveErrors).toBe(0);
      
      const score = limit.getHealthScore();
      // 20 successes, 1 failure = 95.2% success rate
      expect(score).toBeGreaterThan(60);
    });

    test('should detect persistent failures', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      // Pattern: success, error, error, success, error, error, error
      limit.recordSuccess();
      limit.recordError();
      limit.recordError();
      limit.recordSuccess();
      limit.recordError();
      limit.recordError();
      limit.recordError();

      expect(limit.consecutiveErrors).toBe(3);
      expect(limit.isHealthy()).toBe(false);
    });

    test('should track recovery after outage', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      // Simulate outage
      for (let i = 0; i < 10; i++) limit.recordError();
      
      expect(limit.isHealthy()).toBe(false);
      const outageScore = limit.getHealthScore();

      // Simulate recovery
      for (let i = 0; i < 20; i++) limit.recordSuccess();

      expect(limit.isHealthy()).toBe(true);
      const recoveredScore = limit.getHealthScore();
      
      expect(recoveredScore).toBeGreaterThan(outageScore);
      expect(recoveredScore).toBeGreaterThan(60);
    });

    test('should handle rate limit 429 as error', () => {
      const limit = new ModelRateLimit('groq', 'llama-3.1-8b-instant', {
        requestsPerMinute: 30,
        tokensPerMinute: 6000
      });

      // Simulate hitting rate limit
      limit.recordError(); // 429 error
      limit.recordError(); // 429 error
      limit.recordError(); // 429 error

      expect(limit.consecutiveErrors).toBe(3);
      expect(limit.isHealthy()).toBe(false);

      // After rate limit resets, requests succeed
      for (let i = 0; i < 5; i++) limit.recordSuccess();

      expect(limit.consecutiveErrors).toBe(0);
      expect(limit.isHealthy()).toBe(true);
    });
  });

  describe('Integration - Performance + Health', () => {
    test('should track both performance and health independently', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      // Good performance, good health
      limit.recordSuccess();
      limit.recordPerformance({ timeToFirstToken: 200, totalDuration: 1000 });
      
      limit.recordSuccess();
      limit.recordPerformance({ timeToFirstToken: 210, totalDuration: 1050 });

      expect(limit.isHealthy()).toBe(true);
      const perf = limit.getAveragePerformance();
      expect(perf.avgTTFT).toBeCloseTo(205, 0);

      // Bad health, performance still tracked
      limit.recordError();
      limit.recordError();
      limit.recordError();
      limit.recordPerformance({ timeToFirstToken: 5000, totalDuration: 10000 }); // Slow but tracked

      expect(limit.isHealthy()).toBe(false);
      const perf2 = limit.getAveragePerformance();
      expect(perf2.avgTTFT).toBeGreaterThan(1000); // Includes slow request
    });
  });
});
