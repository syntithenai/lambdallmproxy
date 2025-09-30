/**
 * Token estimation and JSON parsing utilities
 */

/**
 * Estimate token count from text (rough approximation)
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
function estimateTokenCount(text) {
    if (!text || typeof text !== 'string') return 0;
    return Math.ceil(text.length / 4);
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

module.exports = {
    estimateTokenCount,
    safeParseJson,
    truncateText
};