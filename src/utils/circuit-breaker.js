/**
 * Circuit Breaker Pattern for Provider Failover
 * 
 * Prevents cascading failures by tracking provider health and temporarily
 * disabling providers that are experiencing issues.
 * 
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Provider marked as down, requests blocked
 * - HALF_OPEN: Testing if provider has recovered
 */

const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

class CircuitBreaker {
  constructor(options = {}) {
    // Configuration
    this.failureThreshold = options.failureThreshold || parseInt(process.env.CB_THRESH) || 5;
    this.timeoutMs = options.timeoutMs || parseInt(process.env.CB_TIMEOUT) || 600000; // 10 minutes
    this.halfOpenRequests = options.halfOpenRequests || 1; // Number of test requests in HALF_OPEN
    
    // State tracking per provider
    this.states = new Map(); // provider -> state
    this.failures = new Map(); // provider -> [{timestamp, error}]
    this.successes = new Map(); // provider -> count in HALF_OPEN state
    this.openTimestamps = new Map(); // provider -> timestamp when circuit opened
    this.halfOpenTests = new Map(); // provider -> test attempt count
    
    console.log(`🔌 Circuit Breaker initialized: threshold=${this.failureThreshold}, timeout=${this.timeoutMs}ms`);
  }
  
  /**
   * Get current state of circuit for provider
   */
  getState(provider) {
    // Check if circuit should transition from OPEN to HALF_OPEN
    const state = this.states.get(provider) || CircuitState.CLOSED;
    
    if (state === CircuitState.OPEN) {
      const openTime = this.openTimestamps.get(provider);
      if (openTime && Date.now() - openTime >= this.timeoutMs) {
        this.transitionToHalfOpen(provider);
        return CircuitState.HALF_OPEN;
      }
    }
    
    return state;
  }
  
  /**
   * Check if provider is available (circuit not OPEN)
   */
  isAvailable(provider) {
    const state = this.getState(provider);
    return state === CircuitState.CLOSED || state === CircuitState.HALF_OPEN;
  }
  
  /**
   * Record successful request
   */
  recordSuccess(provider) {
    const state = this.getState(provider);
    
    if (state === CircuitState.HALF_OPEN) {
      // Increment success counter
      const successCount = (this.successes.get(provider) || 0) + 1;
      this.successes.set(provider, successCount);
      
      // If enough successful requests, close the circuit
      if (successCount >= this.halfOpenRequests) {
        this.transitionToClosed(provider);
        console.log(`🟢 Circuit CLOSED for ${provider} (recovered after testing)`);
      }
    } else if (state === CircuitState.OPEN) {
      // This shouldn't happen, but handle gracefully
      console.warn(`⚠️ Success recorded for ${provider} while circuit OPEN`);
    } else {
      // CLOSED state - clear any old failures
      this.clearFailures(provider);
    }
  }
  
  /**
   * Record failed request
   */
  recordFailure(provider, error = null) {
    const now = Date.now();
    const currentState = this.getState(provider);
    
    // Get recent failures within the time window
    let providerFailures = this.failures.get(provider) || [];
    providerFailures = providerFailures.filter(f => now - f.timestamp < this.timeoutMs);
    
    // Add new failure
    providerFailures.push({ timestamp: now, error: error?.message || 'Unknown error' });
    this.failures.set(provider, providerFailures);
    
    console.log(`❌ Failure recorded for ${provider}: ${providerFailures.length}/${this.failureThreshold} failures`);
    
    // Check if threshold exceeded
    if (providerFailures.length >= this.failureThreshold) {
      if (currentState !== CircuitState.OPEN) {
        this.transitionToOpen(provider);
        console.error(`🔴 Circuit OPEN for ${provider}: ${providerFailures.length} failures in ${this.timeoutMs}ms window`);
      }
    } else if (currentState === CircuitState.HALF_OPEN) {
      // Failure during test - reopen circuit
      this.transitionToOpen(provider);
      console.warn(`🟡 Circuit reopened for ${provider}: test failed in HALF_OPEN state`);
    }
  }
  
  /**
   * Transition to CLOSED state
   */
  transitionToClosed(provider) {
    this.states.set(provider, CircuitState.CLOSED);
    this.clearFailures(provider);
    this.successes.delete(provider);
    this.openTimestamps.delete(provider);
    this.halfOpenTests.delete(provider);
  }
  
  /**
   * Transition to OPEN state
   */
  transitionToOpen(provider) {
    this.states.set(provider, CircuitState.OPEN);
    this.openTimestamps.set(provider, Date.now());
    this.successes.delete(provider);
    this.halfOpenTests.set(provider, 0);
  }
  
  /**
   * Transition to HALF_OPEN state
   */
  transitionToHalfOpen(provider) {
    this.states.set(provider, CircuitState.HALF_OPEN);
    this.successes.set(provider, 0);
    const testCount = (this.halfOpenTests.get(provider) || 0) + 1;
    this.halfOpenTests.set(provider, testCount);
    console.log(`🟡 Circuit HALF_OPEN for ${provider} (test attempt #${testCount})`);
  }
  
  /**
   * Clear failures for provider
   */
  clearFailures(provider) {
    this.failures.delete(provider);
  }
  
  /**
   * Get failure count for provider
   */
  getFailureCount(provider) {
    const now = Date.now();
    const providerFailures = this.failures.get(provider) || [];
    return providerFailures.filter(f => now - f.timestamp < this.timeoutMs).length;
  }
  
  /**
   * Get last failure timestamp
   */
  getLastFailure(provider) {
    const providerFailures = this.failures.get(provider) || [];
    if (providerFailures.length === 0) return null;
    return Math.max(...providerFailures.map(f => f.timestamp));
  }
  
  /**
   * Get status report for all providers
   */
  getStatusReport() {
    const report = {};
    
    // Get all providers we've tracked
    const allProviders = new Set([
      ...this.states.keys(),
      ...this.failures.keys()
    ]);
    
    for (const provider of allProviders) {
      const state = this.getState(provider);
      const failureCount = this.getFailureCount(provider);
      const lastFailure = this.getLastFailure(provider);
      
      report[provider] = {
        state,
        failureCount,
        lastFailure: lastFailure ? new Date(lastFailure).toISOString() : null,
        available: this.isAvailable(provider),
        threshold: this.failureThreshold,
        timeoutMs: this.timeoutMs
      };
      
      if (state === CircuitState.OPEN) {
        const openTime = this.openTimestamps.get(provider);
        const remainingMs = this.timeoutMs - (Date.now() - openTime);
        report[provider].recoveryIn = Math.max(0, remainingMs);
      }
    }
    
    return report;
  }
  
  /**
   * Reset circuit for provider (for testing/admin purposes)
   */
  reset(provider) {
    this.transitionToClosed(provider);
    console.log(`♻️ Circuit manually reset for ${provider}`);
  }
  
  /**
   * Reset all circuits (for testing/admin purposes)
   */
  resetAll() {
    const providers = Array.from(this.states.keys());
    providers.forEach(p => this.reset(p));
    console.log(`♻️ All circuits manually reset`);
  }
}

// Singleton instance
const circuitBreaker = new CircuitBreaker();

module.exports = {
  CircuitState,
  circuitBreaker,
  // Export functions for direct use
  getState: (provider) => circuitBreaker.getState(provider),
  isAvailable: (provider) => circuitBreaker.isAvailable(provider),
  recordSuccess: (provider) => circuitBreaker.recordSuccess(provider),
  recordFailure: (provider, error) => circuitBreaker.recordFailure(provider, error),
  getStatusReport: () => circuitBreaker.getStatusReport(),
  reset: (provider) => circuitBreaker.reset(provider),
  resetAll: () => circuitBreaker.resetAll()
};
