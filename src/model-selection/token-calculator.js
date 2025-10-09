/**
 * Token Calculation Module
 * 
 * Estimates token counts for messages and calculates costs
 * Uses tiktoken-like estimation for accuracy
 */

/**
 * Average characters per token for different model families
 * Based on empirical data from OpenAI and other providers
 */
const CHARS_PER_TOKEN = {
  'gpt-4': 4.0,
  'gpt-3.5': 4.0,
  'llama': 4.2,
  'mixtral': 4.1,
  'gemma': 4.3,
  'qwen': 4.0,
  'claude': 3.8,
  'gemini': 4.0,
  'default': 4.0
};

/**
 * Fixed overhead tokens per message (role, formatting, etc.)
 */
const MESSAGE_OVERHEAD_TOKENS = {
  'gpt-4': 4,        // <|im_start|>role\n + <|im_end|>\n
  'gpt-3.5': 4,
  'llama': 3,        // [INST] + [/INST]
  'default': 3
};

/**
 * Tool/function definition overhead (approximate)
 */
const TOOL_OVERHEAD_TOKENS = 50; // Per tool definition

/**
 * Detect model family from model name
 * @param {string} modelName - Model name
 * @returns {string} Model family key
 */
function detectModelFamily(modelName) {
  if (!modelName) return 'default';
  
  const name = modelName.toLowerCase();
  
  if (name.includes('gpt-4')) return 'gpt-4';
  if (name.includes('gpt-3')) return 'gpt-3.5';
  if (name.includes('llama')) return 'llama';
  if (name.includes('mixtral')) return 'mixtral';
  if (name.includes('gemma')) return 'gemma';
  if (name.includes('qwen')) return 'qwen';
  if (name.includes('claude')) return 'claude';
  if (name.includes('gemini')) return 'gemini';
  
  return 'default';
}

/**
 * Estimate tokens for a single message
 * @param {Object} message - Message object {role, content}
 * @param {string} modelFamily - Model family for estimation
 * @returns {number} Estimated token count
 */
function estimateMessageTokens(message, modelFamily = 'default') {
  if (!message) {
    return 0;
  }

  const charsPerToken = CHARS_PER_TOKEN[modelFamily] || CHARS_PER_TOKEN.default;
  const overhead = MESSAGE_OVERHEAD_TOKENS[modelFamily] || MESSAGE_OVERHEAD_TOKENS.default;

  // Count content characters
  let contentChars = 0;
  if (typeof message.content === 'string') {
    contentChars = message.content.length;
  } else if (Array.isArray(message.content)) {
    // Multi-modal content (text + images)
    for (const part of message.content) {
      if (part.type === 'text' && part.text) {
        contentChars += part.text.length;
      }
      // Note: Image tokens are handled separately
    }
  }

  // Add role characters
  if (message.role) {
    contentChars += message.role.length;
  }

  // Calculate tokens
  const contentTokens = Math.ceil(contentChars / charsPerToken);
  const totalTokens = contentTokens + overhead;

  return totalTokens;
}

/**
 * Estimate tokens for an array of messages
 * @param {Array<Object>} messages - Array of message objects
 * @param {string} modelName - Model name for family detection
 * @returns {number} Total estimated tokens
 */
function estimateMessagesTokens(messages, modelName = '') {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }

  const modelFamily = detectModelFamily(modelName);
  let totalTokens = 0;

  for (const message of messages) {
    totalTokens += estimateMessageTokens(message, modelFamily);
  }

  // Add conversation overhead (prompt formatting)
  const conversationOverhead = 3; // <|im_start|>system, etc.
  totalTokens += conversationOverhead;

  return totalTokens;
}

/**
 * Estimate tokens for tool definitions
 * @param {Array<Object>} tools - Array of tool definitions
 * @returns {number} Estimated token count
 */
function estimateToolTokens(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return 0;
  }

  // Each tool has:
  // - Name: ~5 tokens
  // - Description: ~20-50 tokens
  // - Parameters schema: ~20-100 tokens
  // Approximate: 50 tokens per tool
  return tools.length * TOOL_OVERHEAD_TOKENS;
}

/**
 * Estimate total input tokens for a request
 * @param {Object} options - Request options
 * @param {Array<Object>} options.messages - Messages array
 * @param {Array<Object>} options.tools - Tool definitions
 * @param {string} options.modelName - Model name
 * @returns {number} Total estimated input tokens
 */
function estimateInputTokens(options = {}) {
  const {
    messages = [],
    tools = [],
    modelName = ''
  } = options;

  let totalTokens = 0;

  // Message tokens
  totalTokens += estimateMessagesTokens(messages, modelName);

  // Tool tokens
  totalTokens += estimateToolTokens(tools);

  return totalTokens;
}

/**
 * Estimate output tokens based on request type and max_tokens
 * @param {Object} options - Request options
 * @param {number} options.max_tokens - Maximum output tokens requested
 * @param {string} options.requestType - Type of request (simple/complex/reasoning)
 * @returns {number} Estimated output tokens
 */
function estimateOutputTokens(options = {}) {
  const {
    max_tokens = 4096,
    requestType = 'simple'
  } = options;

  // Estimate actual usage as percentage of max_tokens
  // Most responses don't use the full max_tokens
  const utilizationRates = {
    'simple': 0.3,      // Simple queries use ~30% of max
    'complex': 0.6,     // Complex queries use ~60% of max
    'reasoning': 0.8,   // Reasoning uses ~80% of max
    'default': 0.5
  };

  const rate = utilizationRates[requestType] || utilizationRates.default;
  return Math.ceil(max_tokens * rate);
}

/**
 * Calculate cost for a request
 * @param {Object} options - Cost calculation options
 * @param {number} options.inputTokens - Number of input tokens
 * @param {number} options.outputTokens - Number of output tokens
 * @param {number} options.inputCostPerMToken - Cost per million input tokens
 * @param {number} options.outputCostPerMToken - Cost per million output tokens
 * @returns {number} Total cost in dollars
 */
function calculateCost(options = {}) {
  const {
    inputTokens = 0,
    outputTokens = 0,
    inputCostPerMToken = 0,
    outputCostPerMToken = 0
  } = options;

  const inputCost = (inputTokens / 1_000_000) * inputCostPerMToken;
  const outputCost = (outputTokens / 1_000_000) * outputCostPerMToken;

  return inputCost + outputCost;
}

/**
 * Estimate total request cost
 * @param {Object} options - Request options
 * @param {Array<Object>} options.messages - Messages array
 * @param {Array<Object>} options.tools - Tool definitions
 * @param {string} options.modelName - Model name
 * @param {number} options.max_tokens - Maximum output tokens
 * @param {string} options.requestType - Request type
 * @param {number} options.inputCostPerMToken - Input cost per million tokens
 * @param {number} options.outputCostPerMToken - Output cost per million tokens
 * @returns {Object} Cost breakdown {inputTokens, outputTokens, totalTokens, cost}
 */
function estimateRequestCost(options = {}) {
  const {
    messages = [],
    tools = [],
    modelName = '',
    max_tokens = 4096,
    requestType = 'simple',
    inputCostPerMToken = 0,
    outputCostPerMToken = 0
  } = options;

  const inputTokens = estimateInputTokens({ messages, tools, modelName });
  const outputTokens = estimateOutputTokens({ max_tokens, requestType });
  const totalTokens = inputTokens + outputTokens;

  const cost = calculateCost({
    inputTokens,
    outputTokens,
    inputCostPerMToken,
    outputCostPerMToken
  });

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cost
  };
}

/**
 * Check if a model's context window can fit the request
 * @param {number} inputTokens - Estimated input tokens
 * @param {number} maxOutputTokens - Maximum output tokens requested
 * @param {number} contextWindow - Model's context window size
 * @returns {boolean} True if request fits in context window
 */
function fitsInContextWindow(inputTokens, maxOutputTokens, contextWindow) {
  const totalRequired = inputTokens + maxOutputTokens;
  return totalRequired <= contextWindow;
}

/**
 * Get recommended max_tokens based on context window and input
 * @param {number} inputTokens - Estimated input tokens
 * @param {number} contextWindow - Model's context window size
 * @param {number} requestedMaxTokens - User's requested max_tokens
 * @returns {number} Recommended max_tokens value
 */
function getRecommendedMaxTokens(inputTokens, contextWindow, requestedMaxTokens = 4096) {
  // Reserve space for input and safety margin
  const safetyMargin = 100; // Reserve 100 tokens for safety
  const availableTokens = contextWindow - inputTokens - safetyMargin;

  if (availableTokens <= 0) {
    return 0; // Context window too small
  }

  // Return the smaller of: available tokens or requested max_tokens
  return Math.min(availableTokens, requestedMaxTokens);
}

module.exports = {
  CHARS_PER_TOKEN,
  MESSAGE_OVERHEAD_TOKENS,
  TOOL_OVERHEAD_TOKENS,
  detectModelFamily,
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateToolTokens,
  estimateInputTokens,
  estimateOutputTokens,
  calculateCost,
  estimateRequestCost,
  fitsInContextWindow,
  getRecommendedMaxTokens
};
