/**
 * Provider Error Handling Tests
 * 
 * Tests error scenarios, retry logic, and error standardization
 */

const { BaseProvider } = require('../../../src/providers/base-provider');
const { createProvider } = require('../../../src/providers/provider-factory');

// Mock provider for testing error handling
class MockErrorProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.mockError = null;
    this.requestCount = 0;
  }

  getEndpoint() {
    return 'https://api.mock.com/v1/chat';
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
  }

  buildRequestBody(messages, options = {}) {
    return {
      model: options.model || 'mock-model',
      messages,
      ...options
    };
  }

  async makeRequest(messages, options = {}) {
    this.requestCount++;
    
    if (this.mockError) {
      throw this.mockError;
    }

    return {
      id: 'mock-response',
      choices: [{
        message: {
          role: 'assistant',
          content: 'Mock response'
        }
      }]
    };
  }

  async streamRequest(messages, options = {}, onChunk) {
    this.requestCount++;
    
    if (this.mockError) {
      throw this.mockError;
    }

    // Simulate streaming chunks
    onChunk({ choices: [{ delta: { content: 'Mock ' } }] });
    onChunk({ choices: [{ delta: { content: 'stream' } }] });
    
    return { complete: true };
  }

  getSupportedModels() {
    return ['mock-model-1', 'mock-model-2'];
  }

  // Expose handleError for testing
  testHandleError(error, context) {
    return this.handleError(error, context);
  }
}

describe('Provider Error Handling', () => {
  describe('Error Standardization', () => {
    let provider;

    beforeEach(() => {
      provider = new MockErrorProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
    });

    test('should standardize basic errors', () => {
      const originalError = new Error('Something went wrong');
      const standardError = provider.testHandleError(originalError);

      expect(standardError).toBeInstanceOf(Error);
      expect(standardError.message).toBe('Something went wrong');
      expect(standardError.code).toBe('PROVIDER_ERROR');
      expect(standardError.provider).toBe('mock');
      expect(standardError.originalError).toBe(originalError);
    });

    test('should preserve error codes', () => {
      const originalError = new Error('Custom error');
      originalError.code = 'CUSTOM_CODE';
      
      const standardError = provider.testHandleError(originalError);
      expect(standardError.code).toBe('CUSTOM_CODE');
    });

    test('should include context in errors', () => {
      const originalError = new Error('Test error');
      const context = {
        messages: [{ role: 'user', content: 'test' }],
        options: { model: 'mock-model' }
      };

      const standardError = provider.testHandleError(originalError, context);
      expect(standardError.context).toEqual(context);
    });

    test('should handle errors without messages', () => {
      const originalError = new Error();
      const standardError = provider.testHandleError(originalError);

      expect(standardError.message).toBe('Unknown provider error');
      expect(standardError.code).toBe('PROVIDER_ERROR');
    });
  });

  describe('Rate Limit Errors', () => {
    let provider;

    beforeEach(() => {
      provider = new MockErrorProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
    });

    test('should detect rate limit from status code', () => {
      const error = new Error('Too many requests');
      error.statusCode = 429;

      const standardError = provider.testHandleError(error);
      expect(standardError.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(standardError.retryable).toBe(true);
    });

    test('should detect rate limit from message', () => {
      const error = new Error('rate limit exceeded for model');
      
      const standardError = provider.testHandleError(error);
      expect(standardError.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(standardError.retryable).toBe(true);
    });

    test('should preserve original rate limit error info', () => {
      const error = new Error('Rate limited');
      error.statusCode = 429;
      error.retryAfter = 60;

      const standardError = provider.testHandleError(error);
      expect(standardError.originalError.retryAfter).toBe(60);
    });
  });

  describe('Authentication Errors', () => {
    let provider;

    beforeEach(() => {
      provider = new MockErrorProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
    });

    test('should detect 401 unauthorized errors', () => {
      const error = new Error('Unauthorized');
      error.statusCode = 401;

      const standardError = provider.testHandleError(error);
      expect(standardError.code).toBe('AUTHENTICATION_ERROR');
      expect(standardError.retryable).toBe(false);
    });

    test('should detect 403 forbidden errors', () => {
      const error = new Error('Forbidden');
      error.statusCode = 403;

      const standardError = provider.testHandleError(error);
      expect(standardError.code).toBe('AUTHENTICATION_ERROR');
      expect(standardError.retryable).toBe(false);
    });

    test('should mark auth errors as non-retryable', () => {
      const error401 = new Error('Unauthorized');
      error401.statusCode = 401;
      
      const error403 = new Error('Forbidden');
      error403.statusCode = 403;

      expect(provider.testHandleError(error401).retryable).toBe(false);
      expect(provider.testHandleError(error403).retryable).toBe(false);
    });
  });

  describe('Timeout Errors', () => {
    let provider;

    beforeEach(() => {
      provider = new MockErrorProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
    });

    test('should detect ETIMEDOUT errors', () => {
      const error = new Error('Connection timed out');
      error.code = 'ETIMEDOUT';

      const standardError = provider.testHandleError(error);
      expect(standardError.code).toBe('TIMEOUT');
      expect(standardError.retryable).toBe(true);
    });

    test('should detect timeout from message', () => {
      const error = new Error('request timeout after 30s');
      
      const standardError = provider.testHandleError(error);
      expect(standardError.code).toBe('TIMEOUT');
      expect(standardError.retryable).toBe(true);
    });

    test('should mark timeout errors as retryable', () => {
      const error = new Error('Timeout');
      error.code = 'ETIMEDOUT';

      const standardError = provider.testHandleError(error);
      expect(standardError.retryable).toBe(true);
    });
  });

  describe('Network Errors', () => {
    let provider;

    beforeEach(() => {
      provider = new MockErrorProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
    });

    test('should detect ECONNREFUSED errors', () => {
      const error = new Error('Connection refused');
      error.code = 'ECONNREFUSED';

      const standardError = provider.testHandleError(error);
      expect(standardError.code).toBe('NETWORK_ERROR');
      expect(standardError.retryable).toBe(true);
    });

    test('should detect ENOTFOUND errors', () => {
      const error = new Error('Host not found');
      error.code = 'ENOTFOUND';

      const standardError = provider.testHandleError(error);
      expect(standardError.code).toBe('NETWORK_ERROR');
      expect(standardError.retryable).toBe(true);
    });

    test('should mark network errors as retryable', () => {
      const errorRefused = new Error('Connection refused');
      errorRefused.code = 'ECONNREFUSED';
      
      const errorNotFound = new Error('Not found');
      errorNotFound.code = 'ENOTFOUND';

      expect(provider.testHandleError(errorRefused).retryable).toBe(true);
      expect(provider.testHandleError(errorNotFound).retryable).toBe(true);
    });
  });

  describe('Provider-Specific Error Info', () => {
    let provider;

    beforeEach(() => {
      provider = new MockErrorProvider({
        type: 'mock',
        apiKey: 'test-key',
        id: 'mock-provider-1'
      });
    });

    test('should include provider type in errors', () => {
      const error = new Error('Test error');
      const standardError = provider.testHandleError(error);

      expect(standardError.provider).toBe('mock');
    });

    test('should include provider ID in errors', () => {
      const error = new Error('Test error');
      const standardError = provider.testHandleError(error);

      expect(standardError.providerId).toBe('mock-provider-1');
    });

    test('should preserve original error for debugging', () => {
      const originalError = new Error('Original message');
      originalError.stack = 'Original stack trace';
      
      const standardError = provider.testHandleError(originalError);
      expect(standardError.originalError).toBe(originalError);
      expect(standardError.originalError.stack).toBe('Original stack trace');
    });
  });

  describe('Error Context', () => {
    let provider;

    beforeEach(() => {
      provider = new MockErrorProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
    });

    test('should include request context in errors', () => {
      const error = new Error('Request failed');
      const context = {
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        options: {
          model: 'mock-model',
          temperature: 0.7
        }
      };

      const standardError = provider.testHandleError(error, context);
      expect(standardError.context).toEqual(context);
    });

    test('should handle empty context', () => {
      const error = new Error('Test error');
      const standardError = provider.testHandleError(error, {});

      expect(standardError.context).toEqual({});
    });

    test('should handle missing context', () => {
      const error = new Error('Test error');
      const standardError = provider.testHandleError(error);

      expect(standardError.context).toEqual({});
    });
  });

  describe('Real Provider Error Handling', () => {
    test('should handle OpenAI provider errors', async () => {
      const provider = createProvider({
        type: 'openai',
        apiKey: 'invalid-key'
      });

      provider.mockError = new Error('Invalid API key');
      provider.mockError.statusCode = 401;

      try {
        await provider.makeRequest([{ role: 'user', content: 'test' }]);
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.code).toBeDefined();
      }
    });

    test('should handle Groq provider errors', async () => {
      const provider = createProvider({
        type: 'groq',
        apiKey: 'invalid-key'
      });

      provider.mockError = new Error('Rate limit exceeded');
      provider.mockError.statusCode = 429;

      try {
        await provider.makeRequest([{ role: 'user', content: 'test' }]);
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.code).toBeDefined();
      }
    });
  });

  describe('Error Recovery', () => {
    let provider;

    beforeEach(() => {
      provider = new MockErrorProvider({
        type: 'mock',
        apiKey: 'test-key'
      });
    });

    test('should identify retryable errors', () => {
      const retryableErrors = [
        { code: 'ETIMEDOUT', expected: true },
        { statusCode: 429, expected: true },
        { code: 'ECONNREFUSED', expected: true },
        { code: 'ENOTFOUND', expected: true },
        { statusCode: 401, expected: false },
        { statusCode: 403, expected: false }
      ];

      retryableErrors.forEach(({ code, statusCode, expected }) => {
        const error = new Error('Test error');
        if (code) error.code = code;
        if (statusCode) error.statusCode = statusCode;

        const standardError = provider.testHandleError(error);
        if (expected) {
          expect(standardError.retryable).toBe(true);
        } else {
          expect(standardError.retryable).toBe(false);
        }
      });
    });

    test('should not mark unknown errors as retryable', () => {
      const error = new Error('Unknown error');
      const standardError = provider.testHandleError(error);

      expect(standardError.retryable).toBeUndefined();
    });
  });
});
