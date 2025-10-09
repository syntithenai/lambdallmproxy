/**
 * Unit Tests: Error Classifier
 * Tests error classification, retryability, and severity assessment
 */

const { ErrorClassifier } = require('../../src/retry/error-classifier');

describe('ErrorClassifier', () => {
  let classifier;

  beforeEach(() => {
    classifier = new ErrorClassifier();
  });

  describe('Error Type Classification', () => {
    test('should classify 429 as RATE_LIMIT', () => {
      const error = { code: 429, message: 'Too many requests' };
      
      const classification = classifier.classify(error);
      
      expect(classification.type).toBe('RATE_LIMIT');
    });

    test('should classify 401 as AUTH', () => {
      const error = { code: 401, message: 'Unauthorized' };
      
      const classification = classifier.classify(error);
      
      expect(classification.type).toBe('AUTH');
    });

    test('should classify 403 as FORBIDDEN', () => {
      const error = { code: 403, message: 'Forbidden' };
      
      const classification = classifier.classify(error);
      
      expect(classification.type).toBe('FORBIDDEN');
    });

    test('should classify 5xx as SERVER_ERROR', () => {
      const errors = [
        { code: 500, message: 'Internal server error' },
        { code: 502, message: 'Bad gateway' },
        { code: 503, message: 'Service unavailable' }
      ];
      
      for (const error of errors) {
        const classification = classifier.classify(error);
        expect(classification.type).toBe('SERVER_ERROR');
      }
    });

    test('should classify 4xx as CLIENT_ERROR', () => {
      const errors = [
        { code: 400, message: 'Bad request' },
        { code: 404, message: 'Not found' }
      ];
      
      for (const error of errors) {
        const classification = classifier.classify(error);
        expect(classification.type).toBe('CLIENT_ERROR');
      }
    });

    test('should classify network errors', () => {
      const errors = [
        { code: 'ECONNRESET', message: 'Connection reset' },
        { code: 'ETIMEDOUT', message: 'Connection timed out' }
      ];
      
      for (const error of errors) {
        const classification = classifier.classify(error);
        expect(classification.type).toBe('NETWORK');
      }
    });

    test('should classify unknown errors', () => {
      const error = { message: 'Something went wrong' };
      
      const classification = classifier.classify(error);
      
      expect(classification.type).toBe('UNKNOWN');
    });
  });

  describe('Retryability Assessment', () => {
    test('should mark rate limit errors as retryable', () => {
      const error = { code: 429, message: 'Too many requests' };
      
      const classification = classifier.classify(error);
      
      expect(classification.retryable).toBe(true);
    });

    test('should mark server errors as retryable', () => {
      const error = { code: 500, message: 'Internal server error' };
      
      const classification = classifier.classify(error);
      
      expect(classification.retryable).toBe(true);
    });

    test('should mark network errors as retryable', () => {
      const error = { code: 'ECONNRESET', message: 'Connection reset' };
      
      const classification = classifier.classify(error);
      
      expect(classification.retryable).toBe(true);
    });

    test('should mark auth errors as non-retryable', () => {
      const error = { code: 401, message: 'Unauthorized' };
      
      const classification = classifier.classify(error);
      
      expect(classification.retryable).toBe(false);
    });

    test('should mark client errors as non-retryable', () => {
      const error = { code: 400, message: 'Bad request' };
      
      const classification = classifier.classify(error);
      
      expect(classification.retryable).toBe(false);
    });
  });

  describe('Severity Assessment', () => {
    test('should assign LOW severity to rate limit errors', () => {
      const error = { code: 429, message: 'Too many requests' };
      
      const classification = classifier.classify(error);
      
      expect(classification.severity).toBe('LOW');
    });

    test('should assign MEDIUM severity to server errors', () => {
      const error = { code: 500, message: 'Internal server error' };
      
      const classification = classifier.classify(error);
      
      expect(classification.severity).toBe('MEDIUM');
    });

    test('should assign HIGH severity to auth errors', () => {
      const error = { code: 401, message: 'Unauthorized' };
      
      const classification = classifier.classify(error);
      
      expect(classification.severity).toBe('HIGH');
    });

    test('should assign MEDIUM severity to unknown errors', () => {
      const error = { message: 'Something went wrong' };
      
      const classification = classifier.classify(error);
      
      expect(classification.severity).toBe('MEDIUM');
    });
  });

  describe('Suggested Actions', () => {
    test('should suggest switching provider for rate limits', () => {
      const error = { code: 429, message: 'Too many requests' };
      
      const classification = classifier.classify(error);
      
      expect(classification.suggestedAction).toContain('Switch');
    });

    test('should suggest checking API key for auth errors', () => {
      const error = { code: 401, message: 'Unauthorized' };
      
      const classification = classifier.classify(error);
      
      expect(classification.suggestedAction).toContain('API key');
    });

    test('should suggest retry with backoff for server errors', () => {
      const error = { code: 500, message: 'Internal server error' };
      
      const classification = classifier.classify(error);
      
      expect(classification.suggestedAction).toContain('Retry');
    });

    test('should suggest contacting support for unknown errors', () => {
      const error = { message: 'Something went wrong' };
      
      const classification = classifier.classify(error);
      
      expect(classification.suggestedAction).toContain('support');
    });
  });

  describe('Complete Classification', () => {
    test('should return all classification fields', () => {
      const error = { code: 429, message: 'Too many requests' };
      
      const classification = classifier.classify(error);
      
      expect(classification).toHaveProperty('type');
      expect(classification).toHaveProperty('retryable');
      expect(classification).toHaveProperty('severity');
      expect(classification).toHaveProperty('suggestedAction');
    });

    test('should handle Error objects', () => {
      const error = new Error('Network timeout');
      error.code = 'ETIMEDOUT';
      
      const classification = classifier.classify(error);
      
      expect(classification.type).toBe('NETWORK');
      expect(classification.retryable).toBe(true);
    });

    test('should handle errors with additional metadata', () => {
      const error = {
        code: 429,
        message: 'Too many requests',
        headers: { 'retry-after': '60' },
        providerId: 'test-provider'
      };
      
      const classification = classifier.classify(error);
      
      expect(classification.type).toBe('RATE_LIMIT');
      expect(classification.retryable).toBe(true);
    });
  });
});
