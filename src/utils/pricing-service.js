/**
 * Unified pricing service for LLM and Lambda costs with markup handling
 * 
 * This service provides consistent cost calculation across all endpoints,
 * distinguishing between UI-provided keys (free) and environment keys (with markup)
 */

// Load environment variables for markup rates
const DEFAULT_LAMBDA_MARKUP = parseFloat(process.env.LAMBDA_MARKUP || '6');
const DEFAULT_LLM_MARKUP = parseFloat(process.env.LLM_MARKUP || '25'); // 25% markup by default

/**
 * Calculate cost for LLM calls based on provider type and key source
 * 
 * ✅ PRICING SYSTEM: Applies profit margin ONLY for server-side API keys
 * - User-provided keys (UI): $0 cost (pass-through, user pays provider directly)
 * - Server-side keys (environment): LLM cost + LLM_PROFIT_MARGIN% surcharge
 * 
 * @param {Object} options - Calculation options
 * @param {string} options.model - Model name
 * @param {number} options.promptTokens - Number of prompt tokens
 * @param {number} options.completionTokens - Number of completion tokens
 * @param {Object} options.provider - Provider configuration object  
 * @param {boolean} options.isUIKey - Whether key is provided via UI (should be free)
 * @param {string} options.envType - Environment type ('dev', 'prod')
 * @returns {number} Calculated cost in USD
 */
function calculateLLMCost({ model, promptTokens, completionTokens, provider, isUIKey = false, envType = 'prod' }) {
  // If using UI-provided keys, costs are free (user pays the provider directly)
  if (isUIKey) {
    console.log(`💰 Cost calculation: $0.00 (user-provided key - no markup)`);
    return 0;
  }

  // For dev environment, costs are free for consistency
  if (envType === 'dev') {
    console.log(`💰 Cost calculation: $0.00 (development environment)`);  
    return 0;
  }

  try {
    // Get pricing from the existing PRICING catalog used in google-sheets-logger
    const { PRICING } = require('../services/google-sheets-logger');
    
    // Handle free tier models that should map to paid tier for pricing calculations
    let pricingModel = model;
    if (model && (model.includes('groq-free') || model.includes('gemini-free'))) {
      pricingModel = model.replace('-free', '');
      console.log(`💰 Mapping free tier model ${model} → ${pricingModel} for pricing`);
    }
    
    // Calculate token-based cost using PAID TIER pricing
    const pricing = PRICING[pricingModel] || { input: 0, output: 0 };
    const inputCost = (promptTokens / 1000000) * pricing.input;
    const outputCost = (completionTokens / 1000000) * pricing.output;
    const baseCost = inputCost + outputCost;
    
    // Apply surcharge for server-side keys (environment variables)
    const surcharge = parseFloat(process.env.LLM_MARGIN || DEFAULT_LLM_MARKUP) / 100;
    const totalCost = baseCost * (1 + surcharge);
    
    console.log(`💰 Cost calculation: $${baseCost.toFixed(6)} + ${(surcharge * 100).toFixed(0)}% surcharge = $${totalCost.toFixed(6)} (server-side key)`);
    
    return totalCost;
  } catch (error) {
    console.error('Error calculating LLM cost:', error);
    // Fallback to safe default
    const baseCost = (promptTokens * 0.00001 + completionTokens * 0.00003);
    const surcharge = parseFloat(process.env.LLM_MARGIN || DEFAULT_LLM_MARKUP) / 100;
    const totalCost = baseCost * (1 + surcharge);
    return totalCost;
  }
}

/**
 * Calculate Lambda execution cost with markup
 * 
 * ✅ CREDIT SYSTEM: Applies 6x profit margin to Lambda infrastructure costs
 * 
 * @param {number} executionTimeMs - Execution time in milliseconds
 * @param {string} envType - Environment type ('dev', 'prod')
 * @returns {number} Calculated cost in USD
 */
function calculateLambdaCost(executionTimeMs, envType = 'prod') {
  // For dev environment, costs are free for consistency
  if (envType === 'dev') {
    console.log(`💰 Lambda cost calculation: $0.00 (development environment)`);
    return 0;
  }
  
  // Convert memory to GB and duration to seconds
  const memoryMB = process.memoryUsage().heapTotal / 1024; // Get total memory used
  const memoryGB = memoryMB / 1024;
  const durationSeconds = executionTimeMs / 1000;
  
  // Calculate Lambda compute cost (GB-seconds)
  const computeCost = memoryGB * durationSeconds * 0.0000166667;
  
  // Calculate Lambda request cost
  const requestCost = 0.0000002;
  
  // Estimate CloudWatch Logs cost per request
  const logSize = 0.000002; // 2KB in GB
  const cloudWatchCost = (logSize * 0.50) + (logSize * 0.03 / 30);
  
  // Estimate Data Transfer Out cost per request  
  const avgResponseSize = 0.000004; // 4KB in GB
  const dataTransferCost = avgResponseSize * 0.09;
  
  // S3 storage cost (negligible)
  const s3Cost = 0.00000003;
  
  // Total AWS infrastructure cost per request
  const awsCost = computeCost + requestCost + cloudWatchCost + dataTransferCost + s3Cost;
  
  // Apply profit margin (default 6x, configurable via env var)
  const profitMargin = parseFloat(process.env.LAM_MARGIN) || DEFAULT_LAMBDA_MARKUP;
  const totalCost = awsCost * profitMargin;
  
  console.log(`💰 Lambda cost calculation: $${awsCost.toFixed(6)} + ${profitMargin}x markup = $${totalCost.toFixed(6)}`);
  
  return totalCost;
}

/**
 * Apply markup to cost
 * @param {number} cost - Base cost 
 * @param {number} markup - Markup multiplier (e.g., 2.0 = 2x markup)
 * @returns {number} Cost with markup applied
 */
function applyMarkup(cost, markup) {
  return cost * markup;
}

/**
 * Determine if key is a UI-provided key vs environment key
 * 
 * @param {Object} provider - Provider configuration object from buildProviderPool
 * @param {string} apiKey - API key to check  
 * @returns {boolean} True if key is from UI (should be free)
 */
function isUIKey(provider, apiKey) {
  // Check if this is a UI-provided key (not from environment variables)
  // UI keys are marked with source: 'user' and isServerSideKey: false in credential-pool.js
  return provider?.source === 'user' && provider?.isServerSideKey === false;
}

/**
 * Get the correct cost calculation for a given model and tokens
 * This is a unified interface to handle all LLM cost calculations consistently
 * 
 * @param {string} model - Model name
 * @param {number} promptTokens - Input tokens
 * @param {number} completionTokens - Output tokens  
 * @param {Object} provider - Provider configuration
 * @param {boolean} isUIKey - Whether this is a UI-provided key
 * @returns {Object} Cost calculation details
 */
function getCostDetails(model, promptTokens, completionTokens, provider, isUIKey = false) {
  const cost = calculateLLMCost({ model, promptTokens, completionTokens, provider, isUIKey });
  
  return {
    model,
    promptTokens,
    completionTokens,
    provider: provider?.type || 'unknown',
    isUIKey,
    cost,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  calculateLLMCost,
  calculateLambdaCost,
  applyMarkup,
  isUIKey,
  getCostDetails
};