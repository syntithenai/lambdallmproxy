/**
 * Token estimation and JSON parsing utilities
 * Provides accurate token counting for different LLM providers
 */

/**
 * Estimate token count from text (rough approximation using character count)
 * This is a simplified version based on the common rule that 1 token ≈ 4 characters
 * More accurate for English text, less accurate for other languages
 * 
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
function estimateTokenCount(text) {
    if (!text || typeof text !== 'string') return 0;
    
    // Basic character-based estimation: ~4 chars per token for English
    // This is the OpenAI/GPT standard approximation
    return Math.ceil(text.length / 4);
}

/**
 * More sophisticated token estimation that considers word boundaries and punctuation
 * Provides better accuracy than pure character division
 * 
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
function estimateTokenCountAdvanced(text) {
    if (!text || typeof text !== 'string') return 0;
    
    // Split on whitespace and punctuation to count "token-like" units
    // Each word is roughly 1-2 tokens, punctuation is often 1 token
    const words = text.trim().split(/\s+/);
    const punctuation = (text.match(/[.,!?;:(){}[\]"'`]/g) || []).length;
    
    // Estimate: words * 1.3 (average) + punctuation tokens
    const wordTokens = Math.ceil(words.length * 1.3);
    const totalTokens = wordTokens + punctuation;
    
    return Math.max(totalTokens, Math.ceil(text.length / 4));
}

/**
 * Estimate token count for message arrays (as sent to LLM APIs)
 * Accounts for message structure overhead and content
 * 
 * @param {Array} messages - Array of message objects with role and content
 * @returns {number} Estimated total token count
 */
function estimateMessagesTokens(messages) {
    if (!Array.isArray(messages)) return 0;
    
    let totalTokens = 0;
    
    for (const msg of messages) {
        // Message structure overhead: ~4 tokens per message for role, delimiters, etc.
        totalTokens += 4;
        
        // Content tokens
        if (msg.content) {
            totalTokens += estimateTokenCountAdvanced(msg.content);
        }
        
        // Tool calls add additional tokens
        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
            for (const tc of msg.tool_calls) {
                totalTokens += 3; // Function call structure overhead
                totalTokens += estimateTokenCount(tc.function?.name || '');
                totalTokens += estimateTokenCount(tc.function?.arguments || '');
            }
        }
        
        // Name field
        if (msg.name) {
            totalTokens += estimateTokenCount(msg.name);
        }
    }
    
    return totalTokens;
}

/**
 * Safe JSON parsing with fallback
 * @param {string} jsonString - JSON string to parse
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} Parsed JSON or fallback value
 */
function safeParseJson(jsonString, fallback = {}) {
    try { 
        return JSON.parse(jsonString); 
    } catch { 
        return fallback; 
    }
}

/**
 * Truncate text to maximum length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
    if (!text || typeof text !== 'string') return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Create estimated usage object when provider doesn't return usage data
 * Uses advanced token estimation for prompt and completion
 * 
 * @param {Array} messages - Array of prompt messages
 * @param {string} completionText - The generated completion text
 * @returns {Object} Usage object with estimated token counts
 */
function createEstimatedUsage(messages, completionText) {
    const promptTokens = estimateMessagesTokens(messages);
    const completionTokens = estimateTokenCountAdvanced(completionText || '');
    
    return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        estimated: true // Flag to indicate these are estimates, not actual counts
    };
}

/**
 * Check if a provider typically returns usage data
 * 
 * @param {string} provider - Provider name (openai, groq, etc.)
 * @returns {boolean} True if provider returns usage data
 */
function providerReturnsUsage(provider) {
    // Providers known to return usage data in streaming responses
    const providersWithUsage = ['openai', 'groq'];
    return providersWithUsage.includes(provider?.toLowerCase());
}

/**
 * Merge or create usage data, preferring actual over estimated
 * 
 * @param {Object|null} actualUsage - Actual usage from provider (may be null)
 * @param {Array} messages - Prompt messages for estimation
 * @param {string} completionText - Completion text for estimation
 * @returns {Object} Usage object (actual or estimated)
 */
function getOrEstimateUsage(actualUsage, messages, completionText) {
    if (actualUsage && actualUsage.total_tokens > 0) {
        // We have actual usage data - use it
        return {
            ...actualUsage,
            estimated: false
        };
    }
    
    // No usage data - create estimate
    return createEstimatedUsage(messages, completionText);
}

module.exports = {
    estimateTokenCount,
    estimateTokenCountAdvanced,
    estimateMessagesTokens,
    createEstimatedUsage,
    providerReturnsUsage,
    getOrEstimateUsage,
    safeParseJson,
    truncateText
};