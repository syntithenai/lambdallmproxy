/**
 * Main Lambda Router
 * Routes requests to appropriate endpoints based on path
 * 
 * Endpoints:
 * - POST /planning - Generate research plan using Groq reasoning model
 * - POST /search - Perform DuckDuckGo search with content extraction
 * - POST /proxy - Forward requests to OpenAI-compatible endpoints
 * - GET /* - Serve static files from docs directory
 */

const planningEndpoint = require('./endpoints/planning');
const searchEndpoint = require('./endpoints/search');
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
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'content-type, authorization, origin, accept',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'CORS preflight response' })
    };
}

/**
 * Main Lambda handler with routing
 * @param {Object} event - Lambda event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Lambda response
 */
exports.handler = async (event, context) => {
    try {
        console.log('Incoming request:', {
            path: event.path || event.rawPath,
            method: event.httpMethod || event.requestContext?.http?.method,
            headers: event.headers
        });
        
        // Get HTTP method and path
        const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
        const path = event.path || event.rawPath || '/';
        
        // Handle CORS preflight
        if (method === 'OPTIONS') {
            return handleCORS(event);
        }
        
        // Route to appropriate endpoint
        if (method === 'POST' && path === '/planning') {
            console.log('Routing to planning endpoint');
            return await planningEndpoint.handler(event);
        }
        
        if (method === 'POST' && path === '/search') {
            console.log('Routing to search endpoint');
            return await searchEndpoint.handler(event);
        }
        
        if (method === 'POST' && path === '/proxy') {
            console.log('Routing to proxy endpoint');
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
        console.error('Router error:', error);
        
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

// Export individual endpoint handlers for testing
module.exports = {
    handler: exports.handler,
    planningEndpoint,
    searchEndpoint,
    proxyEndpoint,
    staticEndpoint
};