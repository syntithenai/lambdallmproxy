/**
 * Unit Tests: Health Checker
 * Tests periodic health monitoring, auto-recovery, and availability tracking
 */

const { HealthChecker } = require('../../src/routing/health-checker');
const { RateLimitTracker } = require('../../src/model-selection/rate-limit-tracker');

describe('HealthChecker', () => {
  let healthChecker;
  let rateLimitTracker;
  let realSetInterval;
  let realClearInterval;
  let intervalCallbacks;

  beforeEach(() => {
    // Mock timers
    realSetInterval = global.setInterval;
    realClearInterval = global.clearInterval;
    intervalCallbacks = [];
    
    global.setInterval = jest.fn((callback, delay) => {
      const id = intervalCallbacks.length;
      intervalCallbacks.push({ callback, delay, id });
      return id;
    });
    
    global.clearInterval = jest.fn((id) => {
      intervalCallbacks = intervalCallbacks.filter(cb => cb.id !== id);
    });

    rateLimitTracker = new RateLimitTracker();
    healthChecker = new HealthChecker(rateLimitTracker);
  });

  afterEach(() => {
    if (healthChecker) {
      healthChecker.stop();
    }
    global.setInterval = realSetInterval;
    global.clearInterval = realClearInterval;
  });

  describe('Health Check Initialization', () => {
    test('should start periodic health checks on initialization', () => {
      expect(global.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        60000 // 1 minute default
      );
      expect(intervalCallbacks).toHaveLength(1);
    });

    test('should use custom check interval', () => {
      const customChecker = new HealthChecker(rateLimitTracker, { checkInterval: 30000 });
      
      expect(intervalCallbacks.some(cb => cb.delay === 30000)).toBe(true);
      
      customChecker.stop();
    });

    test('should allow disabling automatic checks', () => {
      const beforeCount = intervalCallbacks.length;
      const manualChecker = new HealthChecker(rateLimitTracker, { autoStart: false });
      
      // Should not add new intervals
      expect(intervalCallbacks.length).toBe(beforeCount);
      
      manualChecker.stop();
    });
  });

  describe('Provider Health Tracking', () => {
    test('should track provider availability', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // Record initial health
      await healthChecker.recordSuccess(providerId, modelId);
      let health = await healthChecker.getHealth(providerId, modelId);
      expect(health.availability).toBe(1.0);
      expect(health.consecutiveErrors).toBe(0);

      // Record failure
      await healthChecker.recordFailure(providerId, modelId, new Error('Test error'));
      health = await healthChecker.getHealth(providerId, modelId);
      expect(health.availability).toBeLessThan(1.0);
      expect(health.consecutiveErrors).toBe(1);
    });

    test('should decrease availability on consecutive failures', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // Record multiple failures
      for (let i = 0; i < 5; i++) {
        await healthChecker.recordFailure(providerId, modelId, new Error('Test error'));
      }

      const health = await healthChecker.getHealth(providerId, modelId);
      expect(health.availability).toBeLessThan(0.5);
      expect(health.consecutiveErrors).toBe(5);
    });

    test('should reset consecutive errors on success', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // Record failures then success
      await healthChecker.recordFailure(providerId, modelId, new Error('Test error'));
      await healthChecker.recordFailure(providerId, modelId, new Error('Test error'));
      const afterFailures = await healthChecker.getHealth(providerId, modelId);
      const failureAvailability = afterFailures.availability;
      
      await healthChecker.recordSuccess(providerId, modelId);

      const health = await healthChecker.getHealth(providerId, modelId);
      expect(health.consecutiveErrors).toBe(0);
      expect(health.availability).toBeGreaterThan(failureAvailability); // Should increase from failure state
    });
  });

  describe('Automatic Health Recovery', () => {
    test('should gradually recover availability after cooldown period', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // Record failure
      await healthChecker.recordFailure(providerId, modelId, new Error('Test error'));
      const initialHealth = await healthChecker.getHealth(providerId, modelId);
      const initialAvailability = initialHealth.availability;

      // Simulate time passing (cooldown period)
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + 65000); // 65 seconds

      // Run health check
      await healthChecker.runHealthCheck();

      const recoveredHealth = await healthChecker.getHealth(providerId, modelId);
      expect(recoveredHealth.availability).toBeGreaterThan(initialAvailability);
      expect(recoveredHealth.consecutiveErrors).toBe(0);

      jest.restoreAllMocks();
    });

    test('should not recover during cooldown period', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // Record failure
      await healthChecker.recordFailure(providerId, modelId, new Error('Test error'));
      const initialHealth = await healthChecker.getHealth(providerId, modelId);

      // Simulate short time passing (within cooldown)
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + 30000); // 30 seconds

      // Run health check
      await healthChecker.runHealthCheck();

      const stillUnhealthy = await healthChecker.getHealth(providerId, modelId);
      expect(stillUnhealthy.availability).toBe(initialHealth.availability);
      expect(stillUnhealthy.consecutiveErrors).toBe(1);

      jest.restoreAllMocks();
    });

    test('should cap availability at 1.0', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // Start with partial availability
      await healthChecker.recordFailure(providerId, modelId, new Error('Test error'));
      
      // Simulate multiple recovery cycles
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        jest.spyOn(Date, 'now').mockReturnValue(now + (65000 * (i + 1)));
        await healthChecker.runHealthCheck();
      }

      const health = await healthChecker.getHealth(providerId, modelId);
      expect(health.availability).toBe(1.0);
      expect(health.availability).toBeLessThanOrEqual(1.0);

      jest.restoreAllMocks();
    });
  });

  describe('Error Tracking', () => {
    test('should track last error details', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';
      const testError = new Error('Rate limit exceeded');

      await healthChecker.recordFailure(providerId, modelId, testError);

      const health = await healthChecker.getHealth(providerId, modelId);
      expect(health.lastError).toBeDefined();
      expect(health.lastError.message).toBe('Rate limit exceeded');
      expect(health.lastError.timestamp).toBeDefined();
    });

    test('should track error history', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // Record multiple different errors
      await healthChecker.recordFailure(providerId, modelId, new Error('Error 1'));
      await healthChecker.recordFailure(providerId, modelId, new Error('Error 2'));
      await healthChecker.recordFailure(providerId, modelId, new Error('Error 3'));

      const health = await healthChecker.getHealth(providerId, modelId);
      expect(health.errorHistory).toBeDefined();
      expect(health.errorHistory.length).toBeGreaterThan(0);
    });

    test('should limit error history size', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // Record many errors
      for (let i = 0; i < 50; i++) {
        await healthChecker.recordFailure(providerId, modelId, new Error(`Error ${i}`));
      }

      const health = await healthChecker.getHealth(providerId, modelId);
      expect(health.errorHistory.length).toBeLessThanOrEqual(20); // Should cap at 20
    });
  });

  describe('Health Check Status', () => {
    test('should return healthy status for good provider', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      await healthChecker.recordSuccess(providerId, modelId);

      const isHealthy = await healthChecker.isHealthy(providerId, modelId);
      expect(isHealthy).toBe(true);
    });

    test('should return unhealthy status for degraded provider', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // Record multiple failures
      for (let i = 0; i < 5; i++) {
        await healthChecker.recordFailure(providerId, modelId, new Error('Test error'));
      }

      const isHealthy = await healthChecker.isHealthy(providerId, modelId);
      expect(isHealthy).toBe(false);
    });

    test('should use custom health threshold', async () => {
      const customChecker = new HealthChecker(rateLimitTracker, { 
        healthThreshold: 0.5 
      });
      
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // Create a pattern that results in >0.5 availability
      // 3 successes, 1 failure = should be above 0.5
      await customChecker.recordSuccess(providerId, modelId);
      await customChecker.recordSuccess(providerId, modelId);
      await customChecker.recordFailure(providerId, modelId, new Error('Test error'));
      await customChecker.recordSuccess(providerId, modelId);

      const health = await customChecker.getHealth(providerId, modelId);
      expect(health.availability).toBeGreaterThan(0.5);
      
      const isHealthy = await customChecker.isHealthy(providerId, modelId);
      expect(isHealthy).toBe(true);

      customChecker.stop();
    });
  });

  describe('Availability Scoring', () => {
    test('should calculate availability score based on error rate', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // 7 successes, 3 failures = 70% overall, but recent matters more
      for (let i = 0; i < 7; i++) {
        await healthChecker.recordSuccess(providerId, modelId);
      }
      for (let i = 0; i < 3; i++) {
        await healthChecker.recordFailure(providerId, modelId, new Error('Test error'));
      }

      const health = await healthChecker.getHealth(providerId, modelId);
      // With 3 consecutive errors at the end, availability should be low
      expect(health.availability).toBeLessThan(0.5);
      expect(health.consecutiveErrors).toBe(3);
    });

    test('should weigh recent errors more heavily', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // Old successes
      for (let i = 0; i < 10; i++) {
        await healthChecker.recordSuccess(providerId, modelId);
      }

      // Recent failures
      for (let i = 0; i < 3; i++) {
        await healthChecker.recordFailure(providerId, modelId, new Error('Recent error'));
      }

      const health = await healthChecker.getHealth(providerId, modelId);
      // Should reflect recent failures despite past successes
      expect(health.availability).toBeLessThan(0.5);
    });
  });

  describe('Lifecycle Management', () => {
    test('should stop health checks when stopped', () => {
      // Check that clearInterval gets called with the right ID
      const initialCount = intervalCallbacks.length;
      expect(initialCount).toBeGreaterThan(0); // Should have at least one interval
      
      // Verify the health checker has an interval ID
      expect(healthChecker.intervalId).toBeDefined();
      expect(healthChecker.intervalId).not.toBeNull();
      
      healthChecker.stop();
      
      // After stop, interval ID should be null
      expect(healthChecker.intervalId).toBeNull();
      expect(global.clearInterval).toHaveBeenCalled();
    });

    test('should allow manual health check execution', async () => {
      const providerId = 'test-provider';
      const modelId = 'test-model';

      // Record failure
      await healthChecker.recordFailure(providerId, modelId, new Error('Test error'));

      // Manually trigger recovery (mock time passing)
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + 65000);

      await healthChecker.runHealthCheck();

      const health = await healthChecker.getHealth(providerId, modelId);
      expect(health.availability).toBeGreaterThan(0);

      jest.restoreAllMocks();
    });
  });
});
