/**
 * Static Lambda Entry Point
 * Serves static files and provides buffered (non-streaming) proxy endpoint
 * 
 * Endpoints:
 * - GET /* - Serve static files from docs directory
 * - POST /proxy - Forward requests to OpenAI-compatible endpoints (buffered responses)
 * 
 * This Lambda uses standard buffered responses (no streaming infrastructure)
 */

const proxyEndpoint = require('./endpoints/proxy');
const staticEndpoint = require('./endpoints/static');

/**
 * Handle CORS preflight requests
 * @param {Object} event - Lambda event
 * @returns {Object} Lambda response
 */
function handleCORS(event) {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify({ message: 'CORS preflight response' })
    };
}

/**
 * Main Lambda handler for static content and buffered proxy
 * @param {Object} event - Lambda event
 * @returns {Promise<Object>} Lambda response
 */
exports.handler = async (event) => {
    try {
        console.log('Static Lambda - Incoming request:', {
            path: event.path || event.rawPath,
            method: event.httpMethod || event.requestContext?.http?.method,
            headers: Object.keys(event.headers || {})
        });
        
        // Get HTTP method and path
        const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
        const path = event.path || event.rawPath || '/';
        
        // Handle CORS preflight
        if (method === 'OPTIONS') {
            return handleCORS(event);
        }
        
        // Route to buffered proxy endpoint
        if (method === 'POST' && path === '/proxy') {
            console.log('Routing to buffered proxy endpoint');
            return await proxyEndpoint.handler(event);
        }
        
        // Default: serve static files
        if (method === 'GET') {
            console.log('Routing to static file server');
            return await staticEndpoint.handler(event);
        }
        
        // Method not allowed
        return {
            statusCode: 405,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Method not allowed',
                allowedMethods: ['GET', 'POST', 'OPTIONS']
            })
        };
        
    } catch (error) {
        console.error('Static Lambda router error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: error.message || 'Internal server error'
            })
        };
    }
};

// Export endpoints for testing
module.exports = {
    handler: exports.handler,
    proxyEndpoint,
    staticEndpoint
};
