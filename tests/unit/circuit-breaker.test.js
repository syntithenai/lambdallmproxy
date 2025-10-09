/**
 * Unit Tests: Circuit Breaker
 * Tests circuit breaker pattern with CLOSED/OPEN/HALF_OPEN states
 */

const { CircuitBreaker } = require('../../src/routing/circuit-breaker');

describe('CircuitBreaker', () => {
  let circuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker();
  });

  describe('Circuit States', () => {
    test('should start in CLOSED state', async () => {
      const providerId = 'test-provider';
      
      const result = await circuitBreaker.checkCircuit(providerId);
      
      expect(result.allowed).toBe(true);
      const state = circuitBreaker.getState(providerId);
      expect(state.status).toBe('CLOSED');
    });

    test('should transition to OPEN after failure threshold', async () => {
      const providerId = 'test-provider';
      
      // Record failures to reach threshold (default 5)
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.recordFailure(providerId);
      }
      
      const result = await circuitBreaker.checkCircuit(providerId);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('circuit-open');
      
      const state = circuitBreaker.getState(providerId);
      expect(state.status).toBe('OPEN');
    });

    test('should transition to HALF_OPEN after timeout', async () => {
      const providerId = 'test-provider';
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.recordFailure(providerId);
      }
      
      // Simulate time passing (mock Date.now)
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + 65000); // 65 seconds
      
      const result = await circuitBreaker.checkCircuit(providerId);
      expect(result.allowed).toBe(true);
      
      const state = circuitBreaker.getState(providerId);
      expect(state.status).toBe('HALF_OPEN');
      
      jest.restoreAllMocks();
    });

    test('should close circuit on success in HALF_OPEN state', async () => {
      const providerId = 'test-provider';
      
      // Open circuit
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.recordFailure(providerId);
      }
      
      // Move to HALF_OPEN
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + 65000);
      await circuitBreaker.checkCircuit(providerId);
      
      // Record success
      await circuitBreaker.recordSuccess(providerId);
      
      const state = circuitBreaker.getState(providerId);
      expect(state.status).toBe('CLOSED');
      expect(state.failures).toBe(0);
      
      jest.restoreAllMocks();
    });

    test('should reopen circuit on failure in HALF_OPEN state', async () => {
      const providerId = 'test-provider';
      
      // Open circuit
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.recordFailure(providerId);
      }
      
      // Move to HALF_OPEN
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + 65000);
      await circuitBreaker.checkCircuit(providerId);
      
      // Record another failure
      await circuitBreaker.recordFailure(providerId);
      
      const state = circuitBreaker.getState(providerId);
      expect(state.status).toBe('OPEN');
      
      jest.restoreAllMocks();
    });
  });

  describe('Failure Tracking', () => {
    test('should track consecutive failures', async () => {
      const providerId = 'test-provider';
      
      await circuitBreaker.recordFailure(providerId);
      await circuitBreaker.recordFailure(providerId);
      await circuitBreaker.recordFailure(providerId);
      
      const state = circuitBreaker.getState(providerId);
      expect(state.failures).toBe(3);
      expect(state.status).toBe('CLOSED'); // Still below threshold
    });

    test('should reset failures on success', async () => {
      const providerId = 'test-provider';
      
      await circuitBreaker.recordFailure(providerId);
      await circuitBreaker.recordFailure(providerId);
      await circuitBreaker.recordSuccess(providerId);
      
      const state = circuitBreaker.getState(providerId);
      expect(state.failures).toBe(0);
      expect(state.status).toBe('CLOSED');
    });

    test('should track last failure timestamp', async () => {
      const providerId = 'test-provider';
      
      const beforeFailure = Date.now();
      await circuitBreaker.recordFailure(providerId);
      const afterFailure = Date.now();
      
      const state = circuitBreaker.getState(providerId);
      expect(state.lastFailure).toBeGreaterThanOrEqual(beforeFailure);
      expect(state.lastFailure).toBeLessThanOrEqual(afterFailure);
    });
  });

  describe('Timeout Configuration', () => {
    test('should use custom failure threshold', async () => {
      const customBreaker = new CircuitBreaker({ failureThreshold: 3 });
      const providerId = 'test-provider';
      
      // Only need 3 failures to open
      for (let i = 0; i < 3; i++) {
        await customBreaker.recordFailure(providerId);
      }
      
      const result = await customBreaker.checkCircuit(providerId);
      expect(result.allowed).toBe(false);
    });

    test('should use custom timeout period', async () => {
      const customBreaker = new CircuitBreaker({ timeout: 30000 }); // 30 seconds
      const providerId = 'test-provider';
      
      // Open circuit
      for (let i = 0; i < 5; i++) {
        await customBreaker.recordFailure(providerId);
      }
      
      // Just 25 seconds - should still be OPEN
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + 25000);
      
      let result = await customBreaker.checkCircuit(providerId);
      expect(result.allowed).toBe(false);
      
      // 35 seconds - should transition to HALF_OPEN
      jest.spyOn(Date, 'now').mockReturnValue(now + 35000);
      
      result = await customBreaker.checkCircuit(providerId);
      expect(result.allowed).toBe(true);
      
      jest.restoreAllMocks();
    });
  });

  describe('Multiple Providers', () => {
    test('should track state independently per provider', async () => {
      const provider1 = 'provider-1';
      const provider2 = 'provider-2';
      
      // Open circuit for provider1
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.recordFailure(provider1);
      }
      
      // Provider2 should still be CLOSED
      const result1 = await circuitBreaker.checkCircuit(provider1);
      const result2 = await circuitBreaker.checkCircuit(provider2);
      
      expect(result1.allowed).toBe(false);
      expect(result2.allowed).toBe(true);
    });

    test('should get all circuit states', () => {
      const provider1 = 'provider-1';
      const provider2 = 'provider-2';
      
      // Create different states
      circuitBreaker.recordFailure(provider1);
      circuitBreaker.recordFailure(provider2);
      circuitBreaker.recordFailure(provider2);
      
      const allStates = circuitBreaker.getAllStates();
      
      expect(allStates[provider1]).toBeDefined();
      expect(allStates[provider2]).toBeDefined();
      expect(allStates[provider1].failures).toBe(1);
      expect(allStates[provider2].failures).toBe(2);
    });
  });

  describe('State Management', () => {
    test('should reset circuit state', async () => {
      const providerId = 'test-provider';
      
      // Open circuit
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.recordFailure(providerId);
      }
      
      // Reset
      circuitBreaker.reset(providerId);
      
      const result = await circuitBreaker.checkCircuit(providerId);
      expect(result.allowed).toBe(true);
      
      const state = circuitBreaker.getState(providerId);
      expect(state.status).toBe('CLOSED');
      expect(state.failures).toBe(0);
    });

    test('should reset all circuits', async () => {
      const provider1 = 'provider-1';
      const provider2 = 'provider-2';
      
      // Open both circuits
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.recordFailure(provider1);
        await circuitBreaker.recordFailure(provider2);
      }
      
      // Reset all
      circuitBreaker.resetAll();
      
      const result1 = await circuitBreaker.checkCircuit(provider1);
      const result2 = await circuitBreaker.checkCircuit(provider2);
      
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle rapid successive calls', async () => {
      const providerId = 'test-provider';
      
      // Rapid failures
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(circuitBreaker.recordFailure(providerId));
      }
      await Promise.all(promises);
      
      const state = circuitBreaker.getState(providerId);
      expect(state.status).toBe('OPEN');
      expect(state.failures).toBeGreaterThanOrEqual(5);
    });

    test('should handle state check without prior interaction', async () => {
      const providerId = 'never-seen-before';
      
      const result = await circuitBreaker.checkCircuit(providerId);
      
      expect(result.allowed).toBe(true);
      const state = circuitBreaker.getState(providerId);
      expect(state.status).toBe('CLOSED');
    });

    test('should handle time going backwards', async () => {
      const providerId = 'test-provider';
      
      // Open circuit
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.recordFailure(providerId);
      }
      
      // Mock time going backwards
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now - 10000);
      
      const result = await circuitBreaker.checkCircuit(providerId);
      
      // Should still be OPEN (not enough time passed)
      expect(result.allowed).toBe(false);
      
      jest.restoreAllMocks();
    });
  });
});
