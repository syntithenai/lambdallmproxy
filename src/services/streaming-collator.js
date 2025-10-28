/**
 * Streaming Collator Service
 * 
 * Collects and tracks intermediate data during streaming LLM responses:
 * - Tool use notifications (web search started/completed, code execution, etc.)
 * - Search results from web searches
 * - Intermediate thinking steps
 * - Full response content
 * 
 * This data is used for:
 * 1. Logging to Google Sheets (complete conversation history)
 * 2. Custom SSE events (for debugging and rich UI experiences)
 * 3. Final response metadata
 */

class StreamingCollator {
    constructor() {
        this.toolNotifications = [];
        this.searchResults = [];
        this.intermediateSteps = [];
        this.fullContent = '';
        this.toolCalls = [];
    }

    /**
     * Track tool notification
     * 
     * @param {Object} notification - Tool notification data
     * @param {string} notification.tool - Tool name (web_search, code_execution, etc.)
     * @param {string} notification.status - Status (started, completed, failed)
     * @param {Object} notification.data - Additional data (query, results, error, etc.)
     */
    addToolNotification(notification) {
        this.toolNotifications.push({
            ...notification,
            timestamp: Date.now()
        });
    }

    /**
     * Track search result
     * 
     * @param {Object} result - Search result data
     * @param {string} result.title - Page title
     * @param {string} result.url - Page URL
     * @param {string} result.snippet - Page snippet/description
     */
    addSearchResult(result) {
        this.searchResults.push(result);
    }

    /**
     * Track intermediate step (thinking, tool call, synthesizing, etc.)
     * 
     * @param {Object} step - Intermediate step data
     * @param {string} step.type - Step type (thinking, tool_call, tool_result, synthesizing)
     * @param {string} step.content - Step content
     * @param {Object} step.data - Additional data
     */
    addIntermediateStep(step) {
        this.intermediateSteps.push({
            ...step,
            timestamp: Date.now()
        });
    }

    /**
     * Accumulate content chunks
     * 
     * @param {string} chunk - Content chunk to append
     */
    addContent(chunk) {
        this.fullContent += chunk;
    }

    /**
     * Track tool call
     * 
     * @param {Object} toolCall - Tool call data
     * @param {string} toolCall.id - Tool call ID
     * @param {string} toolCall.type - Tool type (function)
     * @param {Object} toolCall.function - Function details
     * @param {string} toolCall.function.name - Function name
     * @param {string} toolCall.function.arguments - Function arguments (JSON string)
     */
    addToolCall(toolCall) {
        this.toolCalls.push(toolCall);
    }

    /**
     * Get all collated data
     * 
     * @returns {Object} Complete collated data
     */
    getCollatedData() {
        return {
            toolNotifications: this.toolNotifications,
            searchResults: this.searchResults,
            intermediateSteps: this.intermediateSteps,
            fullContent: this.fullContent,
            toolCalls: this.toolCalls
        };
    }

    /**
     * Get summary statistics
     * 
     * @returns {Object} Summary stats
     */
    getSummary() {
        return {
            toolNotificationsCount: this.toolNotifications.length,
            searchResultsCount: this.searchResults.length,
            intermediateStepsCount: this.intermediateSteps.length,
            contentLength: this.fullContent.length,
            toolCallsCount: this.toolCalls.length
        };
    }

    /**
     * Reset collator (for reuse)
     */
    reset() {
        this.toolNotifications = [];
        this.searchResults = [];
        this.intermediateSteps = [];
        this.fullContent = '';
        this.toolCalls = [];
    }
}

module.exports = StreamingCollator;
