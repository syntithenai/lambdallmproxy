/**
 * Retry Handler
 * Executes requests with automatic retry, exponential backoff, and error classification
 */

const { ErrorClassifier } = require('./error-classifier');
const { BackoffStrategy } = require('./backoff-strategy');

class RetryHandler {
  constructor(options = {}) {
    this.errorClassifier = options.errorClassifier || new ErrorClassifier();
    this.backoffStrategy = options.backoffStrategy || new BackoffStrategy();
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    
    // Optional callbacks
    this.onRetry = options.onRetry;
    this.onSuccess = options.onSuccess;
    this.onFailure = options.onFailure;
  }

  /**
   * Execute a request with automatic retry
   * @param {Function} executor - Async function that performs the request
   * @param {...any} args - Arguments to pass to executor
   * @returns {Promise<any>} Result from successful execution
   * @throws {Error} After all retry attempts exhausted
   */
  async executeWithRetry(executor, ...args) {
    const errorHistory = [];
    let lastError = null;
    
    // Ensure at least one attempt
    const attempts = Math.max(1, this.maxRetries);

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        // Execute the request
        const result = await executor(...args);

        // Success callback
        if (this.onSuccess) {
          await this.onSuccess(result, { attempt, errorHistory });
        }

        return result;

      } catch (error) {
        lastError = error;
        errorHistory.push({
          error,
          attempt,
          timestamp: Date.now()
        });

        // Classify the error
        const classification = this.errorClassifier.classify(error);

        // Check if we should retry
        const isLastAttempt = attempt === this.maxRetries - 1;
        
        if (!classification.retryable || isLastAttempt) {
          // Don't retry - throw immediately with context
          const finalError = this._createFinalError(lastError, errorHistory);
          
          if (this.onFailure) {
            await this.onFailure(finalError, {
              attempts: attempt + 1,
              errorHistory,
              classification
            });
          }
          
          throw finalError;
        }

        // Calculate backoff delay
        const delay = this._calculateDelay(error, attempt);

        // Retry callback
        if (this.onRetry) {
          await this.onRetry(
            {
              attempt: attempt + 1,
              nextDelay: delay,
              classification,
              errorHistory
            },
            error
          );
        }

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // Should not reach here, but just in case
    const finalError = this._createFinalError(lastError, errorHistory);
    
    if (this.onFailure) {
      await this.onFailure(finalError, {
        attempts: this.maxRetries,
        errorHistory
      });
    }
    
    throw finalError;
  }

  /**
   * Calculate delay before next retry
   */
  _calculateDelay(error, attempt) {
    // Check for retry-after header
    if (error.headers && error.headers['retry-after']) {
      const retryAfterDelay = this.backoffStrategy.calculateFromRetryAfter(
        error.headers['retry-after']
      );
      
      if (retryAfterDelay > 0) {
        return Math.min(retryAfterDelay, this.maxDelay);
      }
    }

    // Use exponential backoff
    return this.backoffStrategy.calculateDelay(
      attempt,
      this.baseDelay,
      this.maxDelay
    );
  }

  /**
   * Create final error with retry context
   */
  _createFinalError(lastError, errorHistory) {
    const error = new Error(
      `Request failed after ${errorHistory.length} attempts: ${lastError.message}`
    );
    
    // Preserve stack trace from last error
    if (lastError.stack) {
      error.stack = lastError.stack;
    }

    // Add retry context
    error.attempts = errorHistory.length;
    error.errorHistory = errorHistory;
    error.originalError = lastError;
    
    // Preserve original error properties
    if (lastError.code) error.code = lastError.code;
    if (lastError.providerId) error.providerId = lastError.providerId;
    if (lastError.modelId) error.modelId = lastError.modelId;

    return error;
  }

  /**
   * Sleep for specified milliseconds
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Determine if an error is retryable (legacy method for compatibility)
   */
  isRetryable(error) {
    const classification = this.errorClassifier.classify(error);
    return classification.retryable;
  }

  /**
   * Get retry statistics
   */
  getStats() {
    return {
      maxRetries: this.maxRetries,
      baseDelay: this.baseDelay,
      maxDelay: this.maxDelay
    };
  }
}

module.exports = { RetryHandler };
