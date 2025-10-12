/**
 * Tests for Performance Tracking (Step 12)
 * Tests response time tracking, TTFT measurement, and historical performance data
 */

const { ModelRateLimit, RateLimitTracker } = require('../../src/model-selection/rate-limit-tracker');

describe('Performance Tracking', () => {
  let rateLimitTracker;

  beforeEach(() => {
    rateLimitTracker = new RateLimitTracker();
  });

  describe('ModelRateLimit - Performance Recording', () => {
    test('should initialize with empty performance history', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      expect(limit.performanceHistory).toEqual([]);
      expect(limit.getAveragePerformance()).toBeNull();
    });

    test('should record performance metrics', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      const metrics = {
        timeToFirstToken: 250,
        totalDuration: 1500,
        timestamp: Date.now()
      };

      limit.recordPerformance(metrics);

      expect(limit.performanceHistory).toHaveLength(1);
      expect(limit.performanceHistory[0]).toMatchObject({
        timeToFirstToken: 250,
        totalDuration: 1500
      });
    });

    test('should limit performance history to 100 entries', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      // Add 120 performance records
      for (let i = 0; i < 120; i++) {
        limit.recordPerformance({
          timeToFirstToken: 100 + i,
          totalDuration: 1000 + i,
          timestamp: Date.now() + i
        });
      }

      expect(limit.performanceHistory).toHaveLength(100);
      // Should keep most recent 100
      expect(limit.performanceHistory[0].timeToFirstToken).toBe(120);
      expect(limit.performanceHistory[99].timeToFirstToken).toBe(219);
    });

    test('should calculate average performance from last 20 requests', () => {
      const limit = new ModelRateLimit('groq', 'llama-3.1-8b-instant', {
        requestsPerMinute: 30,
        tokensPerMinute: 6000
      });

      // Add 30 performance records
      for (let i = 0; i < 30; i++) {
        limit.recordPerformance({
          timeToFirstToken: 50 + i * 10, // 50, 60, 70, ..., 340
          totalDuration: 500 + i * 50,   // 500, 550, 600, ..., 1950
          timestamp: Date.now() + i
        });
      }

      const avg = limit.getAveragePerformance();
      
      expect(avg).not.toBeNull();
      expect(avg.sampleSize).toBe(20);
      
      // Last 20: TTFT from 150 to 340 (avg = 245)
      // Last 20: Duration from 1000 to 1950 (avg = 1475)
      expect(avg.avgTTFT).toBeCloseTo(245, 0);
      expect(avg.avgDuration).toBeCloseTo(1475, 0);
    });

    test('should return null average when no performance data', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      expect(limit.getAveragePerformance()).toBeNull();
    });

    test('should handle partial performance data (<20 samples)', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      // Add only 5 records
      for (let i = 0; i < 5; i++) {
        limit.recordPerformance({
          timeToFirstToken: 200,
          totalDuration: 1000,
          timestamp: Date.now() + i
        });
      }

      const avg = limit.getAveragePerformance();
      
      expect(avg).not.toBeNull();
      expect(avg.sampleSize).toBe(5);
      expect(avg.avgTTFT).toBe(200);
      expect(avg.avgDuration).toBe(1000);
    });
  });

  describe('RateLimitTracker - Performance Methods', () => {
    test('should record performance via tracker', () => {
      rateLimitTracker.recordPerformance('groq', 'llama-3.1-8b-instant', {
        timeToFirstToken: 87,
        totalDuration: 450
      });

      const avg = rateLimitTracker.getAveragePerformance('groq', 'llama-3.1-8b-instant');
      
      expect(avg).not.toBeNull();
      expect(avg.avgTTFT).toBe(87);
      expect(avg.avgDuration).toBe(450);
    });

    test('should return null for unknown model', () => {
      const avg = rateLimitTracker.getAveragePerformance('unknown', 'unknown-model');
      expect(avg).toBeNull();
    });

    test('should track performance across multiple models', () => {
      rateLimitTracker.recordPerformance('groq', 'llama-3.1-8b-instant', {
        timeToFirstToken: 50,
        totalDuration: 300
      });

      rateLimitTracker.recordPerformance('openai', 'gpt-4o', {
        timeToFirstToken: 800,
        totalDuration: 2500
      });

      const groqAvg = rateLimitTracker.getAveragePerformance('groq', 'llama-3.1-8b-instant');
      const openaiAvg = rateLimitTracker.getAveragePerformance('openai', 'gpt-4o');

      expect(groqAvg.avgTTFT).toBe(50);
      expect(openaiAvg.avgTTFT).toBe(800);
    });
  });

  describe('Speed Optimization - sortBySpeed', () => {
    test('should sort models by historical TTFT (ascending)', () => {
      // Add performance data
      rateLimitTracker.recordPerformance('groq', 'llama-3.1-8b-instant', {
        timeToFirstToken: 50,
        totalDuration: 300
      });

      rateLimitTracker.recordPerformance('openai', 'gpt-4o', {
        timeToFirstToken: 800,
        totalDuration: 2500
      });

      rateLimitTracker.recordPerformance('gemini', 'gemini-2.5-flash', {
        timeToFirstToken: 200,
        totalDuration: 1000
      });

      const models = [
        { provider: 'openai', name: 'gpt-4o', providerType: 'openai' },
        { provider: 'groq', name: 'llama-3.1-8b-instant', providerType: 'groq' },
        { provider: 'gemini', name: 'gemini-2.5-flash', providerType: 'gemini' }
      ];

      const sorted = rateLimitTracker.sortBySpeed(models);

      expect(sorted).toHaveLength(3);
      expect(sorted[0].name).toBe('llama-3.1-8b-instant'); // 50ms
      expect(sorted[1].name).toBe('gemini-2.5-flash');     // 200ms
      expect(sorted[2].name).toBe('gpt-4o');               // 800ms
    });

    test('should handle models without performance data', () => {
      rateLimitTracker.recordPerformance('groq', 'llama-3.1-8b-instant', {
        timeToFirstToken: 50,
        totalDuration: 300
      });

      const models = [
        { provider: 'openai', name: 'gpt-4o', providerType: 'openai' },
        { provider: 'groq', name: 'llama-3.1-8b-instant', providerType: 'groq' },
        { provider: 'gemini', name: 'gemini-2.5-flash', providerType: 'gemini' }
      ];

      const sorted = rateLimitTracker.sortBySpeed(models);

      expect(sorted).toHaveLength(3);
      // Model with data should be first
      expect(sorted[0].name).toBe('llama-3.1-8b-instant');
      // Others maintain relative order (no data = no preference)
    });

    test('should return empty array for empty input', () => {
      const sorted = rateLimitTracker.sortBySpeed([]);
      expect(sorted).toEqual([]);
    });
  });

  describe('Performance Metrics Validation', () => {
    test('should handle missing timestamp gracefully', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      limit.recordPerformance({
        timeToFirstToken: 250,
        totalDuration: 1500
        // timestamp missing
      });

      expect(limit.performanceHistory).toHaveLength(1);
      expect(limit.performanceHistory[0]).toHaveProperty('timestamp');
    });

    test('should ignore invalid performance metrics', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      // Negative values should be ignored or handled
      limit.recordPerformance({
        timeToFirstToken: -50,
        totalDuration: 1500
      });

      // Should still be recorded but with sanitized values
      expect(limit.performanceHistory).toHaveLength(1);
    });
  });

  describe('Real-World Performance Scenarios', () => {
    test('should reflect Groq speed advantage', () => {
      // Simulate realistic latencies
      const groqLatencies = [45, 52, 48, 55, 50, 49, 51, 47, 53, 50]; // avg ~50ms
      const openaiLatencies = [650, 720, 680, 700, 690, 710, 675, 695, 705, 685]; // avg ~691ms

      groqLatencies.forEach(ttft => {
        rateLimitTracker.recordPerformance('groq', 'llama-3.1-8b-instant', {
          timeToFirstToken: ttft,
          totalDuration: ttft + 400
        });
      });

      openaiLatencies.forEach(ttft => {
        rateLimitTracker.recordPerformance('openai', 'gpt-4o', {
          timeToFirstToken: ttft,
          totalDuration: ttft + 1500
        });
      });

      const groqAvg = rateLimitTracker.getAveragePerformance('groq', 'llama-3.1-8b-instant');
      const openaiAvg = rateLimitTracker.getAveragePerformance('openai', 'gpt-4o');

      expect(groqAvg.avgTTFT).toBeCloseTo(50, 5);
      expect(openaiAvg.avgTTFT).toBeCloseTo(691, 10);
      expect(groqAvg.avgTTFT).toBeLessThan(openaiAvg.avgTTFT / 10); // Groq >10x faster
    });

    test('should track performance degradation over time', () => {
      const limit = new ModelRateLimit('openai', 'gpt-4o', {
        requestsPerMinute: 500,
        tokensPerMinute: 150000
      });

      // Simulate degrading performance
      for (let i = 0; i < 25; i++) {
        limit.recordPerformance({
          timeToFirstToken: 500 + i * 20, // Getting slower
          totalDuration: 2000 + i * 50
        });
      }

      const avg = limit.getAveragePerformance();
      
      // Last 20 should show increased latency
      expect(avg.avgTTFT).toBeGreaterThan(600);
    });
  });
});
