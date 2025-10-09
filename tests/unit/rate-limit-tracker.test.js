/**
 * Tests for Rate Limit Tracker Module
 */

const {
  ModelRateLimit,
  RateLimitTracker
} = require('../../src/model-selection/rate-limit-tracker');

describe('ModelRateLimit', () => {
  describe('Constructor', () => {
    test('should initialize with default limits', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      expect(limit.modelName).toBe('gpt-4');
      expect(limit.requestsPerMinute).toBe(Infinity);
      expect(limit.tokensPerMinute).toBe(Infinity);
      expect(limit.requestsPerDay).toBe(Infinity);
      expect(limit.requestsUsed).toBe(0);
      expect(limit.tokensUsed).toBe(0);
    });

    test('should initialize with custom limits', () => {
      const limit = new ModelRateLimit('gpt-4', {
        rpm: 100,
        tpm: 10000,
        rpd: 1000
      });
      
      expect(limit.requestsPerMinute).toBe(100);
      expect(limit.tokensPerMinute).toBe(10000);
      expect(limit.requestsPerDay).toBe(1000);
    });

    test('should initialize tracking fields', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      expect(limit.lastReset).toBeGreaterThan(0);
      expect(limit.unavailableUntil).toBeNull();
      expect(limit.retryAfter).toBeNull();
      expect(Array.isArray(limit.requestHistory)).toBe(true);
      expect(Array.isArray(limit.tokenHistory)).toBe(true);
    });
  });

  describe('canMakeRequest', () => {
    test('should allow request when under limits', () => {
      const limit = new ModelRateLimit('gpt-4', {
        rpm: 100,
        tpm: 10000
      });
      
      expect(limit.canMakeRequest(500)).toBe(true);
    });

    test('should block when request limit reached', () => {
      const limit = new ModelRateLimit('gpt-4', {
        rpm: 2,
        tpm: 10000
      });
      
      limit.trackRequest(100);
      limit.trackRequest(100);
      
      expect(limit.canMakeRequest(100)).toBe(false);
    });

    test('should block when token limit would be exceeded', () => {
      const limit = new ModelRateLimit('gpt-4', {
        rpm: 100,
        tpm: 1000
      });
      
      limit.trackRequest(500);
      
      expect(limit.canMakeRequest(600)).toBe(false);
    });

    test('should block when unavailable due to 429', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.updateFrom429(60);
      
      expect(limit.canMakeRequest(100)).toBe(false);
    });

    test('should allow request after unavailable period expires', (done) => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.updateFrom429(0.1); // 100ms
      
      setTimeout(() => {
        expect(limit.canMakeRequest(100)).toBe(true);
        done();
      }, 150);
    });

    test('should block when daily limit reached', () => {
      const limit = new ModelRateLimit('gpt-4', {
        rpd: 2
      });
      
      limit.trackRequest(100);
      limit.trackRequest(100);
      
      expect(limit.canMakeRequest(100)).toBe(false);
    });
  });

  describe('trackRequest', () => {
    test('should increment request counter', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.trackRequest(100);
      
      expect(limit.requestsUsed).toBe(1);
      expect(limit.requestsToday).toBe(1);
    });

    test('should increment token counter', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.trackRequest(500);
      
      expect(limit.tokensUsed).toBe(500);
    });

    test('should add to history', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.trackRequest(100);
      limit.trackRequest(200);
      
      expect(limit.requestHistory.length).toBe(2);
      expect(limit.tokenHistory.length).toBe(2);
    });

    test('should handle zero tokens', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.trackRequest(0);
      
      expect(limit.requestsUsed).toBe(1);
      expect(limit.tokensUsed).toBe(0);
    });
  });

  describe('updateFromHeaders', () => {
    test('should update from x-ratelimit headers', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.updateFromHeaders({
        'x-ratelimit-limit-requests': '100',
        'x-ratelimit-remaining-requests': '75',
        'x-ratelimit-limit-tokens': '10000',
        'x-ratelimit-remaining-tokens': '8000'
      });
      
      expect(limit.requestsPerMinute).toBe(100);
      expect(limit.requestsUsed).toBe(25);
      expect(limit.tokensPerMinute).toBe(10000);
      expect(limit.tokensUsed).toBe(2000);
    });

    test('should handle missing headers gracefully', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.updateFromHeaders({});
      
      expect(limit.requestsPerMinute).toBe(Infinity);
      expect(limit.tokensPerMinute).toBe(Infinity);
    });

    test('should parse reset timestamp in seconds', () => {
      const limit = new ModelRateLimit('gpt-4');
      const futureSeconds = Math.floor(Date.now() / 1000) + 60;
      
      limit.updateFromHeaders({
        'x-ratelimit-reset-requests': futureSeconds.toString()
      });
      
      expect(limit.lastReset).toBeGreaterThan(Date.now());
    });

    test('should parse reset timestamp in milliseconds', () => {
      const limit = new ModelRateLimit('gpt-4');
      const futureMs = Date.now() + 60000;
      
      limit.updateFromHeaders({
        'x-ratelimit-reset-requests': futureMs.toString()
      });
      
      expect(limit.lastReset).toBe(futureMs);
    });

    test('should parse reset as seconds until reset', () => {
      const limit = new ModelRateLimit('gpt-4');
      const before = Date.now();
      
      limit.updateFromHeaders({
        'x-ratelimit-reset-requests': '60'
      });
      
      expect(limit.lastReset).toBeGreaterThan(before);
      expect(limit.lastReset).toBeLessThan(before + 70000);
    });

    test('should handle invalid header values', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.updateFromHeaders({
        'x-ratelimit-limit-requests': 'invalid',
        'x-ratelimit-remaining-requests': null
      });
      
      expect(limit.requestsPerMinute).toBe(Infinity);
    });
  });

  describe('updateFrom429', () => {
    test('should set unavailableUntil with retry-after', () => {
      const limit = new ModelRateLimit('gpt-4');
      const before = Date.now();
      
      limit.updateFrom429(60);
      
      expect(limit.unavailableUntil).toBeGreaterThan(before);
      expect(limit.retryAfter).toBe(60);
    });

    test('should default to 60 seconds when no retry-after', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.updateFrom429(null);
      
      expect(limit.retryAfter).toBe(60);
      expect(limit.unavailableUntil).toBeGreaterThan(Date.now());
    });

    test('should block requests until unavailable period expires', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.updateFrom429(60);
      
      expect(limit.canMakeRequest(100)).toBe(false);
    });
  });

  describe('getCapacity', () => {
    test('should return available capacity', () => {
      const limit = new ModelRateLimit('gpt-4', {
        rpm: 100,
        tpm: 10000,
        rpd: 1000
      });
      
      limit.trackRequest(500);
      
      const capacity = limit.getCapacity();
      
      expect(capacity.requests).toBe(99);
      expect(capacity.tokens).toBe(9500);
      expect(capacity.requestsToday).toBe(999);
      expect(capacity.available).toBe(true);
    });

    test('should return zero capacity when unavailable', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.updateFrom429(60);
      
      const capacity = limit.getCapacity();
      
      expect(capacity.requests).toBe(0);
      expect(capacity.tokens).toBe(0);
      expect(capacity.available).toBe(false);
      expect(capacity.retryAfter).toBeGreaterThan(0);
    });

    test('should return Infinity for unlimited resources', () => {
      const limit = new ModelRateLimit('gpt-4', {
        rpm: Infinity,
        tpm: 10000
      });
      
      const capacity = limit.getCapacity();
      
      expect(capacity.requests).toBe(Infinity);
      expect(capacity.tokens).toBe(10000);
    });
  });

  describe('reset', () => {
    test('should not reset counters before time expires', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.trackRequest(100);
      limit.reset();
      
      expect(limit.requestsUsed).toBe(1);
      expect(limit.tokensUsed).toBe(100);
    });

    test('should reset minute counters after 60 seconds', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.trackRequest(100);
      limit.lastReset = Date.now() - 61000; // 61 seconds ago
      limit.reset();
      
      expect(limit.requestsUsed).toBe(0);
      expect(limit.tokensUsed).toBe(0);
    });

    test('should reset daily counters after 24 hours', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      limit.trackRequest(100);
      limit.lastDayReset = Date.now() - 86500000; // >24 hours
      limit.reset();
      
      expect(limit.requestsToday).toBe(0);
    });
  });

  describe('cleanHistory', () => {
    test('should remove old history entries', () => {
      const limit = new ModelRateLimit('gpt-4');
      const now = Date.now();
      
      // Add old entries
      limit.requestHistory.push({ timestamp: now - 120000, tokens: 100 });
      limit.requestHistory.push({ timestamp: now - 30000, tokens: 200 });
      limit.tokenHistory.push({ timestamp: now - 120000, tokens: 100 });
      limit.tokenHistory.push({ timestamp: now - 30000, tokens: 200 });
      
      limit.cleanHistory(now);
      
      expect(limit.requestHistory.length).toBe(1);
      expect(limit.tokenHistory.length).toBe(1);
    });

    test('should recalculate usage from history', () => {
      const limit = new ModelRateLimit('gpt-4');
      const now = Date.now();
      
      limit.requestHistory.push({ timestamp: now - 30000, tokens: 100 });
      limit.requestHistory.push({ timestamp: now - 20000, tokens: 200 });
      limit.tokenHistory.push({ timestamp: now - 30000, tokens: 100 });
      limit.tokenHistory.push({ timestamp: now - 20000, tokens: 200 });
      
      limit.cleanHistory(now);
      
      expect(limit.requestsUsed).toBe(2);
      expect(limit.tokensUsed).toBe(300);
    });
  });

  describe('parseHeader', () => {
    test('should parse valid numbers', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      expect(limit.parseHeader('100')).toBe(100);
      expect(limit.parseHeader(100)).toBe(100);
    });

    test('should return null for invalid values', () => {
      const limit = new ModelRateLimit('gpt-4');
      
      expect(limit.parseHeader('invalid')).toBeNull();
      expect(limit.parseHeader(null)).toBeNull();
      expect(limit.parseHeader(undefined)).toBeNull();
      expect(limit.parseHeader('')).toBeNull();
    });
  });
});

describe('RateLimitTracker', () => {
  describe('Constructor', () => {
    test('should initialize empty tracker', () => {
      const tracker = new RateLimitTracker();
      
      expect(tracker.providers).toBeInstanceOf(Map);
      expect(tracker.providers.size).toBe(0);
      expect(tracker.autoReset).toBe(true);
    });

    test('should disable auto-reset when configured', () => {
      const tracker = new RateLimitTracker({ autoReset: false });
      
      expect(tracker.autoReset).toBe(false);
    });

    test('should accept persistence option', () => {
      const persistence = {
        save: jest.fn(),
        load: jest.fn(() => null)
      };
      
      const tracker = new RateLimitTracker({ persistence });
      
      expect(tracker.persistence).toBe(persistence);
      expect(persistence.load).toHaveBeenCalled();
    });
  });

  describe('getModelLimit', () => {
    test('should create new model limit if not exists', () => {
      const tracker = new RateLimitTracker();
      
      const limit = tracker.getModelLimit('openai', 'gpt-4');
      
      expect(limit).toBeInstanceOf(ModelRateLimit);
      expect(limit.modelName).toBe('gpt-4');
    });

    test('should return existing model limit', () => {
      const tracker = new RateLimitTracker();
      
      const limit1 = tracker.getModelLimit('openai', 'gpt-4');
      const limit2 = tracker.getModelLimit('openai', 'gpt-4');
      
      expect(limit1).toBe(limit2);
    });

    test('should create separate limits for different providers', () => {
      const tracker = new RateLimitTracker();
      
      const limit1 = tracker.getModelLimit('openai', 'gpt-4');
      const limit2 = tracker.getModelLimit('groq', 'gpt-4');
      
      expect(limit1).not.toBe(limit2);
    });

    test('should use custom limits when provided', () => {
      const tracker = new RateLimitTracker();
      
      const limit = tracker.getModelLimit('openai', 'gpt-4', {
        rpm: 50,
        tpm: 5000
      });
      
      expect(limit.requestsPerMinute).toBe(50);
      expect(limit.tokensPerMinute).toBe(5000);
    });
  });

  describe('trackRequest', () => {
    test('should track request for model', () => {
      const tracker = new RateLimitTracker();
      
      tracker.trackRequest('openai', 'gpt-4', 500);
      
      const limit = tracker.getModelLimit('openai', 'gpt-4');
      expect(limit.requestsUsed).toBe(1);
      expect(limit.tokensUsed).toBe(500);
    });

    test('should create model limit if not exists', () => {
      const tracker = new RateLimitTracker();
      
      tracker.trackRequest('openai', 'gpt-4', 500);
      
      expect(tracker.providers.has('openai')).toBe(true);
    });

    test('should call reset when autoReset enabled', () => {
      const tracker = new RateLimitTracker();
      const limit = tracker.getModelLimit('openai', 'gpt-4');
      const resetSpy = jest.spyOn(limit, 'reset');
      
      tracker.trackRequest('openai', 'gpt-4', 500);
      
      expect(resetSpy).toHaveBeenCalled();
    });

    test('should not call reset when autoReset disabled', () => {
      const tracker = new RateLimitTracker({ autoReset: false });
      const limit = tracker.getModelLimit('openai', 'gpt-4');
      const resetSpy = jest.spyOn(limit, 'reset');
      
      tracker.trackRequest('openai', 'gpt-4', 500);
      
      expect(resetSpy).not.toHaveBeenCalled();
    });

    test('should persist state when persistence configured', () => {
      const persistence = {
        save: jest.fn(),
        load: jest.fn(() => null)
      };
      const tracker = new RateLimitTracker({ persistence });
      
      tracker.trackRequest('openai', 'gpt-4', 500);
      
      expect(persistence.save).toHaveBeenCalled();
    });
  });

  describe('updateFromHeaders', () => {
    test('should update model limit from headers', () => {
      const tracker = new RateLimitTracker();
      
      tracker.updateFromHeaders('openai', 'gpt-4', {
        'x-ratelimit-limit-requests': '100',
        'x-ratelimit-remaining-requests': '75'
      });
      
      const limit = tracker.getModelLimit('openai', 'gpt-4');
      expect(limit.requestsPerMinute).toBe(100);
      expect(limit.requestsUsed).toBe(25);
    });

    test('should persist state after update', () => {
      const persistence = {
        save: jest.fn(),
        load: jest.fn(() => null)
      };
      const tracker = new RateLimitTracker({ persistence });
      
      tracker.updateFromHeaders('openai', 'gpt-4', {
        'x-ratelimit-limit-requests': '100'
      });
      
      expect(persistence.save).toHaveBeenCalled();
    });
  });

  describe('updateFrom429', () => {
    test('should mark model as unavailable', () => {
      const tracker = new RateLimitTracker();
      
      tracker.updateFrom429('openai', 'gpt-4', 60);
      
      expect(tracker.isAvailable('openai', 'gpt-4')).toBe(false);
    });

    test('should use default retry time when not specified', () => {
      const tracker = new RateLimitTracker();
      
      tracker.updateFrom429('openai', 'gpt-4', null);
      
      const limit = tracker.getModelLimit('openai', 'gpt-4');
      expect(limit.retryAfter).toBe(60);
    });

    test('should persist state after 429', () => {
      const persistence = {
        save: jest.fn(),
        load: jest.fn(() => null)
      };
      const tracker = new RateLimitTracker({ persistence });
      
      tracker.updateFrom429('openai', 'gpt-4', 60);
      
      expect(persistence.save).toHaveBeenCalled();
    });
  });

  describe('isAvailable', () => {
    test('should return true for untracked provider', () => {
      const tracker = new RateLimitTracker();
      
      expect(tracker.isAvailable('openai', 'gpt-4')).toBe(true);
    });

    test('should return true for untracked model', () => {
      const tracker = new RateLimitTracker();
      tracker.trackRequest('openai', 'gpt-3.5', 100);
      
      expect(tracker.isAvailable('openai', 'gpt-4')).toBe(true);
    });

    test('should return false when rate limited', () => {
      const tracker = new RateLimitTracker();
      
      tracker.trackRequest('openai', 'gpt-4', 500, { rpm: 1 });
      
      expect(tracker.isAvailable('openai', 'gpt-4')).toBe(false);
    });

    test('should return false when unavailable due to 429', () => {
      const tracker = new RateLimitTracker();
      
      tracker.updateFrom429('openai', 'gpt-4', 60);
      
      expect(tracker.isAvailable('openai', 'gpt-4')).toBe(false);
    });

    test('should check token requirements', () => {
      const tracker = new RateLimitTracker();
      
      tracker.trackRequest('openai', 'gpt-4', 8000, { tpm: 10000 });
      
      expect(tracker.isAvailable('openai', 'gpt-4', 3000)).toBe(false);
      expect(tracker.isAvailable('openai', 'gpt-4', 1000)).toBe(true);
    });
  });

  describe('getCapacity', () => {
    test('should return infinite capacity for untracked model', () => {
      const tracker = new RateLimitTracker();
      
      const capacity = tracker.getCapacity('openai', 'gpt-4');
      
      expect(capacity.requests).toBe(Infinity);
      expect(capacity.tokens).toBe(Infinity);
      expect(capacity.available).toBe(true);
    });

    test('should return actual capacity for tracked model', () => {
      const tracker = new RateLimitTracker();
      
      tracker.trackRequest('openai', 'gpt-4', 1000, {
        rpm: 100,
        tpm: 10000
      });
      
      const capacity = tracker.getCapacity('openai', 'gpt-4');
      
      expect(capacity.requests).toBe(99);
      expect(capacity.tokens).toBe(9000);
      expect(capacity.available).toBe(true);
    });
  });

  describe('resetLimits', () => {
    test('should reset all providers when no arguments', () => {
      const tracker = new RateLimitTracker();
      
      tracker.trackRequest('openai', 'gpt-4', 500);
      tracker.trackRequest('groq', 'llama-3', 300);
      
      tracker.resetLimits();
      
      expect(tracker.providers.size).toBe(0);
    });

    test('should reset all models for provider', () => {
      const tracker = new RateLimitTracker();
      
      tracker.trackRequest('openai', 'gpt-4', 500);
      tracker.trackRequest('openai', 'gpt-3.5', 300);
      tracker.trackRequest('groq', 'llama-3', 200);
      
      tracker.resetLimits('openai');
      
      expect(tracker.providers.has('openai')).toBe(false);
      expect(tracker.providers.has('groq')).toBe(true);
    });

    test('should reset specific model', () => {
      const tracker = new RateLimitTracker();
      
      tracker.trackRequest('openai', 'gpt-4', 500);
      tracker.trackRequest('openai', 'gpt-3.5', 300);
      
      tracker.resetLimits('openai', 'gpt-4');
      
      const models = tracker.getModels('openai');
      expect(models).toEqual(['gpt-3.5']);
    });

    test('should persist state after reset', () => {
      const persistence = {
        save: jest.fn(),
        load: jest.fn(() => null)
      };
      const tracker = new RateLimitTracker({ persistence });
      
      tracker.trackRequest('openai', 'gpt-4', 500);
      tracker.resetLimits();
      
      expect(persistence.save).toHaveBeenCalled();
    });
  });

  describe('getProviders', () => {
    test('should return empty array for new tracker', () => {
      const tracker = new RateLimitTracker();
      
      expect(tracker.getProviders()).toEqual([]);
    });

    test('should return all tracked providers', () => {
      const tracker = new RateLimitTracker();
      
      tracker.trackRequest('openai', 'gpt-4', 500);
      tracker.trackRequest('groq', 'llama-3', 300);
      
      const providers = tracker.getProviders();
      expect(providers).toContain('openai');
      expect(providers).toContain('groq');
    });
  });

  describe('getModels', () => {
    test('should return empty array for untracked provider', () => {
      const tracker = new RateLimitTracker();
      
      expect(tracker.getModels('openai')).toEqual([]);
    });

    test('should return all tracked models for provider', () => {
      const tracker = new RateLimitTracker();
      
      tracker.trackRequest('openai', 'gpt-4', 500);
      tracker.trackRequest('openai', 'gpt-3.5', 300);
      
      const models = tracker.getModels('openai');
      expect(models).toContain('gpt-4');
      expect(models).toContain('gpt-3.5');
    });
  });

  describe('Serialization', () => {
    test('should serialize to JSON', () => {
      const tracker = new RateLimitTracker();
      
      tracker.trackRequest('openai', 'gpt-4', 500, {
        rpm: 100,
        tpm: 10000
      });
      
      const json = tracker.toJSON();
      
      expect(json).toHaveProperty('openai');
      expect(json.openai).toHaveProperty('gpt-4');
      expect(json.openai['gpt-4'].requestsUsed).toBe(1);
      expect(json.openai['gpt-4'].tokensUsed).toBe(500);
    });

    test('should deserialize from JSON', () => {
      const tracker = new RateLimitTracker();
      
      const state = {
        openai: {
          'gpt-4': {
            modelName: 'gpt-4',
            requestsPerMinute: 100,
            tokensPerMinute: 10000,
            requestsPerDay: Infinity,
            requestsUsed: 5,
            tokensUsed: 2000,
            requestsToday: 5,
            lastReset: Date.now(),
            lastDayReset: Date.now(),
            unavailableUntil: null,
            retryAfter: null
          }
        }
      };
      
      tracker.fromJSON(state);
      
      const limit = tracker.getModelLimit('openai', 'gpt-4');
      expect(limit.requestsUsed).toBe(5);
      expect(limit.tokensUsed).toBe(2000);
      expect(limit.requestsPerMinute).toBe(100);
    });

    test('should handle invalid JSON gracefully', () => {
      const tracker = new RateLimitTracker();
      
      tracker.fromJSON(null);
      tracker.fromJSON('invalid');
      tracker.fromJSON(undefined);
      
      expect(tracker.providers.size).toBe(0);
    });

    test('should round-trip serialize/deserialize', () => {
      const tracker1 = new RateLimitTracker();
      
      tracker1.trackRequest('openai', 'gpt-4', 500, { rpm: 100 });
      tracker1.trackRequest('groq', 'llama-3', 300, { tpm: 5000 });
      
      const json = tracker1.toJSON();
      
      const tracker2 = new RateLimitTracker();
      tracker2.fromJSON(json);
      
      expect(tracker2.getProviders()).toEqual(tracker1.getProviders());
      
      const limit1 = tracker1.getModelLimit('openai', 'gpt-4');
      const limit2 = tracker2.getModelLimit('openai', 'gpt-4');
      
      expect(limit2.requestsUsed).toBe(limit1.requestsUsed);
      expect(limit2.tokensUsed).toBe(limit1.tokensUsed);
    });
  });

  describe('Persistence', () => {
    test('should persist after tracking', () => {
      const persistence = {
        save: jest.fn(),
        load: jest.fn(() => null)
      };
      const tracker = new RateLimitTracker({ persistence });
      
      tracker.trackRequest('openai', 'gpt-4', 500);
      
      expect(persistence.save).toHaveBeenCalledWith(
        expect.objectContaining({
          openai: expect.any(Object)
        })
      );
    });

    test('should load state on initialization', () => {
      const state = {
        openai: {
          'gpt-4': {
            modelName: 'gpt-4',
            requestsPerMinute: 100,
            tokensPerMinute: 10000,
            requestsPerDay: Infinity,
            requestsUsed: 10,
            tokensUsed: 5000,
            requestsToday: 10,
            lastReset: Date.now(),
            lastDayReset: Date.now(),
            unavailableUntil: null,
            retryAfter: null
          }
        }
      };
      
      const persistence = {
        save: jest.fn(),
        load: jest.fn(() => state)
      };
      
      const tracker = new RateLimitTracker({ persistence });
      
      expect(persistence.load).toHaveBeenCalled();
      
      const limit = tracker.getModelLimit('openai', 'gpt-4');
      expect(limit.requestsUsed).toBe(10);
    });

    test('should handle persistence without save method', () => {
      const tracker = new RateLimitTracker({
        persistence: { load: () => null }
      });
      
      expect(() => {
        tracker.trackRequest('openai', 'gpt-4', 500);
      }).not.toThrow();
    });

    test('should handle persistence without load method', () => {
      const tracker = new RateLimitTracker({
        persistence: { save: jest.fn() }
      });
      
      expect(tracker.providers.size).toBe(0);
    });
  });
});
