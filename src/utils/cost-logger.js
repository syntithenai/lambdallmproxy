/**
 * Unified cost logging service for LLM and Lambda calls
 */

const { calculateLLMCost, calculateLambdaCost } = require('./pricing-service');

class CostLogger {
  constructor() {
    this.costRecords = [];
  }

  /**
   * Log an LLM API call with cost calculation
   * @param {Object} options - Logging options  
   * @param {string} options.userEmail - User email for billing
   * @param {string} options.provider - Provider name (e.g., 'openai', 'groq')
   * @param {string} options.model - Model used
   * @param {number} options.promptTokens - Number of prompt tokens
   * @param {number} options.completionTokens - Number of completion tokens
   * @param {number} options.durationMs - Duration in milliseconds
   * @param {string} options.type - Type of call ('llm', 'guardrail_input', etc.)
   * @param {Object} options.providerObj - Provider configuration object
   * @param {boolean} options.isUIKey - Whether this uses UI-provided keys (free)
   * @param {string} options.envType - Environment type ('dev', 'prod')
   * @param {string} options.requestId - Request ID for tracking
   * @returns {Object} Cost calculation result
   */
  logLLMCost({
    userEmail,
    provider,
    model,
    promptTokens,
    completionTokens,
    durationMs,
    type = 'llm',
    providerObj = null,
    isUIKey = false,
    envType = 'prod',
    requestId = null
  }) {
    const cost = calculateLLMCost({
      model,
      promptTokens,
      completionTokens,
      provider: providerObj,
      isUIKey,
      envType
    });

    const record = {
      userEmail,
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost,
      durationMs,
      type,
      timestamp: new Date().toISOString(),
      requestId,
      isUIKey,
      envType
    };

    this.costRecords.push(record);
    
    // Log to console for monitoring
    if (cost > 0 || process.env.DEBUG_COSTS) {
      console.log(`💰 LLM Cost - User: ${userEmail}, Provider: ${provider}, Model: ${model}, Cost: $${cost.toFixed(6)}, Tokens: ${promptTokens}+${completionTokens}=${record.totalTokens}`);
    }

    return record;
  }

  /**
   * Log a Lambda execution cost with markup
   * @param {number} executionTimeMs - Execution time in milliseconds  
   * @param {string} envType - Environment type ('dev', 'prod')
   * @param {string} functionName - Name of the Lambda function
   * @returns {Object} Cost calculation result
   */
  logLambdaCost(executionTimeMs, envType = 'prod', functionName = 'unknown') {
    const cost = calculateLambdaCost(executionTimeMs, envType);
    
    const record = {
      type: 'lambda',
      functionName,
      executionTimeMs,
      cost,
      timestamp: new Date().toISOString(),
      envType
    };

    this.costRecords.push(record);
    
    // Log to console for monitoring
    if (cost > 0 || process.env.DEBUG_COSTS) {
      console.log(`💰 Lambda Cost - Function: ${functionName}, Time: ${executionTimeMs}ms, Cost: $${cost.toFixed(6)}`);
    }

    return record;
  }

  /**
   * Get all cost records
   * @returns {Array} Array of cost records
   */
  getCostRecords() {
    return this.costRecords;
  }

  /**
   * Clear cost records (useful for new requests)
   */
  clear() {
    this.costRecords = [];
  }

  /**
   * Get total cost for all records
   * @returns {number} Total cost in USD
   */
  getTotalCost() {
    return this.costRecords.reduce((total, record) => total + (record.cost || 0), 0);
  }
}

// Create a singleton instance
let globalCostLogger = null;

/**
 * Get the global cost logger instance
 * @returns {CostLogger} Cost logger instance
 */
function getCostLogger() {
  if (!globalCostLogger) {
    globalCostLogger = new CostLogger();
  }
  return globalCostLogger;
}

module.exports = {
  CostLogger,
  getCostLogger
};