/**
 * Load Balancer Module
 * 
 * Distributes requests across multiple providers using round-robin with rate limit awareness
 */

class LoadBalancer {
  constructor(rateLimitTracker) {
    this.rateLimitTracker = rateLimitTracker;
    this.roundRobinIndex = new Map(); // Per-provider-type round-robin state
  }

  /**
   * Distribute request across providers using round-robin
   * @param {Array<Object>} providers - List of provider configurations
   * @param {string} modelId - Model identifier
   * @param {number} tokens - Estimated tokens for request (optional)
   * @returns {Promise<Object|null>} Selected provider or null if none available
   */
  async distributeRequest(providers, modelId, tokens = 1000) {
    // Validate inputs
    if (!providers || !Array.isArray(providers) || providers.length === 0) {
      return null;
    }

    const providerType = providers[0].type; // Assume same type
    const currentIndex = this.roundRobinIndex.get(providerType) || 0;

    // Try each provider in round-robin order
    for (let i = 0; i < providers.length; i++) {
      const index = (currentIndex + i) % providers.length;
      const provider = providers[index];

      // Check if provider can handle request (rate limit check)
      if (modelId && this.rateLimitTracker) {
        const canMake = this.rateLimitTracker.isAvailable(
          provider.id,
          modelId,
          tokens
        );

        if (!canMake) {
          continue; // Skip this provider, try next
        }
      }

      // Found available provider, update round-robin index for next call
      this.roundRobinIndex.set(providerType, (index + 1) % providers.length);
      return provider;
    }

    // No available provider found
    return null;
  }

  /**
   * Reset round-robin state for a provider type
   * @param {string} providerType - Provider type to reset
   */
  reset(providerType) {
    if (providerType) {
      this.roundRobinIndex.set(providerType, 0);
    } else {
      this.roundRobinIndex.clear();
    }
  }

  /**
   * Get current round-robin index for a provider type
   * @param {string} providerType - Provider type
   * @returns {number} Current index
   */
  getCurrentIndex(providerType) {
    return this.roundRobinIndex.get(providerType) || 0;
  }
}

module.exports = { LoadBalancer };
