/**
 * Backoff Strategy
 * Calculates retry delays with exponential backoff and jitter
 */

class BackoffStrategy {
  /**
   * Calculate retry delay with exponential backoff and jitter
   * @param {number} attempt - Current attempt number (0-based)
   * @param {number} baseDelay - Base delay in milliseconds (default 1000)
   * @param {number} maxDelay - Maximum delay in milliseconds (default 30000)
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attempt, baseDelay = 1000, maxDelay = 30000) {
    // Exponential backoff: delay = baseDelay * 2^attempt
    const exponential = baseDelay * Math.pow(2, attempt);
    
    // Add jitter (±25%): multiplier between 0.75 and 1.25
    const jitterMultiplier = 0.75 + Math.random() * 0.5;
    const withJitter = exponential * jitterMultiplier;
    
    // Cap at maxDelay
    return Math.min(withJitter, maxDelay);
  }

  /**
   * Calculate delay from retry-after header
   * Handles both seconds (number/string) and HTTP date formats
   * @param {number|string} retryAfter - Value from Retry-After header
   * @returns {number} Delay in milliseconds
   */
  calculateFromRetryAfter(retryAfter) {
    // Handle null/undefined
    if (retryAfter === null || retryAfter === undefined) {
      return 0;
    }

    // Handle numeric seconds
    if (typeof retryAfter === 'number') {
      return retryAfter * 1000;
    }

    if (typeof retryAfter === 'string') {
      // Try parsing as integer seconds
      const seconds = parseInt(retryAfter);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }

      // Try parsing as HTTP date
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        const delay = date.getTime() - Date.now();
        return Math.max(0, delay); // Don't return negative delays
      }
    }

    // Invalid format
    return 0;
  }

  /**
   * Get recommended delay, preferring Retry-After if available
   * @param {number} attempt - Current attempt number
   * @param {any} retryAfter - Optional Retry-After header value
   * @param {number} baseDelay - Base delay for exponential backoff
   * @param {number} maxDelay - Maximum delay
   * @returns {number} Delay in milliseconds
   */
  getDelay(attempt, retryAfter, baseDelay = 1000, maxDelay = 30000) {
    // Prefer Retry-After header if provided
    if (retryAfter) {
      const retryAfterDelay = this.calculateFromRetryAfter(retryAfter);
      if (retryAfterDelay > 0) {
        return Math.min(retryAfterDelay, maxDelay);
      }
    }

    // Fall back to exponential backoff
    return this.calculateDelay(attempt, baseDelay, maxDelay);
  }
}

module.exports = { BackoffStrategy };
