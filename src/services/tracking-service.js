/**
 * Tracking service for tool calls and LLM calls
 * Centralized tracking and logging functionality
 */

/**
 * Track a tool call execution with metadata
 * @param {Object} toolCall - The tool call object
 * @param {*} response - The response from the tool call
 * @param {number} duration - Execution duration in milliseconds
 * @param {number} tokenUse - Number of tokens used
 * @param {number} cost - Cost of the tool call
 * @returns {Object} Tracking record
 */
function trackToolCall(toolCall, response = null, duration = 0, tokenUse = 0, cost = 0) {
    return {
        request: {
            id: toolCall.id,
            type: toolCall.type,
            function: {
                name: toolCall.function?.name,
                arguments: toolCall.function?.arguments
            }
        },
        response: response,
        duration: duration,
        tokenUse: tokenUse,
        cost: cost,
        timestamp: new Date().toISOString()
    };
}

/**
 * Track an LLM call execution with metadata
 * @param {Object} request - The LLM request object
 * @param {Object} response - The LLM response object
 * @param {number} duration - Execution duration in milliseconds
 * @param {number} tokenUse - Number of tokens used
 * @param {number} cost - Cost of the LLM call
 * @returns {Object} Tracking record
 */
function trackLLMCall(request, response, duration = 0, tokenUse = 0, cost = 0) {
    return {
        request: {
            model: request.model,
            messages: request.messages?.map(m => ({ role: m.role, content: m.content })),
            tools: request.tools?.length || 0,
            temperature: request.temperature,
            max_tokens: request.max_tokens
        },
        response: {
            content: response.content || response.text || '',
            tool_calls: response.tool_calls || [],
            finish_reason: response.finish_reason,
            usage: response.usage
        },
        duration: duration,
        tokenUse: tokenUse,
        cost: cost,
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    trackToolCall,
    trackLLMCall
};