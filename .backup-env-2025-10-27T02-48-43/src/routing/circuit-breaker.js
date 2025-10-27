/**
 * Circuit Breaker
 * Implements circuit breaker pattern to prevent cascading failures
 * States: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
 */

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.timeout = options.timeout || 60000; // 1 minute default
    this.states = new Map(); // providerId -> state
  }

  /**
   * Get or initialize state for a provider
   */
  _getState(providerId) {
    if (!this.states.has(providerId)) {
      this.states.set(providerId, {
        status: 'CLOSED',
        failures: 0,
        lastFailure: null,
        nextRetry: null
      });
    }
    return this.states.get(providerId);
  }

  /**
   * Check if circuit allows request
   * Returns { allowed: boolean, reason?: string }
   */
  async checkCircuit(providerId) {
    const state = this._getState(providerId);
    
    if (state.status === 'OPEN') {
      const now = Date.now();
      
      // Check if timeout has passed
      if (now >= state.nextRetry) {
        // Transition to HALF_OPEN for testing
        state.status = 'HALF_OPEN';
        return { allowed: true };
      }
      
      // Still in timeout period
      return { 
        allowed: false, 
        reason: 'circuit-open',
        nextRetry: state.nextRetry
      };
    }
    
    // CLOSED or HALF_OPEN - allow request
    return { allowed: true };
  }

  /**
   * Record a successful request
   */
  async recordSuccess(providerId) {
    const state = this._getState(providerId);
    
    // Reset failures and close circuit
    state.failures = 0;
    state.status = 'CLOSED';
    state.lastFailure = null;
    state.nextRetry = null;
  }

  /**
   * Record a failed request
   */
  async recordFailure(providerId) {
    const state = this._getState(providerId);
    const now = Date.now();
    
    state.failures += 1;
    state.lastFailure = now;
    
    // Check if we've reached the threshold
    if (state.failures >= this.failureThreshold) {
      state.status = 'OPEN';
      state.nextRetry = now + this.timeout;
    } else if (state.status === 'HALF_OPEN') {
      // Failed during testing - reopen immediately
      state.status = 'OPEN';
      state.nextRetry = now + this.timeout;
    }
  }

  /**
   * Get current state for a provider
   */
  getState(providerId) {
    return { ...this._getState(providerId) };
  }

  /**
   * Get all circuit states
   */
  getAllStates() {
    const result = {};
    for (const [providerId, state] of this.states.entries()) {
      result[providerId] = { ...state };
    }
    return result;
  }

  /**
   * Reset circuit for a specific provider
   */
  reset(providerId) {
    this.states.set(providerId, {
      status: 'CLOSED',
      failures: 0,
      lastFailure: null,
      nextRetry: null
    });
  }

  /**
   * Reset all circuits
   */
  resetAll() {
    this.states.clear();
  }

  /**
   * Check if circuit is open
   */
  isOpen(providerId) {
    const state = this._getState(providerId);
    return state.status === 'OPEN';
  }

  /**
   * Check if circuit is half-open
   */
  isHalfOpen(providerId) {
    const state = this._getState(providerId);
    return state.status === 'HALF_OPEN';
  }

  /**
   * Check if circuit is closed
   */
  isClosed(providerId) {
    const state = this._getState(providerId);
    return state.status === 'CLOSED';
  }
}

module.exports = { CircuitBreaker };
