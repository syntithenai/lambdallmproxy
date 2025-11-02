/**
 * Robust JSON Parser - Handles malformed JSON from LLM responses
 * 
 * Attempts multiple strategies to extract valid JSON from text that may contain:
 * - Markdown code fences (```json ... ```)
 * - Trailing commas
 * - Extra text before/after JSON
 * - Mixed content
 */

/**
 * Parse JSON with multiple fallback strategies
 * @param {string} text - Text containing JSON (possibly malformed)
 * @param {object} options - Parsing options
 * @returns {any} Parsed JSON object
 * @throws {Error} If all parsing attempts fail
 */
function robustJsonParse(text, options = {}) {
  const { logAttempts = false } = options;
  
  if (!text || typeof text !== 'string') {
    throw new Error('Input must be a non-empty string');
  }

  const attempts = [];
  let lastError = null;

  // Strategy 1: Parse as-is
  try {
    const result = JSON.parse(text);
    if (logAttempts) console.log('✅ Strategy 1 (direct parse) succeeded');
    return result;
  } catch (e) {
    lastError = e;
    attempts.push({ strategy: 'direct', error: e.message });
    if (logAttempts) console.log('⚠️ Strategy 1 (direct parse) failed:', e.message);
  }

  // Strategy 2: Strip markdown code fences
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  try {
    const result = JSON.parse(cleaned);
    if (logAttempts) console.log('✅ Strategy 2 (remove markdown) succeeded');
    return result;
  } catch (e) {
    lastError = e;
    attempts.push({ strategy: 'markdown', error: e.message });
    if (logAttempts) console.log('⚠️ Strategy 2 (remove markdown) failed:', e.message);
  }

  // Strategy 3: Remove trailing commas
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  try {
    const result = JSON.parse(cleaned);
    if (logAttempts) console.log('✅ Strategy 3 (remove trailing commas) succeeded');
    return result;
  } catch (e) {
    lastError = e;
    attempts.push({ strategy: 'trailing-commas', error: e.message });
    if (logAttempts) console.log('⚠️ Strategy 3 (remove trailing commas) failed:', e.message);
  }

  // Strategy 4: Extract first complete JSON object
  const objectMatch = cleaned.match(/\{(?:[^{}]|(?:\{(?:[^{}]|\{[^{}]*\})*\}))*\}/);
  if (objectMatch) {
    try {
      const result = JSON.parse(objectMatch[0]);
      if (logAttempts) console.log('✅ Strategy 4 (extract object) succeeded');
      return result;
    } catch (e) {
      lastError = e;
      attempts.push({ strategy: 'extract-object', error: e.message });
      if (logAttempts) console.log('⚠️ Strategy 4 (extract object) failed:', e.message);
    }
  }

  // Strategy 5: Extract first complete JSON array
  const arrayMatch = cleaned.match(/\[(?:[^\[\]]|(?:\[(?:[^\[\]]|\[[^\[\]]*\])*\]))*\]/);
  if (arrayMatch) {
    try {
      const result = JSON.parse(arrayMatch[0]);
      if (logAttempts) console.log('✅ Strategy 5 (extract array) succeeded');
      return result;
    } catch (e) {
      lastError = e;
      attempts.push({ strategy: 'extract-array', error: e.message });
      if (logAttempts) console.log('⚠️ Strategy 5 (extract array) failed:', e.message);
    }
  }

  // Strategy 6: Fix common JSON errors
  // Replace single quotes with double quotes
  let fixed = cleaned.replace(/'/g, '"');
  // Remove comments
  fixed = fixed.replace(/\/\/.*$/gm, '');
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');
  try {
    const result = JSON.parse(fixed);
    if (logAttempts) console.log('✅ Strategy 6 (fix common errors) succeeded');
    return result;
  } catch (e) {
    lastError = e;
    attempts.push({ strategy: 'fix-errors', error: e.message });
    if (logAttempts) console.log('⚠️ Strategy 6 (fix common errors) failed:', e.message);
  }

  // All strategies failed
  const errorMsg = [
    'Failed to parse JSON after all attempts.',
    `Attempts: ${attempts.length}`,
    `Last error: ${lastError?.message || 'Unknown'}`,
    `Text preview: ${text.substring(0, 200)}...`,
    `Attempts: ${attempts.map(a => `${a.strategy}: ${a.error}`).join('; ')}`
  ].join('\n');

  throw new Error(errorMsg);
}

/**
 * Try to parse JSON, return null if fails (non-throwing version)
 * @param {string} text - Text containing JSON
 * @param {object} options - Parsing options
 * @returns {any|null} Parsed JSON or null
 */
function tryParseJson(text, options = {}) {
  try {
    return robustJsonParse(text, options);
  } catch (e) {
    if (options.logAttempts) {
      console.error('❌ JSON parsing failed completely:', e.message);
    }
    return null;
  }
}

/**
 * Extract JSON from text that may contain multiple JSON objects/arrays
 * @param {string} text - Text containing JSON
 * @returns {any[]} Array of parsed JSON objects
 */
function extractAllJson(text) {
  const results = [];
  
  // Find all JSON objects
  const objectRegex = /\{(?:[^{}]|(?:\{(?:[^{}]|\{[^{}]*\})*\}))*\}/g;
  let match;
  while ((match = objectRegex.exec(text)) !== null) {
    const parsed = tryParseJson(match[0]);
    if (parsed) results.push(parsed);
  }
  
  // Find all JSON arrays (if no objects found)
  if (results.length === 0) {
    const arrayRegex = /\[(?:[^\[\]]|(?:\[(?:[^\[\]]|\[[^\[\]]*\])*\]))*\]/g;
    while ((match = arrayRegex.exec(text)) !== null) {
      const parsed = tryParseJson(match[0]);
      if (parsed) results.push(parsed);
    }
  }
  
  return results;
}

/**
 * Validate JSON against a simple schema
 * @param {any} json - Parsed JSON to validate
 * @param {object} schema - Simple schema definition
 * @returns {boolean} True if valid
 */
function validateJsonSchema(json, schema) {
  if (!json || typeof json !== 'object') return false;
  
  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in json)) {
        console.warn(`Missing required field: ${field}`);
        return false;
      }
    }
  }
  
  // Check field types
  if (schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      if (field in json) {
        const value = json[field];
        const expectedType = fieldSchema.type;
        
        if (expectedType === 'array' && !Array.isArray(value)) {
          console.warn(`Field ${field} should be array but is ${typeof value}`);
          return false;
        }
        
        if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
          console.warn(`Field ${field} should be object but is ${typeof value}`);
          return false;
        }
        
        if (expectedType !== 'array' && expectedType !== 'object' && typeof value !== expectedType) {
          console.warn(`Field ${field} should be ${expectedType} but is ${typeof value}`);
          return false;
        }
      }
    }
  }
  
  return true;
}

module.exports = {
  robustJsonParse,
  tryParseJson,
  extractAllJson,
  validateJsonSchema
};
