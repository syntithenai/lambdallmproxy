/**
 * Unit Tests: Retry Handler
 * Tests automatic retry and failover logic with error handling
 */

const { RetryHandler } = require('../../src/retry/retry-handler');
const { ErrorClassifier } = require('../../src/retry/error-classifier');
const { BackoffStrategy } = require('../../src/retry/backoff-strategy');

describe('RetryHandler', () => {
  let retryHandler;
  let mockErrorClassifier;
  let mockBackoffStrategy;
  let mockRequestExecutor;

  beforeEach(() => {
    mockErrorClassifier = new ErrorClassifier();
    mockBackoffStrategy = new BackoffStrategy();
    mockRequestExecutor = jest.fn();

    retryHandler = new RetryHandler({
      errorClassifier: mockErrorClassifier,
      backoffStrategy: mockBackoffStrategy,
      maxRetries: 3
    });

    // Mock sleep to speed up tests
    jest.spyOn(retryHandler, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Successful Requests', () => {
    test('should return result on first successful attempt', async () => {
      const expectedResult = { data: 'success', tokensUsed: 100 };
      mockRequestExecutor.mockResolvedValueOnce(expectedResult);

      const result = await retryHandler.executeWithRetry(mockRequestExecutor);

      expect(result).toEqual(expectedResult);
      expect(mockRequestExecutor).toHaveBeenCalledTimes(1);
      expect(retryHandler.sleep).not.toHaveBeenCalled();
    });

    test('should not retry on success', async () => {
      mockRequestExecutor.mockResolvedValue({ data: 'success' });

      await retryHandler.executeWithRetry(mockRequestExecutor);

      expect(mockRequestExecutor).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retry Logic', () => {
    test('should retry on rate limit error (429)', async () => {
      const error = { code: 429, message: 'Too many requests' };
      mockRequestExecutor
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      const result = await retryHandler.executeWithRetry(mockRequestExecutor);

      expect(result.data).toBe('success');
      expect(mockRequestExecutor).toHaveBeenCalledTimes(2);
      expect(retryHandler.sleep).toHaveBeenCalledTimes(1);
    });

    test('should retry on server errors (5xx)', async () => {
      const error = { code: 500, message: 'Internal server error' };
      mockRequestExecutor
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      const result = await retryHandler.executeWithRetry(mockRequestExecutor);

      expect(result.data).toBe('success');
      expect(mockRequestExecutor).toHaveBeenCalledTimes(2);
    });

    test('should retry on network errors', async () => {
      const error = { code: 'ECONNRESET', message: 'Connection reset' };
      mockRequestExecutor
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      const result = await retryHandler.executeWithRetry(mockRequestExecutor);

      expect(result.data).toBe('success');
      expect(mockRequestExecutor).toHaveBeenCalledTimes(2);
    });

    test('should not retry on client errors (4xx except 429)', async () => {
      const error = { code: 400, message: 'Bad request' };
      mockRequestExecutor.mockRejectedValue(error);

      await expect(
        retryHandler.executeWithRetry(mockRequestExecutor)
      ).rejects.toThrow();

      expect(mockRequestExecutor).toHaveBeenCalledTimes(1);
      expect(retryHandler.sleep).not.toHaveBeenCalled();
    });

    test('should not retry on auth errors (401)', async () => {
      const error = { code: 401, message: 'Unauthorized' };
      mockRequestExecutor.mockRejectedValue(error);

      await expect(
        retryHandler.executeWithRetry(mockRequestExecutor)
      ).rejects.toThrow();

      expect(mockRequestExecutor).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retry Attempts', () => {
    test('should respect max retry limit', async () => {
      const error = { code: 500, message: 'Server error' };
      mockRequestExecutor.mockRejectedValue(error);

      await expect(
        retryHandler.executeWithRetry(mockRequestExecutor)
      ).rejects.toThrow();

      expect(mockRequestExecutor).toHaveBeenCalledTimes(3); // maxRetries = 3
    });

    test('should succeed on last retry attempt', async () => {
      const error = { code: 500, message: 'Server error' };
      mockRequestExecutor
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      const result = await retryHandler.executeWithRetry(mockRequestExecutor);

      expect(result.data).toBe('success');
      expect(mockRequestExecutor).toHaveBeenCalledTimes(3);
    });

    test('should use custom max retries', async () => {
      const customHandler = new RetryHandler({
        errorClassifier: mockErrorClassifier,
        backoffStrategy: mockBackoffStrategy,
        maxRetries: 5
      });
      jest.spyOn(customHandler, 'sleep').mockResolvedValue(undefined);

      const error = { code: 500, message: 'Server error' };
      mockRequestExecutor.mockRejectedValue(error);

      await expect(
        customHandler.executeWithRetry(mockRequestExecutor)
      ).rejects.toThrow();

      expect(mockRequestExecutor).toHaveBeenCalledTimes(5);
    });
  });

  describe('Backoff Strategy', () => {
    test('should apply exponential backoff between retries', async () => {
      // Restore actual sleep to test backoff
      retryHandler.sleep.mockRestore();
      jest.spyOn(retryHandler, 'sleep').mockImplementation(async (ms) => {
        // Just capture the delay, don't actually sleep
        return ms;
      });

      const error = { code: 500, message: 'Server error' };
      mockRequestExecutor
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      await retryHandler.executeWithRetry(mockRequestExecutor);

      // Check that sleep was called with increasing delays
      expect(retryHandler.sleep).toHaveBeenCalledTimes(2);
      const delays = retryHandler.sleep.mock.calls.map(call => call[0]);
      
      // Delays should be increasing (with some jitter tolerance)
      expect(delays[1]).toBeGreaterThan(delays[0] * 0.5);
    });

    test('should use retry-after header when available', async () => {
      const error = {
        code: 429,
        message: 'Too many requests',
        headers: { 'retry-after': '5' }
      };
      mockRequestExecutor
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      await retryHandler.executeWithRetry(mockRequestExecutor);

      // Should have used retry-after delay
      expect(retryHandler.sleep).toHaveBeenCalledWith(5000); // 5 seconds in ms
    });

    test('should cap delay at maximum', async () => {
      const customHandler = new RetryHandler({
        errorClassifier: mockErrorClassifier,
        backoffStrategy: mockBackoffStrategy,
        maxRetries: 10,
        maxDelay: 2000
      });
      jest.spyOn(customHandler, 'sleep').mockResolvedValue(undefined);

      const error = { code: 500, message: 'Server error' };
      mockRequestExecutor
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      await customHandler.executeWithRetry(mockRequestExecutor);

      // All delays should be capped at maxDelay
      const delays = customHandler.sleep.mock.calls.map(call => call[0]);
      for (const delay of delays) {
        expect(delay).toBeLessThanOrEqual(2000);
      }
    });
  });

  describe('Error Classification', () => {
    test('should classify errors before retry decision', async () => {
      jest.spyOn(mockErrorClassifier, 'classify');
      
      const error = { code: 429, message: 'Too many requests' };
      mockRequestExecutor
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      await retryHandler.executeWithRetry(mockRequestExecutor);

      expect(mockErrorClassifier.classify).toHaveBeenCalledWith(error);
    });

    test('should respect classifier retryable decision', async () => {
      // Mock classifier to mark everything as non-retryable
      jest.spyOn(mockErrorClassifier, 'classify').mockReturnValue({
        type: 'CLIENT_ERROR',
        retryable: false,
        severity: 'HIGH',
        suggestedAction: 'Check request'
      });

      const error = { code: 500, message: 'Server error' };
      mockRequestExecutor.mockRejectedValue(error);

      await expect(
        retryHandler.executeWithRetry(mockRequestExecutor)
      ).rejects.toThrow();

      // Should not retry if classifier says non-retryable
      expect(mockRequestExecutor).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Context', () => {
    test('should preserve error information', async () => {
      const error = {
        code: 500,
        message: 'Server error',
        providerId: 'test-provider',
        modelId: 'test-model',
        stack: 'Error stack...'
      };
      mockRequestExecutor.mockRejectedValue(error);

      await expect(
        retryHandler.executeWithRetry(mockRequestExecutor)
      ).rejects.toMatchObject({
        message: expect.stringContaining('Server error'),
        attempts: 3
      });
    });

    test('should include retry metadata in final error', async () => {
      const error = { code: 500, message: 'Server error' };
      mockRequestExecutor.mockRejectedValue(error);

      try {
        await retryHandler.executeWithRetry(mockRequestExecutor);
        fail('Should have thrown error');
      } catch (err) {
        expect(err).toHaveProperty('attempts');
        expect(err.attempts).toBe(3);
        expect(err.message).toContain('after 3 attempts');
      }
    });

    test('should track all errors from retry attempts', async () => {
      const errors = [
        { code: 500, message: 'Error 1' },
        { code: 500, message: 'Error 2' },
        { code: 500, message: 'Error 3' }
      ];
      
      errors.forEach(err => mockRequestExecutor.mockRejectedValueOnce(err));

      try {
        await retryHandler.executeWithRetry(mockRequestExecutor);
        fail('Should have thrown error');
      } catch (err) {
        expect(err).toHaveProperty('errorHistory');
        expect(err.errorHistory).toHaveLength(3);
      }
    });
  });

  describe('Request Execution', () => {
    test('should pass arguments to request executor', async () => {
      mockRequestExecutor.mockResolvedValue({ data: 'success' });
      
      const arg1 = 'test-arg-1';
      const arg2 = { key: 'value' };

      await retryHandler.executeWithRetry(mockRequestExecutor, arg1, arg2);

      expect(mockRequestExecutor).toHaveBeenCalledWith(arg1, arg2);
    });

    test('should support async request executors', async () => {
      const asyncExecutor = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { data: 'async-success' };
      });

      const result = await retryHandler.executeWithRetry(asyncExecutor);

      expect(result.data).toBe('async-success');
    });

    test('should handle promise rejections', async () => {
      mockRequestExecutor.mockImplementation(() => 
        Promise.reject(new Error('Promise rejection'))
      );

      await expect(
        retryHandler.executeWithRetry(mockRequestExecutor)
      ).rejects.toThrow();
    });
  });

  describe('Retry Callbacks', () => {
    test('should call onRetry callback before each retry', async () => {
      const onRetry = jest.fn();
      const handlerWithCallback = new RetryHandler({
        errorClassifier: mockErrorClassifier,
        backoffStrategy: mockBackoffStrategy,
        maxRetries: 3,
        onRetry
      });
      jest.spyOn(handlerWithCallback, 'sleep').mockResolvedValue(undefined);

      const error = { code: 500, message: 'Server error' };
      mockRequestExecutor
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: 'success' });

      await handlerWithCallback.executeWithRetry(mockRequestExecutor);

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 1 }),
        error
      );
    });

    test('should call onSuccess callback after successful request', async () => {
      const onSuccess = jest.fn();
      const handlerWithCallback = new RetryHandler({
        errorClassifier: mockErrorClassifier,
        backoffStrategy: mockBackoffStrategy,
        onSuccess
      });

      const result = { data: 'success' };
      mockRequestExecutor.mockResolvedValue(result);

      await handlerWithCallback.executeWithRetry(mockRequestExecutor);

      expect(onSuccess).toHaveBeenCalledWith(result, expect.objectContaining({ attempt: 0 }));
    });

    test('should call onFailure callback after all retries exhausted', async () => {
      const onFailure = jest.fn();
      const handlerWithCallback = new RetryHandler({
        errorClassifier: mockErrorClassifier,
        backoffStrategy: mockBackoffStrategy,
        maxRetries: 3,
        onFailure
      });
      jest.spyOn(handlerWithCallback, 'sleep').mockResolvedValue(undefined);

      const error = { code: 500, message: 'Server error' };
      mockRequestExecutor.mockRejectedValue(error);

      await expect(
        handlerWithCallback.executeWithRetry(mockRequestExecutor)
      ).rejects.toThrow();

      expect(onFailure).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ attempts: 3 })
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle executor returning null', async () => {
      mockRequestExecutor.mockResolvedValue(null);

      const result = await retryHandler.executeWithRetry(mockRequestExecutor);

      expect(result).toBeNull();
    });

    test('should handle errors without code property', async () => {
      const error = new Error('Generic error');
      mockRequestExecutor.mockRejectedValue(error);

      await expect(
        retryHandler.executeWithRetry(mockRequestExecutor)
      ).rejects.toThrow();
    });

    test('should handle synchronous executor functions', async () => {
      const syncExecutor = jest.fn(() => ({ data: 'sync-success' }));

      const result = await retryHandler.executeWithRetry(syncExecutor);

      expect(result.data).toBe('sync-success');
    });

    test('should handle zero max retries', async () => {
      const noRetryHandler = new RetryHandler({
        errorClassifier: mockErrorClassifier,
        backoffStrategy: mockBackoffStrategy,
        maxRetries: 0
      });

      const error = { code: 500, message: 'Server error' };
      mockRequestExecutor.mockRejectedValue(error);

      await expect(
        noRetryHandler.executeWithRetry(mockRequestExecutor)
      ).rejects.toThrow();

      expect(mockRequestExecutor).toHaveBeenCalledTimes(1);
    });
  });
});
