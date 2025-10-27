/**
 * Token configuration constants
 * Centralized token limits and complexity-based allocation
 */

// --- Token limit configuration (optimized for comprehensive, detailed responses) ---
// Increased for Gemini models that use thinking/reasoning tokens (1200-2000 tokens for reasoning)
const MAX_TOKENS_PLANNING = Number(process.env.TOK_PLAN ?? 4096);
const MAX_TOKENS_TOOL_SYNTHESIS = Number(process.env.TOK_SYNTH ?? 1024);

// Dynamic token allocation based on complexity assessment - SIGNIFICANTLY INCREASED for verbose, detailed responses
const MAX_TOKENS_LOW_COMPLEXITY = Number(process.env.TOK_LOW ?? 2048);
const MAX_TOKENS_MEDIUM_COMPLEXITY = Number(process.env.TOK_MED ?? 4096);
const MAX_TOKENS_HIGH_COMPLEXITY = Number(process.env.TOK_HIGH ?? 8192);

const MAX_TOKENS_MATH_RESPONSE = Number(process.env.TOK_MATH ?? 1024);

// Legacy fallback (maintain compatibility)
const MAX_TOKENS_FINAL_RESPONSE = Number(process.env.TOK_FINAL ?? MAX_TOKENS_MEDIUM_COMPLEXITY);

/**
 * Function to determine token allocation based on complexity assessment
 * @param {string} complexityAssessment - 'low', 'medium', or 'high'
 * @returns {number} Token limit for the complexity level
 */
function getTokensForComplexity(complexityAssessment) {
    switch(complexityAssessment) {
        case 'low':
            return MAX_TOKENS_LOW_COMPLEXITY;
        case 'high':
            return MAX_TOKENS_HIGH_COMPLEXITY;
        case 'medium':
        default:
            return MAX_TOKENS_MEDIUM_COMPLEXITY;
    }
}

module.exports = {
    MAX_TOKENS_PLANNING,
    MAX_TOKENS_TOOL_SYNTHESIS,
    MAX_TOKENS_LOW_COMPLEXITY,
    MAX_TOKENS_MEDIUM_COMPLEXITY,
    MAX_TOKENS_HIGH_COMPLEXITY,
    MAX_TOKENS_MATH_RESPONSE,
    MAX_TOKENS_FINAL_RESPONSE,
    getTokensForComplexity
};