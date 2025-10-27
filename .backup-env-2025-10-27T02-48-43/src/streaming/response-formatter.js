/**
 * Response formatting utilities for different response types
 * Handles JSON and streaming response formatting
 */

/**
 * Format a standard JSON API response
 * @param {Object} data - Response data
 * @param {number} statusCode - HTTP status code
 * @param {Object} additionalHeaders - Additional headers to include
 * @returns {Object} Formatted Lambda response
 */
function formatJsonResponse(data, statusCode = 200, additionalHeaders = {}) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            ...additionalHeaders
        },
        body: JSON.stringify(data)
    };
}

/**
 * Format a streaming SSE response
 * @param {string} body - SSE body content
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Formatted Lambda streaming response
 */
function formatStreamingResponse(body, statusCode = 200) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Transfer-Encoding': 'chunked',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        },
        body
    };
}

/**
 * Format an error response
 * @param {string} errorMessage - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} context - Additional error context
 * @returns {Object} Formatted error response
 */
function formatErrorResponse(errorMessage, statusCode = 500, context = {}) {
    return formatJsonResponse({
        error: errorMessage,
        timestamp: new Date().toISOString(),
        ...context
    }, statusCode);
}

/**
 * Format CORS preflight response
 * @returns {Object} CORS preflight response
 */
function formatCORSResponse() {
    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Max-Age': '86400'
        },
        body: ''
    };
}

module.exports = {
    formatJsonResponse,
    formatStreamingResponse,
    formatErrorResponse,
    formatCORSResponse
};