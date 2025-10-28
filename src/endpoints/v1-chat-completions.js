/**
 * OpenAI-Compatible Chat Completions Endpoint
 * POST /v1/chat/completions
 * 
 * Provides OpenAI API-compatible chat completions with streaming support.
 * Wraps the existing /chat endpoint and transforms requests/responses.
 * 
 * Features:
 * - OpenAI request/response format
 * - Streaming via SSE (Server-Sent Events)
 * - Tool use notifications as custom SSE events
 * - API key authentication (Bearer tokens)
 * - Usage tracking in Google Sheets
 */

const crypto = require('crypto');
const { validateAPIKey, incrementTokenCount } = require('../services/api-key-manager');
const chatEndpoint = require('./chat');
const StreamingCollator = require('../services/streaming-collator');
const { logToGoogleSheets } = require('../services/google-sheets-logger');
const { createSSEStreamAdapter } = require('../streaming/sse-writer');

/**
 * Extract Bearer token from Authorization header
 * 
 * @param {Object} headers - Request headers
 * @returns {string|null} API key or null
 */
function extractAPIKey(headers) {
    const authHeader = headers?.authorization || headers?.Authorization;
    
    if (!authHeader) {
        return null;
    }
    
    // Format: "Bearer sk-..."
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
}

/**
 * Transform OpenAI request to internal format
 * 
 * @param {Object} openaiRequest - OpenAI API request
 * @returns {Object} Internal chat request format
 */
function transformRequest(openaiRequest) {
    const { messages, model, stream, temperature, max_tokens, tools, tool_choice } = openaiRequest;
    
    // Internal format expects tools in our custom format
    let internalTools = null;
    if (tools && tools.length > 0) {
        internalTools = tools.map(tool => {
            if (tool.type === 'function') {
                return {
                    type: 'function',
                    function: {
                        name: tool.function.name,
                        description: tool.function.description,
                        parameters: tool.function.parameters
                    }
                };
            }
            return tool;
        });
    }
    
    return {
        messages,
        model,
        stream: stream || false,
        temperature,
        max_tokens,
        tools: internalTools,
        tool_choice
    };
}

/**
 * Handle non-streaming chat completion
 * 
 * @param {Object} event - Lambda event
 * @param {Object} req - Request data
 * @param {Object} keyValidation - API key validation result
 * @returns {Object} Response object
 */
async function handleNonStreaming(event, req, keyValidation) {
    const chatId = `chatcmpl-${crypto.randomBytes(16).toString('hex')}`;
    const created = Math.floor(Date.now() / 1000);
    
    // Transform request to internal format
    const internalRequest = transformRequest(req);
    
    // Create a mock event for the chat endpoint
    const chatEvent = {
        ...event,
        body: JSON.stringify(internalRequest),
        headers: {
            ...event.headers,
            // Add mock Google token for internal auth bypass
            authorization: `Bearer mock-api-key-${keyValidation.userEmail}`
        },
        requestContext: {
            ...event.requestContext,
            identity: {
                userAgent: event.headers?.['user-agent'] || 'OpenAI-SDK'
            }
        }
    };
    
    // Call internal chat endpoint (non-streaming)
    // This is a simplified version - the actual implementation would need
    // to properly handle the response
    
    try {
        // For now, return a simple error indicating this needs full implementation
        return {
            statusCode: 501,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: {
                    message: 'Non-streaming mode not yet implemented. Please use stream: true.',
                    type: 'not_implemented'
                }
            })
        };
    } catch (error) {
        console.error('❌ Chat endpoint error:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: {
                    message: error.message || 'Internal server error',
                    type: 'server_error'
                }
            })
        };
    }
}

/**
 * Handle streaming chat completion
 * 
 * @param {Object} event - Lambda event
 * @param {Object} responseStream - AWS Lambda response stream
 * @param {Object} req - Request data
 * @param {Object} keyValidation - API key validation result
 * @param {Object} context - Lambda context
 */
async function handleStreaming(event, responseStream, req, keyValidation, context) {
    const chatId = `chatcmpl-${crypto.randomBytes(16).toString('hex')}`;
    const created = Math.floor(Date.now() / 1000);
    const model = req.model || 'groq/llama-3.3-70b-versatile';
    
    // Set SSE headers
    responseStream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no'
        }
    });
    
    const collator = new StreamingCollator();
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let currentToolCallIndex = -1;
    let finishReason = null;
    
    try {
        // Transform request to internal format
        const internalRequest = transformRequest(req);
        internalRequest.stream = true; // Force streaming
        
        // Create a custom event that bypasses OAuth (API key auth instead)
        const chatEvent = {
            ...event,
            body: JSON.stringify(internalRequest),
            headers: {
                ...event.headers,
                // Add a special header to bypass OAuth for REST API requests
                'x-api-key-user': keyValidation.userEmail
            },
            _isRESTAPI: true, // Flag to indicate this is a REST API request
            _userEmail: keyValidation.userEmail // Store user email for logging
        };
        
        // Create a custom response stream that captures internal events
        const internalStream = {
            chunks: [],
            write(data) {
                // Capture all writes (internal format)
                this.chunks.push(data);
            },
            end() {
                // No-op, we'll end the real stream later
            }
        };
        
        // Wrap the internal stream to intercept SSE events
        const sseAdapter = createSSEStreamAdapter(internalStream);
        
        // Store the original writeEvent to intercept it
        const originalWriteEvent = sseAdapter.writeEvent;
        let lastDeltaContent = '';
        
        sseAdapter.writeEvent = (type, data) => {
            console.log(`📨 Internal event: ${type}`, data);
            
            // Handle different event types
            if (type === 'delta' && data.content) {
                // Content delta - transform to OpenAI format
                collator.addContent(data.content);
                lastDeltaContent += data.content;
                
                const chunk = {
                    id: chatId,
                    object: 'chat.completion.chunk',
                    created,
                    model,
                    choices: [{
                        index: 0,
                        delta: {
                            content: data.content
                        },
                        finish_reason: null
                    }]
                };
                
                responseStream.write(`data: ${JSON.stringify(chunk)}\n\n`);
                
            } else if (type === 'tool_call_start') {
                // Tool call started - emit OpenAI tool_calls chunk
                collator.addToolNotification({
                    tool: data.tool || data.function?.name,
                    status: 'started',
                    data
                });
                
                currentToolCallIndex++;
                
                const toolCall = {
                    index: currentToolCallIndex,
                    id: data.id || `call_${crypto.randomBytes(8).toString('hex')}`,
                    type: 'function',
                    function: {
                        name: data.function?.name || data.tool,
                        arguments: ''
                    }
                };
                
                collator.addToolCall(toolCall);
                
                // OpenAI format for tool call start
                const chunk = {
                    id: chatId,
                    object: 'chat.completion.chunk',
                    created,
                    model,
                    choices: [{
                        index: 0,
                        delta: {
                            tool_calls: [toolCall]
                        },
                        finish_reason: null
                    }]
                };
                
                responseStream.write(`data: ${JSON.stringify(chunk)}\n\n`);
                
                // Also send custom SSE event for non-OpenAI clients
                responseStream.write(`event: tool_notification\ndata: ${JSON.stringify({
                    tool: data.tool || data.function?.name,
                    status: 'started',
                    ...data
                })}\n\n`);
                
            } else if (type === 'tool_call_result') {
                // Tool call completed
                collator.addToolNotification({
                    tool: data.tool || data.function?.name,
                    status: 'completed',
                    data
                });
                
                // Send custom SSE event
                responseStream.write(`event: tool_notification\ndata: ${JSON.stringify({
                    tool: data.tool || data.function?.name,
                    status: 'completed',
                    result: data.result,
                    ...data
                })}\n\n`);
                
            } else if (type === 'complete') {
                // Stream complete - capture usage
                if (data.usage) {
                    usage = {
                        prompt_tokens: data.usage.promptTokens || data.usage.prompt_tokens || 0,
                        completion_tokens: data.usage.completionTokens || data.usage.completion_tokens || 0,
                        total_tokens: data.usage.totalTokens || data.usage.total_tokens || 0
                    };
                }
                
                finishReason = data.finishReason || 'stop';
                
            } else if (type === 'error') {
                // Error event - forward as custom SSE event
                responseStream.write(`event: error\ndata: ${JSON.stringify(data)}\n\n`);
            }
            
            // Call original to preserve internal behavior
            originalWriteEvent.call(sseAdapter, type, data);
        };
        
        // Send initial chunk with role
        const initialChunk = {
            id: chatId,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [{
                index: 0,
                delta: {
                    role: 'assistant',
                    content: ''
                },
                finish_reason: null
            }]
        };
        
        responseStream.write(`data: ${JSON.stringify(initialChunk)}\n\n`);
        
        // Call internal chat endpoint with our custom stream
        await chatEndpoint.handler(chatEvent, sseAdapter, context);
        
        // Send final chunk with usage
        const finalChunk = {
            id: chatId,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [{
                index: 0,
                delta: {},
                finish_reason: finishReason || 'stop'
            }],
            usage
        };
        
        responseStream.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        responseStream.write('data: [DONE]\n\n');
        
        // Log to Google Sheets
        const collatedData = collator.getCollatedData();
        await logToGoogleSheets({
            userEmail: keyValidation.userEmail,
            provider: 'rest-api',
            model,
            type: 'chat',
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
            durationMs: 0, // TODO: Track actual duration
            timestamp: new Date().toISOString()
        });
        
        // Increment token count for API key
        if (usage.total_tokens > 0) {
            await incrementTokenCount(event._apiKey, usage.total_tokens);
        }
        
    } catch (error) {
        console.error('❌ Streaming error:', error);
        
        // Send error as SSE event
        responseStream.write(`event: error\ndata: ${JSON.stringify({
            error: {
                message: error.message || 'Internal server error',
                type: 'server_error'
            }
        })}\n\n`);
    } finally {
        responseStream.end();
    }
}

/**
 * Main handler for /v1/chat/completions endpoint
 * 
 * @param {Object} event - Lambda event object
 * @param {Object} responseStream - AWS Lambda response stream (for streaming)
 * @param {Object} context - Lambda context
 */
async function handler(event, responseStream, context) {
    try {
        // Extract API key
        const apiKey = extractAPIKey(event.headers);
        
        if (!apiKey) {
            // Return 401 for missing API key
            const response = {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: {
                        message: 'Missing API key. Please provide Authorization: Bearer sk-...',
                        type: 'invalid_request_error'
                    }
                })
            };
            
            // If streaming, send via responseStream
            if (responseStream) {
                responseStream = awslambda.HttpResponseStream.from(responseStream, {
                    statusCode: response.statusCode,
                    headers: response.headers
                });
                responseStream.write(response.body);
                responseStream.end();
                return;
            }
            
            return response;
        }
        
        // Validate API key
        const keyValidation = await validateAPIKey(apiKey);
        
        if (!keyValidation.valid) {
            const response = {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: {
                        message: keyValidation.reason || 'Invalid API key',
                        type: 'invalid_request_error'
                    }
                })
            };
            
            if (responseStream) {
                responseStream = awslambda.HttpResponseStream.from(responseStream, {
                    statusCode: response.statusCode,
                    headers: response.headers
                });
                responseStream.write(response.body);
                responseStream.end();
                return;
            }
            
            return response;
        }
        
        // Parse request body
        const req = JSON.parse(event.body);
        
        // Store API key in event for later use (increment token count)
        event._apiKey = apiKey;
        
        // Handle streaming vs non-streaming
        if (req.stream) {
            // Streaming mode
            await handleStreaming(event, responseStream, req, keyValidation, context);
        } else {
            // Non-streaming mode
            return await handleNonStreaming(event, req, keyValidation);
        }
        
    } catch (error) {
        console.error('❌ /v1/chat/completions error:', error);
        
        const response = {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: {
                    message: error.message || 'Internal server error',
                    type: 'server_error'
                }
            })
        };
        
        if (responseStream) {
            responseStream = awslambda.HttpResponseStream.from(responseStream, {
                statusCode: response.statusCode,
                headers: response.headers
            });
            responseStream.write(response.body);
            responseStream.end();
            return;
        }
        
        return response;
    }
}

module.exports = { handler };
