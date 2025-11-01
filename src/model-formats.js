/**
 * Model-Specific Format Translation Registry
 * 
 * This module handles model-specific message format quirks that cannot be
 * handled at the provider level. Some models within the same provider (e.g.,
 * Groq-hosted OpenAI models) generate output in different formats due to
 * mixed training data.
 * 
 * Primary Use Case: gpt-oss models generate Claude/Anthropic-style syntax
 * (e.g., <function=search>) instead of OpenAI tool_calls format.
 * 
 * @module model-formats
 */

/**
 * Model Format Registry
 * 
 * Defines format requirements and cleaning patterns for specific models.
 * 
 * Structure:
 * - Key: "provider:model" format (e.g., "groq:openai/gpt-oss-20b")
 * - Value: {
 *     requiresCleaning: boolean - Whether model output needs cleaning
 *     cleaningPatterns: RegExp[] - Regex patterns to remove from output
 *     description: string - Why this model needs special handling
 *   }
 */
const MODEL_FORMATS = {
  // OpenAI gpt-oss models hosted on Groq
  // These models were trained on mixed OpenAI + Claude/Anthropic data
  // and sometimes generate Claude-style XML function syntax
  'groq:openai/gpt-oss-20b': {
    requiresCleaning: true,
    cleaningPatterns: [
      // Match JSON-like objects embedded in XML FIRST (more specific pattern)
      // e.g., <function=search>{"query": "..."}</function>
      /<function=[^>]+>\s*\{.*?\}\s*<\/function>/gs,
      
      // Match complete XML-style function calls with closing tags
      // e.g., <execute_javascript>...</execute_javascript>
      /<(execute_javascript|search_web|scrape_url|search_youtube|transcribe_url|generate_image|generate_chart)[^>]*>.*?<\/\1>/gs,
      
      // Match self-closing function tags
      // e.g., <search_web query="..." />
      /<(execute_javascript|search_web|scrape_url|search_youtube|transcribe_url|generate_image|generate_chart)[^>]*\/>/g,
      
      // Match <function=name> tags (e.g., <function=search_web>)
      /<function=[^>]+>/g,
      
      // Clean up double spaces left by removed tags (horizontal spaces only)
      / {2,}/g
    ],
    description: 'gpt-oss-20b trained on mixed OpenAI + Claude data, generates Claude XML syntax instead of tool_calls'
  },
  
  'groq:openai/gpt-oss-120b': {
    requiresCleaning: true,
    cleaningPatterns: [
      // Match JSON-like objects embedded in XML FIRST (more specific pattern)
      /<function=[^>]+>\s*\{.*?\}\s*<\/function>/gs,
      // Match complete XML-style function calls with closing tags
      /<(execute_javascript|search_web|scrape_url|search_youtube|transcribe_url|generate_image|generate_chart)[^>]*>.*?<\/\1>/gs,
      // Match self-closing function tags
      /<(execute_javascript|search_web|scrape_url|search_youtube|transcribe_url|generate_image|generate_chart)[^>]*\/>/g,
      // Match <function=name> tags
      /<function=[^>]+>/g,
      // Clean up double spaces left by removed tags (horizontal spaces only)
      / {2,}/g
    ],
    description: 'gpt-oss-120b trained on mixed OpenAI + Claude data, generates Claude XML syntax instead of tool_calls'
  }
};

/**
 * Get format configuration for a specific model
 * 
 * @param {string} model - Model identifier in "provider:model" format
 * @returns {Object|null} Format configuration or null if no special handling needed
 */
function getModelFormat(model) {
  return MODEL_FORMATS[model] || null;
}

/**
 * Check if a model requires format cleaning
 * 
 * @param {string} model - Model identifier in "provider:model" format
 * @returns {boolean} True if model output needs cleaning
 */
function requiresCleaning(model) {
  const format = getModelFormat(model);
  return format ? format.requiresCleaning : false;
}

/**
 * Clean model-specific format issues from content
 * 
 * Removes Claude/Anthropic-style XML function syntax that some models
 * incorrectly generate. This does NOT affect actual tool calls (which
 * happen via tool_calls array), only cleans up text content.
 * 
 * @param {string} content - Raw content from LLM
 * @param {string} model - Model identifier in "provider:model" format
 * @returns {string} Cleaned content with format issues removed
 */
function cleanModelContent(content, model) {
  if (!content || typeof content !== 'string') {
    return content;
  }
  
  const format = getModelFormat(model);
  if (!format || !format.requiresCleaning) {
    return content;
  }
  
  let cleaned = content;
  
  // Apply each cleaning pattern
  for (const pattern of format.cleaningPatterns) {
    // Check if this is the double-space cleanup pattern
    if (pattern.source === ' {2,}') {
      // Replace multiple spaces with single space
      cleaned = cleaned.replace(pattern, ' ');
    } else {
      // Remove other patterns
      cleaned = cleaned.replace(pattern, '');
    }
  }
  
  // Clean up excessive whitespace that may result from removing tags
  // Replace 3+ newlines with 2 newlines
  cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, '\n\n');
  
  // Trim leading/trailing whitespace
  cleaned = cleaned.trim();
  
  return cleaned;
}

/**
 * Clean streaming chunk from model
 * 
 * Same as cleanModelContent but optimized for streaming scenarios.
 * Handles partial content and maintains state across chunks if needed.
 * 
 * @param {string} chunk - Content chunk from streaming response
 * @param {string} model - Model identifier in "provider:model" format
 * @returns {string} Cleaned chunk
 */
function cleanStreamingChunk(chunk, model) {
  if (!chunk || typeof chunk !== 'string') {
    return chunk;
  }
  
  const format = getModelFormat(model);
  if (!format || !format.requiresCleaning) {
    return chunk;
  }
  
  let cleaned = chunk;
  
  // Apply cleaning patterns
  for (const pattern of format.cleaningPatterns) {
    // Check if this is the double-space cleanup pattern
    if (pattern.source === ' {2,}') {
      // Replace multiple spaces with single space
      cleaned = cleaned.replace(pattern, ' ');
    } else {
      // Remove other patterns
      cleaned = cleaned.replace(pattern, '');
    }
  }
  
  return cleaned;
}

/**
 * Get all models that require format cleaning
 * 
 * @returns {string[]} Array of model identifiers that need cleaning
 */
function getModelsRequiringCleaning() {
  return Object.keys(MODEL_FORMATS).filter(model => 
    MODEL_FORMATS[model].requiresCleaning
  );
}

/**
 * Add a new model format configuration
 * 
 * Allows dynamic registration of model-specific formats at runtime.
 * 
 * @param {string} model - Model identifier in "provider:model" format
 * @param {Object} config - Format configuration
 * @param {boolean} config.requiresCleaning - Whether cleaning is needed
 * @param {RegExp[]} config.cleaningPatterns - Array of regex patterns
 * @param {string} config.description - Description of why this model needs special handling
 */
function registerModelFormat(model, config) {
  if (!model || !config) {
    throw new Error('Model and config are required');
  }
  
  if (typeof config.requiresCleaning !== 'boolean') {
    throw new Error('config.requiresCleaning must be a boolean');
  }
  
  if (!Array.isArray(config.cleaningPatterns)) {
    throw new Error('config.cleaningPatterns must be an array');
  }
  
  MODEL_FORMATS[model] = config;
}

module.exports = {
  MODEL_FORMATS,
  getModelFormat,
  requiresCleaning,
  cleanModelContent,
  cleanStreamingChunk,
  getModelsRequiringCleaning,
  registerModelFormat
};
