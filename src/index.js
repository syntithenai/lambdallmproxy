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
const stopTranscriptionEndpoint = require('./endpoints/stop-transcription');
const transcribeEndpoint = require('./endpoints/transcribe');
const { oauthCallbackEndpoint, oauthRefreshEndpoint, oauthRevokeEndpoint } = require('./endpoints/oauth');
const { resetMemoryTracker } = require('./utils/memory-tracker');

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
    // Initialize memory tracking for this invocation
    const memoryTracker = resetMemoryTracker();
    memoryTracker.snapshot('handler-start');
    
    try {
        console.log('Incoming request:', {
            path: event.path || event.rawPath,
            method: event.httpMethod || event.requestContext?.http?.method,
            headers: event.headers
        });
        
        // Get HTTP method and path
        const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
        const path = event.path || event.rawPath || '/';
        
        // Track memory after initial setup
        memoryTracker.snapshot('routing-setup');
        
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
        
        if (method === 'POST' && path === '/stop-transcription') {
            console.log('Routing to stop-transcription endpoint');
            // Note: Stop endpoint returns standard response, not streaming
            const stopResponse = await stopTranscriptionEndpoint.handler(event);
            const metadata = {
                statusCode: stopResponse.statusCode,
                headers: stopResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(stopResponse.body);
            responseStream.end();
            return;
        }
        
        if (method === 'POST' && path === '/transcribe') {
            console.log('Routing to transcribe endpoint');
            console.log('Request body type:', typeof event.body);
            console.log('Request body length:', event.body ? event.body.length : 0);
            console.log('Is base64:', event.isBase64Encoded);
            
            // Note: Transcribe endpoint returns standard response, not streaming  
            const transcribeResponse = await transcribeEndpoint.handler(event);
            console.log('Transcribe response status:', transcribeResponse.statusCode);
            console.log('Transcribe response headers:', transcribeResponse.headers);
            
            const metadata = {
                statusCode: transcribeResponse.statusCode,
                headers: transcribeResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(transcribeResponse.body);
            responseStream.end();
            return;
        }
        
        // OAuth2 endpoints (buffered responses)
        if (method === 'GET' && path === '/oauth/callback') {
            console.log('Routing to OAuth callback endpoint');
            const oauthResponse = await oauthCallbackEndpoint(event);
            const metadata = {
                statusCode: oauthResponse.statusCode,
                headers: oauthResponse.headers
            };
            const httpResponseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            httpResponseStream.write(oauthResponse.body);
            httpResponseStream.end();
            console.log('OAuth callback response sent');
            return;
        }
        
        if (method === 'POST' && path === '/oauth/refresh') {
            console.log('Routing to OAuth refresh endpoint');
            const refreshResponse = await oauthRefreshEndpoint(event);
            const metadata = {
                statusCode: refreshResponse.statusCode,
                headers: refreshResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(refreshResponse.body);
            responseStream.end();
            return;
        }
        
        if (method === 'POST' && path === '/oauth/revoke') {
            console.log('Routing to OAuth revoke endpoint');
            const revokeResponse = await oauthRevokeEndpoint(event);
            const metadata = {
                statusCode: revokeResponse.statusCode,
                headers: revokeResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(revokeResponse.body);
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
        
        // Track memory at error point
        memoryTracker.snapshot('error');
        console.error('Memory at error:', memoryTracker.getSummary());
        
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
    } finally {
        // Final memory snapshot and logging
        memoryTracker.snapshot('handler-end');
        console.log('📊 ' + memoryTracker.getSummary());
        
        // Log detailed breakdown for analysis
        const stats = memoryTracker.getStatistics();
        console.log('Memory recommendation:', stats.recommendation);
    }
});

// Export individual endpoint handlers for testing
module.exports = {
    handler: exports.handler,
    planningEndpoint,
    searchEndpoint,
    chatEndpoint,
    proxyEndpoint,
    staticEndpoint,
    transcribeEndpoint
};