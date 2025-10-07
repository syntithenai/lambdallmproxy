/**
 * Stop Transcription Endpoint
 * 
 * Allows users to cancel long-running transcription operations.
 * 
 * POST /stop-transcription
 * Body: { tool_call_id: string }
 * 
 * Registers a stop signal that will be checked by the transcription process.
 */

const { registerStopSignal } = require('../utils/stop-signal');
const { verifyGoogleToken } = require('../auth');

/**
 * Handle stop transcription request
 * 
 * @param {Object} event - AWS Lambda event
 * @returns {Object} Response object
 */
async function handler(event) {
    try {
        // Parse request body
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (e) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid JSON in request body'
                })
            };
        }

        const { tool_call_id } = body;

        // Validate tool_call_id
        if (!tool_call_id || typeof tool_call_id !== 'string') {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'tool_call_id is required and must be a string'
                })
            };
        }

        // Verify authentication
        const authHeader = event.headers?.Authorization || event.headers?.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Missing or invalid Authorization header'
                })
            };
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        try {
            // Verify the Google OAuth token
            const payload = await verifyGoogleToken(token);
            
            if (!payload || !payload.email) {
                return {
                    statusCode: 401,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid or expired token'
                    })
                };
            }

            console.log(`Stop transcription request from ${payload.email} for tool_call_id: ${tool_call_id}`);

            // Register the stop signal
            registerStopSignal(tool_call_id);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    success: true,
                    message: 'Stop signal registered',
                    tool_call_id
                })
            };

        } catch (authError) {
            console.error('Authentication error:', authError);
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Token verification failed'
                })
            };
        }

    } catch (error) {
        console.error('Stop transcription endpoint error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: false,
                error: 'Internal server error',
                details: error.message
            })
        };
    }
}

module.exports = { handler };
