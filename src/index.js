/**
 * Main Lambda handler for intelligent search + LLM response with streaming support
 * This is the entry point that combines all the modular components
 */

// Re-export the handler from the main lambda file
const { handler } = require('./lambda_search_llm_handler');

module.exports = {
    handler
};