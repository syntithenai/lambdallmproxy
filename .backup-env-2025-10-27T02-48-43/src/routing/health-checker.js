/**
 * Health Checker
 * Monitors provider health with automatic recovery and availability tracking
 */

class HealthChecker {
  constructor(rateLimitTracker, options = {}) {
    this.rateLimitTracker = rateLimitTracker;
    this.checkInterval = options.checkInterval || 60000; // 1 minute default
    this.cooldownPeriod = options.cooldownPeriod || 60000; // 1 minute cooldown
    this.healthThreshold = options.healthThreshold || 0.8; // 80% availability = healthy
    this.maxErrorHistory = options.maxErrorHistory || 20;
    this.recoveryIncrement = options.recoveryIncrement || 0.2; // 20% per recovery cycle
    
    this.providerHealth = new Map(); // providerId:modelId -> health state
    this.intervalId = null;
    
    // Auto-start unless disabled
    if (options.autoStart !== false) {
      this.start();
    }
  }

  /**
   * Start periodic health checks
   */
  start() {
    if (this.intervalId) return; // Already running
    
    this.intervalId = setInterval(async () => {
      await this.runHealthCheck();
    }, this.checkInterval);
  }

  /**
   * Stop health checks
   */
  stop() {
    if (this.intervalId !== null && this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get health state key
   */
  _getHealthKey(providerId, modelId) {
    return `${providerId}:${modelId}`;
  }

  /**
   * Get or initialize health state
   */
  _getHealthState(providerId, modelId) {
    const key = this._getHealthKey(providerId, modelId);
    
    if (!this.providerHealth.has(key)) {
      this.providerHealth.set(key, {
        availability: 1.0,
        consecutiveErrors: 0,
        totalRequests: 0,
        successfulRequests: 0,
        lastError: null,
        errorHistory: [],
        lastChecked: Date.now(),
        recentEvents: [] // For weighted scoring
      });
    }
    
    return this.providerHealth.get(key);
  }

  /**
   * Record a successful request
   */
  async recordSuccess(providerId, modelId) {
    const health = this._getHealthState(providerId, modelId);
    
    health.totalRequests++;
    health.successfulRequests++;
    health.consecutiveErrors = 0;
    health.recentEvents.push({
      success: true,
      timestamp: Date.now()
    });
    
    // Clean old events (keep last 100)
    if (health.recentEvents.length > 100) {
      health.recentEvents = health.recentEvents.slice(-100);
    }
    
    // Increase availability on success
    health.availability = Math.min(1.0, health.availability + 0.05);
    
    return health;
  }

  /**
   * Record a failed request
   */
  async recordFailure(providerId, modelId, error) {
    const health = this._getHealthState(providerId, modelId);
    
    health.totalRequests++;
    health.consecutiveErrors++;
    health.lastError = {
      message: error.message,
      timestamp: Date.now(),
      stack: error.stack
    };
    
    // Add to error history
    health.errorHistory.push({
      message: error.message,
      timestamp: Date.now()
    });
    
    // Limit error history size
    if (health.errorHistory.length > this.maxErrorHistory) {
      health.errorHistory = health.errorHistory.slice(-this.maxErrorHistory);
    }
    
    // Add to recent events
    health.recentEvents.push({
      success: false,
      timestamp: Date.now()
    });
    
    // Clean old events
    if (health.recentEvents.length > 100) {
      health.recentEvents = health.recentEvents.slice(-100);
    }
    
    // Calculate new availability based on weighted recent events
    this._recalculateAvailability(health);
    
    return health;
  }

  /**
   * Recalculate availability score with exponential weighting
   * Recent events are weighted more heavily
   */
  _recalculateAvailability(health) {
    if (health.recentEvents.length === 0) {
      health.availability = 1.0;
      return;
    }
    
    const now = Date.now();
    const timeWindow = 300000; // 5 minutes
    
    let totalWeight = 0;
    let successWeight = 0;
    
    // Weight recent events more heavily (exponential decay)
    for (const event of health.recentEvents) {
      const age = now - event.timestamp;
      if (age > timeWindow) continue; // Skip old events
      
      // Exponential weighting: newer events have higher weight
      const weight = Math.exp(-age / timeWindow);
      totalWeight += weight;
      
      if (event.success) {
        successWeight += weight;
      }
    }
    
    if (totalWeight > 0) {
      health.availability = successWeight / totalWeight;
    } else {
      // No recent events, use overall success rate
      if (health.totalRequests > 0) {
        health.availability = health.successfulRequests / health.totalRequests;
      } else {
        health.availability = 1.0;
      }
    }
    
    // Apply consecutive error penalty
    if (health.consecutiveErrors > 0) {
      const penalty = Math.min(0.5, health.consecutiveErrors * 0.1);
      health.availability = Math.max(0, health.availability - penalty);
    }
  }

  /**
   * Run health check cycle (called periodically)
   */
  async runHealthCheck() {
    const now = Date.now();
    
    for (const [key, health] of this.providerHealth.entries()) {
      // Auto-recover providers after cooldown
      if (health.availability < 1.0 && health.lastError) {
        const timeSinceError = now - health.lastError.timestamp;
        
        if (timeSinceError >= this.cooldownPeriod) {
          // Reset consecutive errors
          health.consecutiveErrors = 0;
          
          // Gradually increase availability
          health.availability = Math.min(1.0, health.availability + this.recoveryIncrement);
          
          // Clear last error if fully recovered
          if (health.availability >= 1.0) {
            health.lastError = null;
          }
        }
      }
      
      health.lastChecked = now;
    }
  }

  /**
   * Get health information for a provider/model
   */
  async getHealth(providerId, modelId) {
    return this._getHealthState(providerId, modelId);
  }

  /**
   * Check if provider is healthy (above threshold)
   */
  async isHealthy(providerId, modelId) {
    const health = this._getHealthState(providerId, modelId);
    return health.availability >= this.healthThreshold;
  }

  /**
   * Get all provider health states
   */
  getAllHealth() {
    const result = {};
    
    for (const [key, health] of this.providerHealth.entries()) {
      result[key] = { ...health };
    }
    
    return result;
  }

  /**
   * Reset health state for a provider/model
   */
  resetHealth(providerId, modelId) {
    const key = this._getHealthKey(providerId, modelId);
    this.providerHealth.delete(key);
  }
}

module.exports = { HealthChecker };
