/**
 * Parse Image Command Endpoint
 * Uses LLM to parse natural language image editing commands into structured operations
 * 
 * Endpoint: POST /parse-image-command
 * 
 * Request Body:
 * {
 *   command: string (e.g., "make it smaller and rotate right")
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   operations: Array<BulkOperation>,
 *   explanation: string
 * }
 */

const { verifyGoogleToken } = require('../auth');
const { imageEditTools, parseImageEditCommand } = require('../tools/image-edit-tools');
const { logToGoogleSheets } = require('../services/google-sheets-logger');
const { getOrEstimateUsage } = require('../utils/token-estimation');

/**
 * Call Groq API for LLM inference
 */
async function callGroq(messages, tools) {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY not configured');
    }
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.1,
            max_tokens: 500
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Groq API error: ${response.status} ${error}`);
    }
    
    return await response.json();
}

/**
 * Main handler for parse-image-command endpoint
 */
async function handler(event, responseStream, context) {
    const origin = event.headers?.origin || event.headers?.Origin || '*';
    
    try {
        // Parse request body
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        const { command } = body;
        
        if (!command || typeof command !== 'string') {
            const errorResponse = {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Google-OAuth-Token'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Command is required and must be a string'
                })
            };
            
            const metadata = {
                statusCode: errorResponse.statusCode,
                headers: errorResponse.headers
            };
            responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
            responseStream.write(errorResponse.body);
            responseStream.end();
            return;
        }
        
        // Verify authentication (optional but recommended)
        const googleToken = event.headers?.['x-google-oauth-token'] || event.headers?.['X-Google-OAuth-Token'];
        let userEmail = 'anonymous';
        if (googleToken) {
            try {
                const payload = await verifyGoogleToken(googleToken);
                userEmail = payload.email || 'anonymous';
                console.log('✅ Google OAuth token verified for:', userEmail);
            } catch (error) {
                console.warn('⚠️ Google OAuth verification failed:', error.message);
            }
        }
        
        // Call LLM to parse command
        console.log('🤖 Parsing image command with LLM:', command);
        const startTime = Date.now();
        
        const llmResponse = await callGroq(
            [
                {
                    role: 'system',
                    content: 'You are an image editing command parser. Convert natural language image editing requests into structured operations. Be precise and literal - only generate operations that are explicitly requested.'
                },
                {
                    role: 'user',
                    content: `Parse this image editing command: "${command}"\n\nRespond with the appropriate image operations.`
                }
            ],
            imageEditTools
        );
        
        // Extract tool calls from response
        let operations = [];
        let explanation = '';
        
        if (llmResponse.choices?.[0]?.message?.tool_calls) {
            const toolCall = llmResponse.choices[0].message.tool_calls[0];
            if (toolCall.function.name === 'edit_images') {
                const parsed = parseImageEditCommand(toolCall.function);
                if (parsed.success) {
                    operations = parsed.operations;
                    explanation = `Parsed "${command}" into ${operations.length} operation(s)`;
                } else {
                    explanation = `Failed to parse: ${parsed.error}`;
                }
            }
        } else if (llmResponse.choices?.[0]?.message?.content) {
            // Fallback: LLM explained but didn't use tool
            explanation = llmResponse.choices[0].message.content;
        }
        
        // If no operations parsed, provide helpful response
        if (operations.length === 0) {
            explanation = explanation || 'Could not parse command. Try commands like: "make smaller", "rotate right", "convert to jpg", "make black and white"';
        }
        
        console.log('✅ Parsed operations:', operations);
        
        const duration = Date.now() - startTime;
        
        // Calculate usage and cost
        const messages = [
            {
                role: 'system',
                content: 'You are an image editing command parser. Convert natural language image editing requests into structured operations. Be precise and literal - only generate operations that are explicitly requested.'
            },
            {
                role: 'user',
                content: `Parse this image editing command: "${command}"\n\nRespond with the appropriate image operations.`
            }
        ];
        
        const responseText = explanation;
        const usage = getOrEstimateUsage(
            llmResponse.usage,
            messages,
            responseText,
            'groq'
        );
        
        // Log to Google Sheets
        const logData = {
            timestamp: new Date().toISOString(),
            email: userEmail,
            type: 'parse_image_command',
            model: 'groq/llama-3.3-70b-versatile',
            provider: 'groq',
            tokensIn: usage.prompt_tokens,
            tokensOut: usage.completion_tokens,
            cost: usage.cost || 0,
            durationMs: duration,
            status: 'SUCCESS',
            metadata: {
                command: command.substring(0, 200),
                operationsCount: operations.length
            }
        };
        
        // Log asynchronously (don't block response)
        logToGoogleSheets(logData).catch(err => {
            console.error('Failed to log parse-image-command to Google Sheets:', err);
        });
        
        // Return successful response
        const successResponse = {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Google-OAuth-Token'
            },
            body: JSON.stringify({
                success: operations.length > 0,
                operations,
                explanation,
                original_command: command
            })
        };
        
        const metadata = {
            statusCode: successResponse.statusCode,
            headers: successResponse.headers
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(successResponse.body);
        responseStream.end();
        
    } catch (error) {
        console.error('Parse image command error:', error);
        
        const errorResponse = {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Google-OAuth-Token'
            },
            body: JSON.stringify({
                success: false,
                error: error.message,
                operations: []
            })
        };
        
        const metadata = {
            statusCode: errorResponse.statusCode,
            headers: errorResponse.headers
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
        responseStream.write(errorResponse.body);
        responseStream.end();
    }
}

module.exports = { handler };
