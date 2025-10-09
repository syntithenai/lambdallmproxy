/**
 * Unit Tests: Backoff Strategy
 * Tests exponential backoff calculation with jitter
 */

const { BackoffStrategy } = require('../../src/retry/backoff-strategy');

describe('BackoffStrategy', () => {
  let strategy;

  beforeEach(() => {
    strategy = new BackoffStrategy();
  });

  describe('Exponential Backoff', () => {
    test('should calculate delay with exponential growth', () => {
      const delays = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        const delay = strategy.calculateDelay(attempt, 1000, 30000);
        delays.push(delay);
      }

      // Each delay should generally be larger than the previous
      // (allowing for jitter variation)
      expect(delays[1]).toBeGreaterThan(delays[0] * 0.5);
      expect(delays[2]).toBeGreaterThan(delays[1] * 0.5);
      expect(delays[3]).toBeGreaterThan(delays[2] * 0.5);
    });

    test('should use base delay for attempt 0', () => {
      const delay = strategy.calculateDelay(0, 1000, 30000);
      
      // With jitter, should be within range of base delay (750-1500ms)
      expect(delay).toBeGreaterThan(700);
      expect(delay).toBeLessThan(1600);
    });

    test('should double exponentially', () => {
      // Test without jitter by averaging many samples
      const samples = 100;
      const attempts = [0, 1, 2, 3];
      const averages = [];

      for (const attempt of attempts) {
        let sum = 0;
        for (let i = 0; i < samples; i++) {
          sum += strategy.calculateDelay(attempt, 1000, 30000);
        }
        averages.push(sum / samples);
      }

      // Averages should approximately double each time
      expect(averages[1] / averages[0]).toBeGreaterThan(1.5);
      expect(averages[1] / averages[0]).toBeLessThan(2.5);
      expect(averages[2] / averages[1]).toBeGreaterThan(1.5);
      expect(averages[2] / averages[1]).toBeLessThan(2.5);
    });

    test('should cap at max delay', () => {
      const maxDelay = 10000;
      
      // High attempt number should hit the cap
      const delay = strategy.calculateDelay(10, 1000, maxDelay);
      
      expect(delay).toBeLessThanOrEqual(maxDelay);
    });

    test('should use custom base delay', () => {
      const baseDelay = 500;
      const delay = strategy.calculateDelay(0, baseDelay, 30000);
      
      // Should be around base delay with jitter
      expect(delay).toBeGreaterThan(baseDelay * 0.7);
      expect(delay).toBeLessThan(baseDelay * 1.6);
    });
  });

  describe('Jitter Application', () => {
    test('should add jitter to prevent thundering herd', () => {
      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(strategy.calculateDelay(2, 1000, 30000));
      }

      // All delays should be different (jitter makes them random)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(5);
    });

    test('should keep jitter within ±25% range', () => {
      const attempt = 2;
      const baseDelay = 1000;
      const expectedBase = baseDelay * Math.pow(2, attempt); // 4000

      const delays = [];
      for (let i = 0; i < 100; i++) {
        delays.push(strategy.calculateDelay(attempt, baseDelay, 30000));
      }

      // All delays should be within jitter range (75%-125% of expected)
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(expectedBase * 0.7);
        expect(delay).toBeLessThanOrEqual(expectedBase * 1.3);
      }
    });
  });

  describe('Retry-After Header Parsing', () => {
    test('should parse numeric retry-after (seconds)', () => {
      const delay = strategy.calculateFromRetryAfter(60);
      
      expect(delay).toBe(60000); // 60 seconds in ms
    });

    test('should parse string retry-after (seconds)', () => {
      const delay = strategy.calculateFromRetryAfter('45');
      
      expect(delay).toBe(45000);
    });

    test('should parse HTTP date format', () => {
      const futureDate = new Date(Date.now() + 5000); // 5 seconds from now
      const delay = strategy.calculateFromRetryAfter(futureDate.toUTCString());
      
      // Should be approximately 5000ms (allow small timing variance)
      expect(delay).toBeGreaterThan(4000);
      expect(delay).toBeLessThan(6000);
    });

    test('should handle past dates', () => {
      const pastDate = new Date(Date.now() - 10000); // 10 seconds ago
      const delay = strategy.calculateFromRetryAfter(pastDate.toUTCString());
      
      // Should return 0 for past dates
      expect(delay).toBe(0);
    });

    test('should handle invalid retry-after', () => {
      const delay = strategy.calculateFromRetryAfter('invalid');
      
      expect(delay).toBe(0);
    });

    test('should handle missing retry-after', () => {
      const delay = strategy.calculateFromRetryAfter(null);
      
      expect(delay).toBe(0);
    });

    test('should handle undefined retry-after', () => {
      const delay = strategy.calculateFromRetryAfter(undefined);
      
      expect(delay).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero base delay', () => {
      const delay = strategy.calculateDelay(2, 0, 30000);
      
      expect(delay).toBe(0);
    });

    test('should handle very large attempt numbers', () => {
      const delay = strategy.calculateDelay(100, 1000, 30000);
      
      // Should cap at max delay
      expect(delay).toBeLessThanOrEqual(30000);
    });

    test('should handle negative attempt numbers', () => {
      const delay = strategy.calculateDelay(-1, 1000, 30000);
      
      // Should still calculate (2^-1 = 0.5)
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThan(1000);
    });

    test('should handle very small max delay', () => {
      const maxDelay = 100;
      const delay = strategy.calculateDelay(5, 1000, maxDelay);
      
      expect(delay).toBeLessThanOrEqual(maxDelay);
    });
  });

  describe('Realistic Scenarios', () => {
    test('should provide reasonable delays for typical retry sequence', () => {
      const delays = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        delays.push(strategy.calculateDelay(attempt));
      }

      // First retry: ~1s, second: ~2s, third: ~4s (with jitter)
      expect(delays[0]).toBeLessThan(2000);
      expect(delays[1]).toBeLessThan(4000);
      expect(delays[2]).toBeLessThan(8000);
    });

    test('should respect retry-after over exponential backoff', () => {
      const retryAfterDelay = strategy.calculateFromRetryAfter(120); // 2 minutes
      const exponentialDelay = strategy.calculateDelay(2, 1000, 30000); // ~4s

      // Retry-after should be much longer
      expect(retryAfterDelay).toBeGreaterThan(exponentialDelay);
    });
  });
});
