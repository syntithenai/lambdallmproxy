/**
 * Main Lambda Router
 * Routes requests to appropriate endpoints based on path
 * 
 * Endpoints:
 * - POST /planning - Generate research plan using Groq reasoning model
 * - POST /search - Perform DuckDuckGo search with content extraction
 * - POST /proxy - Forward requests to OpenAI-compatible endpoints
 * - GET /* - Serve static files from docs directory
 * 
 * Uses AWS Lambda Response Streaming for Server-Sent Events (SSE)
 */

// Note: awslambda is a global object provided by Lambda runtime when using Response Streaming
// No import needed - it's automatically available

const planningEndpoint = require('./endpoints/planning');
const searchEndpoint = require('./endpoints/search');
const proxyEndpoint = require('./endpoints/proxy');
const chatEndpoint = require('./endpoints/chat');
const staticEndpoint = require('./endpoints/static');

/**
 * Handle CORS preflight requests
 * Note: CORS headers are handled by Lambda Function URL configuration
 * @param {Object} event - Lambda event
 * @returns {Object} Lambda response
 */
function handleCORS(event) {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'CORS preflight response' })
    };
}

/**
 * Main Lambda handler with routing and streaming support
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - Lambda response stream (for SSE)
 * @param {Object} context - Lambda context
 * @returns {Promise<void>} Streams response via responseStream
 */
exports.handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
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
            const corsResponse = handleCORS(event);
            const metadata = {
                statusCode: corsResponse.statusCode,
                headers: corsResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(corsResponse.body);
            responseStream.end();
            return;
        }
        
        // Route to appropriate endpoint with responseStream
        if (method === 'POST' && path === '/planning') {
            console.log('Routing to planning endpoint');
            await planningEndpoint.handler(event, responseStream);
            return;
        }
        
        if (method === 'POST' && path === '/search') {
            console.log('Routing to search endpoint');
            await searchEndpoint.handler(event, responseStream);
            return;
        }
        
        if (method === 'POST' && path === '/chat') {
            console.log('Routing to chat endpoint');
            await chatEndpoint.handler(event, responseStream);
            return;
        }
        
        if (method === 'POST' && path === '/proxy') {
            console.log('Routing to proxy endpoint (buffered)');
            // Note: Proxy endpoint returns standard response, not streaming
            const proxyResponse = await proxyEndpoint.handler(event);
            responseStream.write(JSON.stringify(proxyResponse));
            responseStream.end();
            return;
        }
        
        // Default: serve static files (non-streaming)
        if (method === 'GET') {
            console.log('Routing to static file server');
            const staticResponse = await staticEndpoint.handler(event);
            responseStream.write(JSON.stringify(staticResponse));
            responseStream.end();
            return;
        }
        
        // Method not allowed
        // Note: CORS headers handled by Lambda Function URL configuration
        const errorResponse = {
            statusCode: 405,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Method not allowed',
                allowedMethods: ['GET', 'POST', 'OPTIONS']
            })
        };
        responseStream.write(JSON.stringify(errorResponse));
        responseStream.end();
        
    } catch (error) {
        console.error('Router error:', error);
        
        // Note: CORS headers handled by Lambda Function URL configuration
        const errorResponse = {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: error.message || 'Internal server error'
            })
        };
        responseStream.write(JSON.stringify(errorResponse));
        responseStream.end();
    }
});

// Export individual endpoint handlers for testing
module.exports = {
    handler: exports.handler,
    planningEndpoint,
    searchEndpoint,
    chatEndpoint,
    proxyEndpoint,
    staticEndpoint
};