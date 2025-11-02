/**
 * Centralized cost logger for LLM and Lambda operations
 * 
 * This service provides unified logging of costs across all endpoints,
 * ensuring consistent tracking of user billing information.
 */

const { logToGoogleSheets } = require('./google-sheets-logger');

/**
 * Log LLM API call cost to Google Sheets
 * 
 * @param {Object} options - Logging options
 * @param {string} options.userEmail - User's email address
 * @param {string} options.model - Model used
 * @param {number} options.promptTokens - Input tokens
 * @param {number} options.completionTokens - Output tokens
 * @param {number} options.cost - Calculated cost in USD
 * @param {string} options.provider - Provider type (e.g., 'openai', 'groq')
 * @param {boolean} options.isUIKey - Whether key was provided via UI (should be free)
 * @param {string} options.requestId - Request ID for tracking
 * @param {number} options.durationMs - Execution duration in milliseconds
 * @param {Object} options.metadata - Additional metadata to log
 * @param {string} options.type - Type of operation ('chat', 'image_generation', etc.)
 * @returns {Promise<void>} 
 */
async function logLLMCost({
  userEmail,
  model,
  promptTokens,
  completionTokens,
  cost,
  provider,
  isUIKey,
  requestId,
  durationMs,
  metadata = {},
  type = 'chat'
}) {
  try {
    // Log to Google Sheets
    await logToGoogleSheets({
      userEmail: userEmail || 'anonymous',
      model: model,
      type: type,
      provider: provider,  // Add provider as top-level property
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost: cost,
      durationMs: durationMs,
      timestamp: new Date().toISOString(),
      requestId: requestId,
      metadata: {
        provider: provider,  // Keep in metadata for backwards compatibility
        isUIKey: isUIKey,
        ...metadata
      }
    });
    
    console.log(`📊 Logged LLM cost for ${userEmail || 'anonymous'}: $${cost.toFixed(6)} (${type})`);
  } catch (error) {
    console.error('❌ Failed to log LLM cost to Google Sheets:', error.message);
    // Don't fail the operation if logging fails
  }
}

/**
 * Log Lambda execution cost to Google Sheets
 * 
 * @param {Object} options - Logging options
 * @param {string} options.userEmail - User's email address
 * @param {number} options.durationMs - Execution duration in milliseconds
 * @param {number} options.memoryMB - Memory used in MB
 * @param {number} options.cost - Calculated cost in USD
 * @param {string} options.requestId - Request ID for tracking
 * @param {Object} options.metadata - Additional metadata to log
 * @returns {Promise<void>} 
 */
async function logLambdaCost({
  userEmail,
  durationMs,
  memoryMB,
  cost,
  requestId,
  metadata = {}
}) {
  try {
    // Log to Google Sheets
    await logToGoogleSheets({
      userEmail: userEmail || 'anonymous',
      model: 'lambda',
      type: 'lambda_execution',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: cost,
      durationMs: durationMs,
      timestamp: new Date().toISOString(),
      requestId: requestId,
      metadata: {
        memoryMB: memoryMB,
        costPerRequest: cost,
        ...metadata
      }
    });
    
    console.log(`📊 Logged Lambda cost for ${userEmail || 'anonymous'}: $${cost.toFixed(6)}`);
  } catch (error) {
    console.error('❌ Failed to log Lambda cost to Google Sheets:', error.message);
    // Don't fail the operation if logging fails
  }
}

/**
 * Log cost for any type of operation
 * 
 * @param {Object} options - Logging options
 * @param {string} options.userEmail - User's email address
 * @param {number} options.cost - Calculated cost in USD
 * @param {string} options.operationType - Type of operation ('chat', 'image_generation', etc.)
 * @param {boolean} options.isUIKey - Whether key was provided via UI (should be free)
 * @param {string} options.requestId - Request ID for tracking
 * @param {Object} options.metadata - Additional metadata to log
 * @returns {Promise<void>} 
 */
async function logCost({
  userEmail,
  cost,
  operationType = 'unknown',
  isUIKey = false,
  requestId,
  metadata = {}
}) {
  try {
    // Log to Google Sheets
    await logToGoogleSheets({
      userEmail: userEmail || 'anonymous',
      model: operationType,
      type: operationType,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: cost,
      durationMs: 0,
      timestamp: new Date().toISOString(),
      requestId: requestId,
      metadata: {
        isUIKey: isUIKey,
        operationType: operationType,
        ...metadata
      }
    });
    
    console.log(`📊 Logged generic cost for ${userEmail || 'anonymous'}: $${cost.toFixed(6)} (${operationType})`);
  } catch (error) {
    console.error('❌ Failed to log generic cost to Google Sheets:', error.message);
    // Don't fail the operation if logging fails
  }
}

module.exports = {
  logLLMCost,
  logLambdaCost,
  logCost
};